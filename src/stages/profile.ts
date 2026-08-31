/**
 * Stage 2: profile columns.
 *
 * The only stage that spends money, so every query passes through a dry run
 * and a budget check first. A table that breaks the budget is skipped whole
 * and recorded with its reason — never partially profiled, because a
 * half-filled profile is indistinguishable from a complete one downstream.
 */

import { join } from 'node:path';
import type { ColumnStats, TableMeta, TableProfile, TopValue } from '../types.ts';
import { estimateCostUsd, formatBytes, type BigQueryClient } from '../warehouse/bigquery/client.ts';
import { BudgetTracker, planScan, type ScanPlan } from '../warehouse/bigquery/budget.ts';
import { buildProfileChunks, type StatKind } from '../warehouse/bigquery/profileSql.ts';
import { selectJoinCandidates } from '../analyze/candidates.ts';
import { ensureLayout, fileExists, readJson, safeFileName, writeJson } from '../output/writers.ts';
import { mapWithConcurrency } from '../util/concurrency.ts';
import { log } from '../util/log.ts';

export interface ProfileOptions {
	client: BigQueryClient;
	tables: TableMeta[];
	outDir: string;
	budget: BudgetTracker;
	concurrency: number;
	force: boolean;
	/** Dry-run everything, print the projected cost, execute nothing. */
	estimateOnly: boolean;
	partitionLookback: number;
	fullScan: boolean;
}

export interface ProfileResult {
	profiles: TableProfile[];
	estimatedBytes: number;
}

export async function runProfile(options: ProfileOptions): Promise<ProfileResult> {
	const { client, tables, outDir, budget, estimateOnly } = options;
	const dirs = await ensureLayout(outDir);

	log.step(estimateOnly ? 'Estimating profile cost' : 'Profiling columns');

	// Candidate selection needs the whole dataset, since "this name appears
	// in several tables" is one of the strongest cheap signals available.
	const candidates = selectJoinCandidates(tables);

	let estimatedBytes = 0;

	const profiles = await mapWithConcurrency(tables, options.concurrency, async (table) => {
		const path = join(dirs.profile, `${safeFileName(table.table)}.json`);

		if (!options.force && !estimateOnly && fileExists(path)) {
			const cached = await readJson<TableProfile>(path);
			if (cached) {
				log.detail(`${table.table} (cached)`);
				return cached;
			}
		}

		const sketchPaths = candidates.byTable.get(table.fullName) ?? new Set<string>();
		const plan = planScan({
			partitioning: table.partitioning,
			partitions: table.partitions,
			rowCount: table.rowCount,
			lookback: options.partitionLookback,
			full: options.fullScan,
		});

		const profile = await profileTable({
			client,
			table,
			plan,
			sketchPaths,
			budget,
			estimateOnly,
		});

		estimatedBytes += profile.bytesProcessed;
		if (!estimateOnly) await writeJson(path, profile);
		return profile;
	});

	return { profiles, estimatedBytes };
}

interface ProfileTableArgs {
	client: BigQueryClient;
	table: TableMeta;
	plan: ScanPlan;
	sketchPaths: Set<string>;
	budget: BudgetTracker;
	estimateOnly: boolean;
}

async function profileTable(args: ProfileTableArgs): Promise<TableProfile> {
	const { client, table, plan, sketchPaths, budget, estimateOnly } = args;

	const empty: TableProfile = {
		table: table.fullName,
		strategy: null,
		strategyDetail: plan.detail,
		bytesProcessed: 0,
		estimatedCostUsd: 0,
		rowsScanned: null,
		chunks: 0,
		columns: {},
		skipped: null,
		errors: [],
	};

	if (table.schema.length === 0) {
		return { ...empty, skipped: 'no readable schema' };
	}

	const chunks = buildProfileChunks({
		fullName: table.fullName,
		fields: table.schema,
		sketchPaths,
		...(plan.whereClause ? { whereClause: plan.whereClause } : {}),
		...(plan.tablesamplePercent ? { tablesamplePercent: plan.tablesamplePercent } : {}),
	});

	// Price the whole table before running any part of it, so a table is
	// never left half-profiled by a budget that runs out mid-way.
	let estimate = 0;
	const errors: string[] = [];
	for (const chunk of chunks) {
		try {
			estimate += await client.dryRun(chunk.sql);
		} catch (error) {
			errors.push(`dry run failed: ${message(error)}`);
		}
	}

	if (errors.length > 0) {
		log.warn(`${table.table}: ${errors[0]}`);
		return { ...empty, skipped: errors[0]!, errors };
	}

	const decision = budget.check(table.table, estimate);
	if (!decision.allowed) {
		log.warn(`${table.table} skipped — ${decision.reason}`);
		return {
			...empty,
			bytesProcessed: estimate,
			estimatedCostUsd: estimateCostUsd(estimate),
			skipped: decision.reason,
		};
	}

	if (estimateOnly) {
		log.detail(
			`${table.table} — ${formatBytes(estimate)} ` +
				`(~$${estimateCostUsd(estimate).toFixed(2)}), ${plan.detail}`,
		);
		return {
			...empty,
			strategy: plan.strategy,
			bytesProcessed: estimate,
			estimatedCostUsd: estimateCostUsd(estimate),
			chunks: chunks.length,
		};
	}

	const columns: Record<string, ColumnStats> = {};
	let rowsScanned: number | null = null;
	let bytes = 0;

	for (const chunk of chunks) {
		for (const path of chunk.unreachable) {
			columns[path] = blankStats(path, 'inside a repeated field; needs UNNEST to profile');
		}
		try {
			const { rows, bytesProcessed } = await client.query(chunk.sql);
			bytes += bytesProcessed;
			budget.record(bytesProcessed);

			const row = rows[0] ?? {};
			rowsScanned = toNumber(row['row_count']) ?? rowsScanned;
			collectStats(row, chunk.aliasMap, columns, rowsScanned);
		} catch (error) {
			errors.push(`chunk failed: ${message(error)}`);
		}
	}

	// Any column the scan never reported gets an explicit marker, so a
	// missing stat is always distinguishable from a measured null.
	for (const field of table.schema) {
		columns[field.path] ??= blankStats(field.path, 'not profiled');
	}

	log.detail(
		`${table.table} — ${formatBytes(bytes)}, ${chunks.length} chunk(s), ${plan.detail}`,
	);

	return {
		table: table.fullName,
		strategy: plan.strategy,
		strategyDetail: plan.detail,
		bytesProcessed: bytes,
		estimatedCostUsd: estimateCostUsd(bytes),
		rowsScanned,
		chunks: chunks.length,
		columns,
		skipped: null,
		errors,
	};
}

function blankStats(path: string, skipped: string | null): ColumnStats {
	return {
		path,
		nullCount: null,
		nullRate: null,
		ndv: null,
		min: null,
		max: null,
		topValues: [],
		arrayStats: null,
		sketch: null,
		skipped,
	};
}

/** Reads the single wide result row back into per-column statistics. */
function collectStats(
	row: Record<string, unknown>,
	aliasMap: Record<string, { path: string; kind: StatKind }>,
	columns: Record<string, ColumnStats>,
	rowsScanned: number | null,
): void {
	for (const [alias, { path, kind }] of Object.entries(aliasMap)) {
		const stats = (columns[path] ??= blankStats(path, null));
		const value = row[alias];

		switch (kind) {
			case 'nullCount': {
				stats.nullCount = toNumber(value);
				stats.nullRate =
					stats.nullCount !== null && rowsScanned && rowsScanned > 0
						? Math.round((stats.nullCount / rowsScanned) * 10000) / 10000
						: null;
				break;
			}
			case 'ndv':
				stats.ndv = toNumber(value);
				break;
			case 'min':
				stats.min = toScalarString(value);
				break;
			case 'max':
				stats.max = toScalarString(value);
				break;
			case 'topValues':
				stats.topValues = toTopValues(value);
				break;
			case 'sketch':
				stats.sketch = typeof value === 'string' ? value : null;
				break;
			case 'arrayElements': {
				const total = toNumber(value) ?? 0;
				stats.arrayStats = {
					totalElements: total,
					maxLength: stats.arrayStats?.maxLength ?? 0,
					avgLength:
						rowsScanned && rowsScanned > 0
							? Math.round((total / rowsScanned) * 100) / 100
							: 0,
				};
				break;
			}
			case 'arrayMaxLength': {
				stats.arrayStats = {
					totalElements: stats.arrayStats?.totalElements ?? 0,
					maxLength: toNumber(value) ?? 0,
					avgLength: stats.arrayStats?.avgLength ?? 0,
				};
				break;
			}
		}
		stats.skipped = null;
	}
}

function toNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'bigint') return Number(value);
	const n = Number(typeof value === 'object' && 'value' in value ? (value as { value: unknown }).value : value);
	return Number.isFinite(n) ? n : null;
}

function toScalarString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'object' && 'value' in value) {
		return String((value as { value: unknown }).value);
	}
	return String(value);
}

function toTopValues(value: unknown): TopValue[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => {
			const e = entry as { value?: unknown; count?: unknown };
			return {
				value: e.value === null || e.value === undefined ? null : toScalarString(e.value),
				count: toNumber(e.count) ?? 0,
			};
		})
		.sort((a, b) => b.count - a.count);
}

function message(error: unknown): string {
	return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
