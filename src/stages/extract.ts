/**
 * Stage 1: extract metadata.
 *
 * Costs effectively nothing. Every read here is INFORMATION_SCHEMA, storage
 * metadata, a dry run, or the free row-listing endpoint, so an extract-only
 * run is a safe way to survey an unfamiliar dataset before spending money.
 *
 * Per-table files are written as each table finishes, so an interrupted run
 * resumes instead of starting over. That matters at the scale these tables
 * reach.
 */

import { join } from 'node:path';
import type { TableMeta } from '../types.ts';
import type { BigQueryClient } from '../warehouse/bigquery/client.ts';
import {
	derivePartitioning,
	fetchLineage,
	fetchPartitions,
	fetchSchemas,
	fetchStorage,
	listTables,
} from '../warehouse/bigquery/metadata.ts';
import { quotePath } from '../warehouse/bigquery/profileSql.ts';
import {
	ensureLayout,
	fileExists,
	plainValue,
	readJson,
	safeFileName,
	writeJson,
} from '../output/writers.ts';
import { mapWithConcurrency } from '../util/concurrency.ts';
import { log } from '../util/log.ts';

export interface ExtractOptions {
	client: BigQueryClient;
	dataset: string;
	outDir: string;
	sampleRows: number;
	tableFilter?: (name: string) => boolean;
	concurrency: number;
	force: boolean;
}

export interface ExtractResult {
	tables: TableMeta[];
	discovered: number;
	reused: number;
}

export async function runExtract(options: ExtractOptions): Promise<ExtractResult> {
	const { client, dataset, outDir, force } = options;
	const dirs = await ensureLayout(outDir);
	const location = await client.resolveLocation(dataset);

	log.step(`Extracting ${client.project}.${dataset} (${location})`);

	const all = await listTables(client, dataset);
	const selected = options.tableFilter ? all.filter((t) => options.tableFilter!(t.name)) : all;
	log.info(
		`${selected.length} of ${all.length} tables selected` +
			`${selected.length === all.length ? '' : ' by filter'}`,
	);

	// Three dataset-wide metadata reads instead of three per table.
	const [schemas, storage, partitions] = await Promise.all([
		fetchSchemas(client, dataset),
		fetchStorage(client, dataset, location),
		fetchPartitions(client, dataset),
	]);

	let reused = 0;
	const tables = await mapWithConcurrency(selected, options.concurrency, async (entry) => {
		const path = join(dirs.raw, `${safeFileName(entry.name)}.json`);

		if (!force && fileExists(path)) {
			const cached = await readJson<TableMeta>(path);
			if (cached) {
				reused++;
				log.detail(`${entry.name} (cached)`);
				return cached;
			}
		}

		const fields = schemas.get(entry.name) ?? [];
		const store = storage.get(entry.name);
		const { partitioning, clustering } = derivePartitioning(fields, entry.ddl);
		const errors: string[] = [];

		const isView = entry.kind === 'VIEW' || entry.kind === 'MATERIALIZED_VIEW';
		let references: string[] = [];
		if (isView) {
			try {
				references = await fetchLineage(
					client,
					`${client.project}.${dataset}.${entry.name}`,
				);
			} catch (error) {
				errors.push(`lineage unavailable: ${message(error)}`);
			}
		}

		const { samples, source, error } = await fetchSamples(
			client,
			dataset,
			entry.name,
			isView,
			options.sampleRows,
		);
		if (error) errors.push(error);

		const meta: TableMeta = {
			project: client.project,
			dataset,
			table: entry.name,
			fullName: `${client.project}.${dataset}.${entry.name}`,
			kind: entry.kind,
			rowCount: store?.rowCount ?? null,
			bytes: store?.bytes ?? null,
			created: store?.created ?? entry.created,
			lastModified: store?.lastModified ?? null,
			partitioning,
			clustering,
			partitions: partitions.get(entry.name) ?? [],
			ddl: entry.ddl,
			description: null,
			schema: fields,
			references,
			samples,
			sampleSource: source,
			errors,
		};

		await writeJson(path, meta);
		log.detail(
			`${entry.name} — ${fields.length} fields, ${samples.length} sample rows` +
				(references.length > 0 ? `, reads ${references.length} table(s)` : ''),
		);
		return meta;
	});

	return { tables, discovered: all.length, reused };
}

/**
 * Samples rows as cheaply as possible.
 *
 * The storage row-listing endpoint scans zero bytes, so it is always tried
 * first. Views have no materialized rows and must fall back to a query,
 * which is the only place stage 1 can cost anything at all.
 */
async function fetchSamples(
	client: BigQueryClient,
	dataset: string,
	table: string,
	isView: boolean,
	limit: number,
): Promise<{ samples: Record<string, unknown>[]; source: 'rest' | 'query' | 'none'; error?: string }> {
	if (!isView) {
		try {
			const rows = await client.listRows(dataset, table, limit);
			return { samples: rows.map((r) => plainValue(r) as Record<string, unknown>), source: 'rest' };
		} catch (error) {
			return { samples: [], source: 'none', error: `sampling failed: ${message(error)}` };
		}
	}

	const sql = `SELECT * FROM ${quotePath(`${client.project}.${dataset}.${table}`)} LIMIT ${limit}`;
	try {
		const { rows } = await client.query(sql);
		return { samples: rows.map((r) => plainValue(r) as Record<string, unknown>), source: 'query' };
	} catch (error) {
		return { samples: [], source: 'none', error: `view sampling failed: ${message(error)}` };
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
