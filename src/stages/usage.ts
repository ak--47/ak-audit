/**
 * Optional stage: read query history.
 *
 * Off by default, because it costs a scan and because project-wide history
 * needs a permission many readers do not have. Enable it with `--usage`.
 */

import { join } from 'node:path';
import type { TableMeta } from '../types.ts';
import { formatBytes, type BigQueryClient } from '../warehouse/bigquery/client.ts';
import type { BudgetTracker } from '../warehouse/bigquery/budget.ts';
import { fetchUsage, type UsageResult } from '../warehouse/bigquery/usage.ts';
import { ensureLayout, readJson, writeJson } from '../output/writers.ts';
import { log } from '../util/log.ts';

export interface UsageStageOptions {
	client: BigQueryClient;
	dataset: string;
	location: string;
	tables: TableMeta[];
	outDir: string;
	days: number;
	budget: BudgetTracker;
	maxBytes: number;
	includeQueryText: boolean;
}

export async function runUsage(options: UsageStageOptions): Promise<UsageResult> {
	const dirs = await ensureLayout(options.outDir);
	log.step(`Reading query history (${options.days} days)`);

	const usage = await fetchUsage({
		client: options.client,
		dataset: options.dataset,
		location: options.location,
		days: options.days,
		knownTables: options.tables.map((t) => t.table),
		viewNames: options.tables.filter((t) => t.kind !== 'TABLE').map((t) => t.table),
		maxBytes: Math.min(options.maxBytes, options.budget.remaining),
		includeQueryText: options.includeQueryText,
	});

	options.budget.record(usage.bytesProcessed);
	await writeJson(join(dirs.root, 'usage.json'), usage);

	if (usage.scope === 'unavailable') {
		log.warn(usage.note);
		return usage;
	}

	// Only tables still in the dataset count towards "N of M read". Names that
	// have since been dropped are reported separately, or a 37-table dataset
	// claims 49 of its tables were read.
	const used = Object.values(usage.tables).filter((t) => t.present).length;
	log.info(
		`${usage.jobsSeen.toLocaleString()} jobs, ${used} of ${options.tables.length} tables read, ` +
			`${usage.topUsers.length} users — ${formatBytes(usage.bytesProcessed)}`,
	);
	if (usage.scope === 'user') log.warn(usage.note);
	if (usage.unusedTables.length > 0) {
		log.info(`${usage.unusedTables.length} table(s) not read by anyone in the window`);
	}
	if (usage.selfJobsExcluded) {
		log.detail(`${usage.selfJobsExcluded.toLocaleString()} of ak-audit's own jobs excluded`);
	}
	const absent = usage.absentTables ?? [];
	if (absent.length > 0) {
		log.info(`${absent.length} name(s) queried in the window are no longer in the dataset`);
	}
	if (usage.truncated) log.warn('job list hit its row cap; counts are a lower bound');

	return usage;
}

export async function loadUsage(outDir: string): Promise<UsageResult | null> {
	return readJson<UsageResult>(join(outDir, 'usage.json'));
}
