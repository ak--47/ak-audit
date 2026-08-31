/**
 * BigQuery connection and query execution.
 *
 * Auth defaults to Application Default Credentials, which is how this tool
 * is normally run. Passing `--auth <file>` switches to a service-account
 * key and changes nothing else.
 */

import { BigQuery } from '@google-cloud/bigquery';

/** On-demand query price per TiB, used only for human-facing estimates. */
export const USD_PER_TIB = 6.25;

export interface ClientOptions {
	project: string;
	location?: string;
	/** Path to a service-account key file. Omit to use ADC. */
	authFile?: string;
}

export interface QueryResult<T = Record<string, unknown>> {
	rows: T[];
	bytesProcessed: number;
	cacheHit: boolean;
}

export function estimateCostUsd(bytes: number): number {
	return (bytes / 1024 ** 4) * USD_PER_TIB;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

export class BigQueryClient {
	readonly project: string;
	location: string | undefined;
	private readonly bq: BigQuery;

	/** Bytes billed across every non-dry-run query this client has issued. */
	bytesProcessed = 0;

	constructor(options: ClientOptions) {
		this.project = options.project;
		this.location = options.location;
		this.bq = new BigQuery({
			projectId: options.project,
			// Undefined keyFilename makes the client fall back to ADC.
			...(options.authFile ? { keyFilename: options.authFile } : {}),
		});
	}

	/** Verifies credentials and returns the identity in use. */
	async testConnection(): Promise<string> {
		const [datasets] = await this.bq.getDatasets({ maxResults: 1 });
		const mode = await this.authMode();
		return `${mode} (${datasets.length > 0 ? 'datasets visible' : 'no datasets visible'})`;
	}

	private async authMode(): Promise<string> {
		try {
			const email = await this.bq.authClient.getCredentials();
			return email?.client_email ?? 'application default credentials';
		} catch {
			return 'application default credentials';
		}
	}

	/** Detects a dataset's region so `--location` is not required. */
	async resolveLocation(dataset: string): Promise<string> {
		if (this.location) return this.location;
		const [metadata] = await this.bq.dataset(dataset).getMetadata();
		this.location = (metadata.location as string | undefined) ?? 'US';
		return this.location;
	}

	/**
	 * Estimates a query's cost without running it.
	 *
	 * Dry runs are free and, importantly, do reflect both partition pruning
	 * and TABLESAMPLE, so the estimate is trustworthy for budgeting.
	 */
	async dryRun(sql: string): Promise<number> {
		const [job] = await this.bq.createQueryJob({
			query: sql,
			dryRun: true,
			location: this.location,
			useLegacySql: false,
		});
		return Number(job.metadata?.statistics?.totalBytesProcessed ?? 0);
	}

	/** Returns the tables a query reads, exactly, at zero cost. */
	async referencedTables(sql: string): Promise<string[]> {
		const [job] = await this.bq.createQueryJob({
			query: sql,
			dryRun: true,
			location: this.location,
			useLegacySql: false,
		});
		const refs = job.metadata?.statistics?.query?.referencedTables ?? [];
		return refs.map(
			(r: { projectId: string; datasetId: string; tableId: string }) =>
				`${r.projectId}.${r.datasetId}.${r.tableId}`,
		);
	}

	async query<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>> {
		const [job] = await this.bq.createQueryJob({
			query: sql,
			location: this.location,
			useLegacySql: false,
		});
		const [rows] = await job.getQueryResults();
		const stats = job.metadata?.statistics?.query;
		const bytes = Number(stats?.totalBytesBilled ?? stats?.totalBytesProcessed ?? 0);
		this.bytesProcessed += bytes;
		return {
			rows: rows as T[],
			bytesProcessed: bytes,
			cacheHit: Boolean(stats?.cacheHit),
		};
	}

	/**
	 * Reads rows straight from storage metadata.
	 *
	 * This scans zero bytes and needs only read access, which makes it the
	 * right way to sample a table. It cannot serve views, which have no
	 * materialized rows.
	 */
	async listRows(
		dataset: string,
		table: string,
		maxResults: number,
	): Promise<Record<string, unknown>[]> {
		const [rows] = await this.bq.dataset(dataset).table(table).getRows({ maxResults });
		return rows as Record<string, unknown>[];
	}
}
