import { describe, expect, it, vi } from 'vitest';
import { resolveRowCount } from '../src/warehouse/bigquery/metadata.ts';
import { planScan, UNFILTERABLE } from '../src/warehouse/bigquery/budget.ts';
import type { PartitionInfo } from '../src/types.ts';

const parts = (...rows: number[]): PartitionInfo[] =>
	rows.map((r, i) => ({ partitionId: `2024060${i + 1}`, rows: r, lastModified: null }));

function fakeClient(overrides: Partial<{ dryRun: unknown; query: unknown }> = {}) {
	return {
		dryRun: vi.fn().mockResolvedValue(0),
		query: vi.fn().mockResolvedValue({ rows: [{ n: 42 }], bytesProcessed: 10 }),
		...overrides,
	} as never;
}

describe('resolveRowCount', () => {
	const base = {
		fullName: 'p.d.t',
		kind: 'TABLE' as const,
		partitions: [] as PartitionInfo[],
		facts: null,
		storageRows: null,
	};

	it('prefers summed partition counts, which are exact and free', async () => {
		const client = fakeClient();
		const r = await resolveRowCount(client, { ...base, partitions: parts(10, 20, 30) });
		expect(r).toMatchObject({ rowCount: 60, source: 'partitions', bytesProcessed: 0 });
		expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
	});

	it('falls back to table metadata, also exact and free', async () => {
		const r = await resolveRowCount(fakeClient(), {
			...base,
			facts: { numRows: 1234, requirePartitionFilter: false },
		});
		expect(r).toMatchObject({ rowCount: 1234, source: 'table-metadata', bytesProcessed: 0 });
	});

	it('runs COUNT(*) for a view, where no free source reports anything', async () => {
		// This is the gap that makes a live view look dead: metadata views
		// report 0 rows for every view.
		const r = await resolveRowCount(fakeClient(), {
			...base,
			kind: 'VIEW',
			facts: { numRows: null, requirePartitionFilter: false },
		});
		expect(r).toMatchObject({ rowCount: 42, source: 'count-query' });
	});

	it('refuses a COUNT(*) that would scan more than the budget', async () => {
		const client = fakeClient({ dryRun: vi.fn().mockResolvedValue(9e12) });
		const r = await resolveRowCount(client, {
			...base,
			kind: 'VIEW',
			facts: { numRows: null, requirePartitionFilter: false },
			countBudgetBytes: 1024,
		});
		expect(r.source).toBe('unavailable');
		expect(r.error).toContain('over the count budget');
		expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
	});

	it('does not attempt COUNT(*) on a table that demands a partition filter', async () => {
		// BigQuery rejects the query outright rather than charging for it.
		const client = fakeClient();
		const r = await resolveRowCount(client, {
			...base,
			facts: { numRows: null, requirePartitionFilter: true },
		});
		expect(r.error).toContain('partition filter');
		expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
	});

	it('skips the count query when asked', async () => {
		const client = fakeClient();
		const r = await resolveRowCount(client, {
			...base,
			kind: 'VIEW',
			facts: { numRows: null, requirePartitionFilter: false },
			skipCountQuery: true,
		});
		expect(r.source).toBe('unavailable');
		expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
	});

	it('reports storage metadata as such, so its provenance is visible', async () => {
		const r = await resolveRowCount(fakeClient(), {
			...base,
			storageRows: 500,
			skipCountQuery: true,
		});
		expect(r).toMatchObject({ rowCount: 500, source: 'storage-metadata' });
	});
});

describe('planScan with requirePartitionFilter', () => {
	it('still prunes normally when partitions are available', () => {
		const plan = planScan({
			partitioning: { field: '_PARTITIONTIME', granularity: 'DAY', kind: 'ingestion-time' },
			partitions: parts(100, 200),
			rowCount: 57_635_126_973,
			requirePartitionFilter: true,
			lookback: 1,
		});
		expect(plan.whereClause).toContain('`_PARTITIONTIME`');
		expect(plan.unfilterable).toBeFalsy();
	});

	it('marks the table unfilterable when no populated partition exists', () => {
		const plan = planScan({
			partitioning: { field: '_PARTITIONTIME', granularity: 'DAY', kind: 'ingestion-time' },
			partitions: [],
			rowCount: 1e9,
			requirePartitionFilter: true,
		});
		expect(plan.unfilterable).toBe(true);
		expect(plan.detail).toBe(UNFILTERABLE);
	});

	it('never lets --full override a required partition filter', () => {
		// A full scan would simply be rejected by BigQuery.
		const plan = planScan({
			partitioning: { field: '_PARTITIONTIME', granularity: 'DAY', kind: 'ingestion-time' },
			partitions: [],
			rowCount: 1e9,
			requirePartitionFilter: true,
			full: true,
		});
		expect(plan.unfilterable).toBe(true);
	});

	it('never falls back to an unfiltered TABLESAMPLE', () => {
		const plan = planScan({
			partitioning: null,
			partitions: [],
			rowCount: 1e10,
			requirePartitionFilter: true,
		});
		expect(plan.tablesamplePercent).toBeUndefined();
		expect(plan.unfilterable).toBe(true);
	});
});

describe('views never trust storage metadata', () => {
	function fake() {
		return {
			dryRun: vi.fn().mockResolvedValue(1000),
			query: vi.fn().mockResolvedValue({ rows: [{ n: 8123 }], bytesProcessed: 1000 }),
		} as never;
	}

	it('ignores the zero BigQuery reports for a view and counts it for real', async () => {
		// Measured: every view in mixpanel-sa.sales_intelligence came back
		// with numRows "0" from table metadata. Accepting that is precisely
		// the defect that made 6 live views look dead.
		const r = await resolveRowCount(fake(), {
			fullName: 'p.d.deal_reviews_current',
			kind: 'VIEW',
			partitions: [],
			facts: { numRows: 0, requirePartitionFilter: false },
			storageRows: 0,
		});
		expect(r).toMatchObject({ rowCount: 8123, source: 'count-query' });
	});

	it('still reports a genuinely empty base table as zero, free', async () => {
		const client = fake();
		const r = await resolveRowCount(client, {
			fullName: 'p.d.empty',
			kind: 'TABLE',
			partitions: [],
			facts: { numRows: 0, requirePartitionFilter: false },
			storageRows: null,
		});
		expect(r).toMatchObject({ rowCount: 0, source: 'table-metadata' });
		expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
	});

	it('trusts a materialized view, which does have storage', async () => {
		const client = fake();
		const r = await resolveRowCount(client, {
			fullName: 'p.d.mv',
			kind: 'MATERIALIZED_VIEW',
			partitions: [],
			facts: { numRows: 150, requirePartitionFilter: false },
			storageRows: null,
		});
		expect(r).toMatchObject({ rowCount: 150, source: 'table-metadata' });
	});
});

describe('counting is gated by the run total, not the profile cap', () => {
	it('lets a large count through when only the per-table profile cap would block it', async () => {
		// Counting a view is not profiling a table. Conflating the two made
		// --count-budget look inert: raising it changed nothing.
		const { BudgetTracker } = await import('../src/warehouse/bigquery/budget.ts');
		const budget = new BudgetTracker({
			maxBytesPerTable: 1024,
			maxBytesTotal: 10 * 1024 ** 4,
		});
		const client = {
			dryRun: vi.fn().mockResolvedValue(300 * 1024 ** 3),
			query: vi.fn().mockResolvedValue({ rows: [{ n: 7 }], bytesProcessed: 300 * 1024 ** 3 }),
		} as never;

		const r = await resolveRowCount(client, {
			fullName: 'p.d.v',
			kind: 'VIEW',
			partitions: [],
			facts: { numRows: null, requirePartitionFilter: false },
			storageRows: null,
			countBudgetBytes: 400 * 1024 ** 3,
			budget,
		});
		expect(r).toMatchObject({ rowCount: 7, source: 'count-query' });
	});

	it('still refuses a count that would exceed the run total', async () => {
		const { BudgetTracker } = await import('../src/warehouse/bigquery/budget.ts');
		const budget = new BudgetTracker({ maxBytesPerTable: 1e15, maxBytesTotal: 1024 });
		const client = {
			dryRun: vi.fn().mockResolvedValue(1024 ** 3),
			query: vi.fn(),
		} as never;
		const r = await resolveRowCount(client, {
			fullName: 'p.d.v',
			kind: 'VIEW',
			partitions: [],
			facts: { numRows: null, requirePartitionFilter: false },
			storageRows: null,
			countBudgetBytes: 1e15,
			budget,
		});
		expect(r.error).toContain('past its');
		expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
	});
});
