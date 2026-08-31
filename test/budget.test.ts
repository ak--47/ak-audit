import { describe, expect, it } from 'vitest';
import { BudgetTracker, planScan, SAMPLE_THRESHOLD_ROWS } from '../src/warehouse/bigquery/budget.ts';
import type { PartitionInfo, PartitioningConfig } from '../src/types.ts';

const dayPartitioned: PartitioningConfig = {
	field: 'time',
	granularity: 'DAY',
	kind: 'time',
};

const parts = (...ids: string[]): PartitionInfo[] =>
	ids.map((partitionId) => ({ partitionId, rows: 1000, lastModified: null }));

describe('planScan partition pruning', () => {
	it('prunes to the most recent populated partitions', () => {
		const plan = planScan({
			partitioning: dayPartitioned,
			partitions: parts('20240601', '20240602', '20240603', '20240604'),
			rowCount: 1e9,
			lookback: 2,
		});
		expect(plan.strategy).toBe('partitions');
		expect(plan.whereClause).toContain('`time` >=');
		// Half-open range keeps the predicate prunable.
		expect(plan.whereClause).toContain('<');
		expect(plan.whereClause).toContain('2024-06-03');
		expect(plan.whereClause).toContain('2024-06-05');
	});

	it('ignores empty partitions so it never scans nothing', () => {
		const plan = planScan({
			partitioning: dayPartitioned,
			partitions: [
				{ partitionId: '20240601', rows: 500, lastModified: null },
				{ partitionId: '20240602', rows: 0, lastModified: null },
			],
			rowCount: 500,
			lookback: 1,
		});
		expect(plan.whereClause).toContain('2024-06-01');
		expect(plan.whereClause).not.toContain('2024-06-02T');
	});

	it('never turns __NULL__ or __UNPARTITIONED__ into a date predicate', () => {
		// These are real partition ids holding stray rows. Parsing them as
		// dates would produce an invalid or silently empty filter.
		const plan = planScan({
			partitioning: dayPartitioned,
			partitions: parts('__NULL__', '__UNPARTITIONED__'),
			rowCount: 100,
		});
		expect(plan.strategy).toBe('full');
	});

	it('handles hour granularity', () => {
		const plan = planScan({
			partitioning: { ...dayPartitioned, granularity: 'HOUR' },
			partitions: parts('2024060113'),
			rowCount: 1e9,
			lookback: 1,
		});
		expect(plan.whereClause).toContain('2024-06-01 13:00:00');
		expect(plan.whereClause).toContain('2024-06-01 14:00:00');
	});

	it('uses a numeric BETWEEN for range partitioning', () => {
		const plan = planScan({
			partitioning: { field: 'bucket', granularity: 'RANGE', kind: 'range' },
			partitions: parts('100', '200', '300'),
			rowCount: 1e9,
			lookback: 3,
		});
		expect(plan.whereClause).toContain('`bucket` BETWEEN 100 AND 300');
	});

	it('filters on _PARTITIONTIME for ingestion-time tables', () => {
		const plan = planScan({
			partitioning: { field: '_PARTITIONTIME', granularity: 'DAY', kind: 'ingestion-time' },
			partitions: parts('20240601'),
			rowCount: 1e9,
			lookback: 1,
		});
		expect(plan.whereClause).toContain('`_PARTITIONTIME`');
	});
});

describe('planScan sampling fallback', () => {
	it('samples a large unpartitioned table', () => {
		const plan = planScan({
			partitioning: null,
			partitions: [],
			rowCount: SAMPLE_THRESHOLD_ROWS * 200,
		});
		expect(plan.strategy).toBe('sample');
		expect(plan.tablesamplePercent).toBeGreaterThan(0);
		expect(plan.tablesamplePercent).toBeLessThan(1);
	});

	it('scans a small table in full rather than sampling it', () => {
		const plan = planScan({ partitioning: null, partitions: [], rowCount: 1000 });
		expect(plan.strategy).toBe('full');
	});

	it('holds the sample near a fixed row count, not a fixed percentage', () => {
		// A 10x bigger table should sample a ~10x smaller share, so cost
		// stays roughly flat as tables grow.
		const small = planScan({
			partitioning: null,
			partitions: [],
			rowCount: SAMPLE_THRESHOLD_ROWS * 10,
		});
		const huge = planScan({
			partitioning: null,
			partitions: [],
			rowCount: SAMPLE_THRESHOLD_ROWS * 100,
		});
		expect(small.tablesamplePercent).toBeGreaterThan(huge.tablesamplePercent!);
	});

	it('honours an explicit full scan request', () => {
		const plan = planScan({
			partitioning: dayPartitioned,
			partitions: parts('20240601'),
			rowCount: 1e12,
			full: true,
		});
		expect(plan.strategy).toBe('full');
		expect(plan.whereClause).toBeUndefined();
	});
});

describe('BudgetTracker', () => {
	const GB = 1024 ** 3;

	it('refuses a table over the per-table cap', () => {
		const t = new BudgetTracker({ maxBytesPerTable: 10 * GB, maxBytesTotal: 100 * GB });
		const decision = t.check('big', 60 * GB);
		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain('per-table limit');
	});

	it('refuses once the run total would be exceeded', () => {
		const t = new BudgetTracker({ maxBytesPerTable: 100 * GB, maxBytesTotal: 50 * GB });
		t.record(45 * GB);
		expect(t.check('next', 10 * GB).allowed).toBe(false);
	});

	it('allows a table inside both caps', () => {
		const t = new BudgetTracker({ maxBytesPerTable: 10 * GB, maxBytesTotal: 100 * GB });
		expect(t.check('ok', 5 * GB).allowed).toBe(true);
	});

	it('tracks spend and reports cost', () => {
		const t = new BudgetTracker();
		t.record(1024 ** 4); // 1 TiB
		expect(t.costSpent).toBeCloseTo(6.25, 2);
	});
});
