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
import { formatBytes, type BigQueryClient, type TableFacts } from '../warehouse/bigquery/client.ts';
import {
	derivePartitioning,
	fetchLineage,
	fetchPartitions,
	fetchSchemas,
	fetchStorage,
	fetchTableOptions,
	listTables,
	resolveRowCount,
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
import type { BudgetTracker } from '../warehouse/bigquery/budget.ts';
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
	/** Run a real COUNT(*) where no free source can give an exact count. */
	exactRowCounts: boolean;
	/** Ceiling on what one exact count may scan. */
	countBudgetBytes?: number;
	/**
	 * Run-wide spend tracker.
	 *
	 * Extraction is nearly free, but the two things in it that can cost
	 * anything -- an exact count over a view, and sampling a view -- scale
	 * with table count. Across hundreds of views that is no longer noise, so
	 * they draw from the same budget the profile stage does.
	 */
	budget?: BudgetTracker;
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
	const [schemas, storage, partitions, tableOptions] = await Promise.all([
		fetchSchemas(client, dataset),
		fetchStorage(client, dataset, location),
		fetchPartitions(client, dataset),
		fetchTableOptions(client, dataset),
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
		const tablePartitions = partitions.get(entry.name) ?? [];
		const { partitioning, clustering } = derivePartitioning(fields, entry.ddl);
		const errors: string[] = [];

		// The table's own metadata needs only dataset-level access, unlike
		// the region-level storage view, so this is often the only source of
		// row counts available at all.
		let facts: TableFacts | null = null;
		try {
			facts = await client.tableMetadata(dataset, entry.name);
		} catch (error) {
			errors.push(`table metadata unavailable: ${message(error)}`);
		}

		const counted = await resolveRowCount(client, {
			fullName: `${client.project}.${dataset}.${entry.name}`,
			kind: entry.kind,
			partitions: tablePartitions,
			facts,
			storageRows: store?.rowCount ?? null,
			skipCountQuery: !options.exactRowCounts,
			countBudgetBytes: options.countBudgetBytes,
			budget: options.budget,
		});
		if (counted.error) errors.push(counted.error);

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
			options.countBudgetBytes,
			options.budget,
		);
		if (error) errors.push(error);

		const meta: TableMeta = {
			project: client.project,
			dataset,
			table: entry.name,
			fullName: `${client.project}.${dataset}.${entry.name}`,
			kind: entry.kind,
			rowCount: counted.rowCount,
			rowCountSource: counted.source,
			bytes: facts?.numBytes ?? store?.bytes ?? null,
			requirePartitionFilter: facts?.requirePartitionFilter ?? false,
			created: facts?.created ?? store?.created ?? entry.created,
			lastModified: facts?.lastModified ?? store?.lastModified ?? null,
			partitioning,
			clustering,
			partitions: tablePartitions,
			ddl: entry.ddl,
			description: tableOptions.get(entry.name)?.description ?? null,
			labels: tableOptions.get(entry.name)?.labels ?? {},
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
	budgetBytes = 20 * 1024 ** 3,
	budget?: BudgetTracker,
): Promise<{ samples: Record<string, unknown>[]; source: 'rest' | 'query' | 'none'; error?: string }> {
	// Zero means "do not sample", and it must short-circuit before any call.
	// The row-listing endpoint treats maxResults 0 as unset and streams the
	// whole table, which is fatal on a 154-million-row one — exactly the
	// tables someone passes --samples 0 to avoid touching.
	if (limit <= 0) return { samples: [], source: 'none' };

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
		// A LIMIT does not bound what a view scans: the view's own query runs
		// first, and one over a 47 TB table costs the same twenty rows or not.
		// Extraction is meant to be nearly free, so price this before running it.
		const estimate = await client.dryRun(sql);
		const decision = budget?.check(table, estimate);
		if (decision && !decision.allowed) {
			return { samples: [], source: 'none', error: `view sampling skipped: ${decision.reason}` };
		}
		if (estimate > budgetBytes) {
			return {
				samples: [],
				source: 'none',
				error: `view sampling skipped: would scan ${formatBytes(estimate)}`,
			};
		}
		const { rows, bytesProcessed } = await client.query(sql);
		budget?.record(bytesProcessed);
		return { samples: rows.map((r) => plainValue(r) as Record<string, unknown>), source: 'query' };
	} catch (error) {
		return { samples: [], source: 'none', error: `view sampling failed: ${message(error)}` };
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
