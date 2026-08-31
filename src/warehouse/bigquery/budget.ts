/**
 * Cost control for the profile stage.
 *
 * This is the tool's primary safety property, not a convenience. Tables in
 * a real project reach 552 TB and a trillion rows; profiling three columns
 * of one such table without a partition filter was measured at 53.2 TB, or
 * about $332. The same query restricted to one populated day cost $0.25 --
 * a 1,357x reduction.
 *
 * The strategy, in order of preference:
 *
 *   1. Prune to recent populated partitions, chosen from free metadata.
 *   2. Fall back to TABLESAMPLE for large unpartitioned tables. Dry runs do
 *      reflect sampling, so the saving is real and measurable in advance.
 *   3. Dry-run whatever query results and refuse it if it breaks the budget.
 *
 * A table over budget is skipped whole and recorded with a reason. It is
 * never silently truncated, because a half-profiled table looks like a
 * complete one to whoever reads the output next.
 */

import type { PartitionInfo, PartitioningConfig, ScanStrategy } from '../../types.ts';
import { estimateCostUsd, formatBytes } from './client.ts';
import { quotePath } from './profileSql.ts';

export interface BudgetLimits {
	/** Refuse to profile a single table above this many bytes. */
	maxBytesPerTable: number;
	/** Stop profiling once the run has spent this many bytes. */
	maxBytesTotal: number;
}

export const DEFAULT_LIMITS: BudgetLimits = {
	maxBytesPerTable: 50 * 1024 ** 3, // 50 GB
	maxBytesTotal: 500 * 1024 ** 3, // 500 GB
};

/** Rows above which an unpartitioned table gets sampled instead of scanned. */
export const SAMPLE_THRESHOLD_ROWS = 5_000_000;

/** Populated partitions to include when pruning. */
export const DEFAULT_PARTITION_LOOKBACK = 3;

export interface ScanPlan {
	strategy: ScanStrategy;
	detail: string;
	whereClause?: string;
	tablesamplePercent?: number;
	/** The table demands a filter that could not be built; do not query it. */
	unfilterable?: boolean;
}

/**
 * A BigQuery partition id is `YYYYMMDD`, `YYYYMMDDHH`, `YYYYMM`, `YYYY`, or
 * an integer range start. `__NULL__` and `__UNPARTITIONED__` are real ids
 * that hold stray rows and must never be turned into a date predicate.
 */
function isSpecialPartition(id: string): boolean {
	return id.startsWith('__');
}

/**
 * Renders a boundary as a literal of the partition column's own type.
 *
 * A DATE column will not compare against a TIMESTAMP: BigQuery rejects it
 * with "No matching signature for operator >=". Measured on a table
 * partitioned by MONTH over a DATE column.
 */
function boundaryLiteral(iso: string, columnType: string): string {
	switch (columnType.toUpperCase()) {
		case 'DATE':
			return `DATE "${iso.slice(0, 10)}"`;
		case 'DATETIME':
			return `DATETIME "${iso}"`;
		default:
			return `TIMESTAMP "${iso}"`;
	}
}

function partitionPredicate(
	field: string,
	granularity: string,
	kind: PartitioningConfig['kind'],
	ids: string[],
	columnType: string,
): string | null {
	const usable = ids.filter((id) => !isSpecialPartition(id));
	if (usable.length === 0) return null;

	const column = kind === 'ingestion-time' ? '`_PARTITIONTIME`' : quotePath(field);

	if (kind === 'range') {
		const nums = usable.map(Number).filter(Number.isFinite);
		if (nums.length === 0) return null;
		return `${column} BETWEEN ${Math.min(...nums)} AND ${Math.max(...nums)}`;
	}

	const bounds = usable.map((id) => partitionBounds(id, granularity)).filter((b) => b !== null);
	if (bounds.length === 0) return null;

	const start = bounds.map((b) => b!.start).sort()[0]!;
	const end = bounds.map((b) => b!.end).sort().at(-1)!;

	// A half-open range keeps the predicate prunable, which a function call
	// on the partition column would not be.
	const type = kind === 'ingestion-time' ? 'TIMESTAMP' : columnType;
	return `${column} >= ${boundaryLiteral(start, type)} AND ${column} < ${boundaryLiteral(end, type)}`;
}

function partitionBounds(id: string, granularity: string): { start: string; end: string } | null {
	const g = granularity.toUpperCase();
	let start: Date;
	let end: Date;

	if (g === 'HOUR' && id.length === 10) {
		start = new Date(Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8), +id.slice(8, 10)));
		end = new Date(start.getTime() + 3600_000);
	} else if (g === 'MONTH' && id.length === 6) {
		start = new Date(Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, 1));
		end = new Date(Date.UTC(+id.slice(0, 4), +id.slice(4, 6), 1));
	} else if (g === 'YEAR' && id.length === 4) {
		start = new Date(Date.UTC(+id, 0, 1));
		end = new Date(Date.UTC(+id + 1, 0, 1));
	} else if (id.length === 8) {
		start = new Date(Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8)));
		end = new Date(start.getTime() + 86_400_000);
	} else {
		return null;
	}

	if (Number.isNaN(start.getTime())) return null;
	return { start: iso(start), end: iso(end) };
}

function iso(d: Date): string {
	return d.toISOString().replace('T', ' ').replace('.000Z', '');
}

export interface PlanScanOptions {
	partitioning: PartitioningConfig | null;
	partitions: PartitionInfo[];
	rowCount: number | null;
	lookback?: number;
	/** Profile the whole table regardless of size. */
	full?: boolean;
	/** Declared type of the partition column, so literals match it. */
	partitionColumnType?: string;
	/**
	 * The table rejects any query without a partition filter.
	 *
	 * This is a hard constraint rather than a cost concern: BigQuery refuses
	 * the query outright. If no predicate can be built, the table cannot be
	 * profiled at all and must be skipped.
	 */
	requirePartitionFilter?: boolean;
}

/** Returned when a table demands a filter that cannot be constructed. */
export const UNFILTERABLE = 'requires a partition filter, but no populated partition was found';

/**
 * Chooses how much of a table to read.
 *
 * Partition pruning is preferred because it is exact and by far the largest
 * saving. Sampling is the fallback for big unpartitioned tables, where no
 * predicate can help.
 */
export function planScan(options: PlanScanOptions): ScanPlan {
	const { partitioning, partitions, rowCount, full } = options;
	const lookback = options.lookback ?? DEFAULT_PARTITION_LOOKBACK;
	const mustFilter = Boolean(options.requirePartitionFilter);

	// `--full` cannot override a table that refuses unfiltered queries.
	if (full && !mustFilter) return { strategy: 'full', detail: 'full table scan (--full)' };

	const populated = partitions.filter((p) => p.rows > 0 && !isSpecialPartition(p.partitionId));

	if (partitioning && populated.length > 0) {
		// Newest partitions first: recent data is what people ask about.
		const recent = [...populated]
			.sort((a, b) => b.partitionId.localeCompare(a.partitionId))
			.slice(0, lookback);
		const ids = recent.map((p) => p.partitionId);
		const predicate = partitionPredicate(
			partitioning.field,
			partitioning.granularity,
			partitioning.kind,
			ids,
			options.partitionColumnType ?? 'TIMESTAMP',
		);
		if (predicate) {
			const rows = recent.reduce((sum, p) => sum + p.rows, 0);
			return {
				strategy: 'partitions',
				detail:
					`${recent.length} most recent populated partition(s) ` +
					`(${ids.at(-1)}..${ids[0]}, ~${rows.toLocaleString()} rows) ` +
					`of ${populated.length} total`,
				whereClause: predicate,
			};
		}
	}

	// Every remaining strategy runs without a predicate, which this table
	// would reject. Say so plainly rather than emitting a query that fails.
	if (mustFilter) return { strategy: 'partitions', detail: UNFILTERABLE, unfilterable: true };

	if (rowCount !== null && rowCount > SAMPLE_THRESHOLD_ROWS) {
		// Keep the sample near a fixed row count rather than a fixed
		// percentage, so a 10M-row and a 10B-row table cost about the same.
		const percent = Math.max(
			0.01,
			Math.min(10, Number(((SAMPLE_THRESHOLD_ROWS / rowCount) * 100).toPrecision(2))),
		);
		return {
			strategy: 'sample',
			detail: `TABLESAMPLE ${percent}% of ~${rowCount.toLocaleString()} rows (unpartitioned)`,
			tablesamplePercent: percent,
		};
	}

	return { strategy: 'full', detail: 'full table scan (small table)' };
}

export interface BudgetDecision {
	allowed: boolean;
	reason: string;
}

/** Tracks spend across a run and decides whether the next query may proceed. */
export class BudgetTracker {
	private spent = 0;

	constructor(private readonly limits: BudgetLimits = DEFAULT_LIMITS) {}

	get bytesSpent(): number {
		return this.spent;
	}

	get costSpent(): number {
		return estimateCostUsd(this.spent);
	}

	get remaining(): number {
		return Math.max(0, this.limits.maxBytesTotal - this.spent);
	}

	/** Judges an estimated table cost against both the per-table and run caps. */
	check(table: string, estimatedBytes: number): BudgetDecision {
		if (estimatedBytes > this.limits.maxBytesPerTable) {
			return {
				allowed: false,
				reason:
					`would scan ${formatBytes(estimatedBytes)} ` +
					`(~$${estimateCostUsd(estimatedBytes).toFixed(2)}), ` +
					`over the ${formatBytes(this.limits.maxBytesPerTable)} per-table limit`,
			};
		}
		if (this.spent + estimatedBytes > this.limits.maxBytesTotal) {
			return {
				allowed: false,
				reason:
					`would push the run past its ${formatBytes(this.limits.maxBytesTotal)} ` +
					`total limit (${formatBytes(this.spent)} already used)`,
			};
		}
		return { allowed: true, reason: `${table}: ${formatBytes(estimatedBytes)}` };
	}

	record(bytes: number): void {
		this.spent += bytes;
	}
}
