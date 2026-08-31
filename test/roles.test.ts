import { describe, expect, it } from 'vitest';
import { classifyColumn, rankKeyColumns } from '../src/analyze/roles.ts';
import { formatRate } from '../src/util/format.ts';
import type { ColumnRole, ColumnStats, SchemaField } from '../src/types.ts';

function field(partial: Partial<SchemaField> & { path: string }): SchemaField {
	return {
		name: partial.path.split('.').at(-1)!,
		dataType: 'STRING',
		baseType: 'STRING',
		mode: 'NULLABLE',
		isNested: partial.path.includes('.'),
		isContainer: false,
		isPartitioningColumn: false,
		clusteringPosition: null,
		...partial,
	};
}

function stats(partial: Partial<ColumnStats> & { path: string }): ColumnStats {
	return {
		nullCount: null,
		nullRate: null,
		ndv: null,
		min: null,
		max: null,
		topValues: [],
		arrayStats: null,
		sketch: null,
		skipped: null,
		...partial,
	};
}

describe('classifyColumn', () => {
	it('calls a high-cardinality id column an identifier', () => {
		const role = classifyColumn(
			field({ path: 'user_id' }),
			stats({ path: 'user_id', ndv: 9500 }),
			10000,
		);
		expect(role).toBe('identifier');
	});

	it('demotes an id-named column that barely varies', () => {
		// A `user_id` holding three values across a million rows is a
		// category whatever it is called.
		const role = classifyColumn(
			field({ path: 'user_id' }),
			stats({ path: 'user_id', ndv: 3 }),
			1_000_000,
		);
		expect(role).toBe('categorical');
	});

	it('classifies temporal types by type, not name', () => {
		expect(
			classifyColumn(field({ path: 'whenever', baseType: 'TIMESTAMP' }), undefined, null),
		).toBe('timestamp');
	});

	it('classifies BOOL as a flag', () => {
		expect(classifyColumn(field({ path: 'ok', baseType: 'BOOL' }), undefined, null)).toBe('flag');
	});

	it('treats a container as structural', () => {
		expect(
			classifyColumn(
				field({ path: 'payload', baseType: 'STRUCT', isContainer: true }),
				undefined,
				null,
			),
		).toBe('structural');
	});

	it('treats a named quantity as a measure', () => {
		expect(
			classifyColumn(
				field({ path: 'total_amount', baseType: 'INT64' }),
				stats({ path: 'total_amount', ndv: 5000 }),
				10000,
			),
		).toBe('measure');
	});
});

describe('rankKeyColumns', () => {
	const fields = [
		field({ path: 'order_id' }),
		field({ path: 'MRR', baseType: 'FLOAT64' }),
		field({ path: 'notes' }),
		field({ path: 'created', baseType: 'TIMESTAMP', isPartitioningColumn: true }),
	];
	const roles: Record<string, ColumnRole> = {
		order_id: 'identifier',
		MRR: 'measure',
		notes: 'text',
		created: 'timestamp',
	};

	it('omits measures and free text', () => {
		// Every top-level column used to score a baseline point, which put
		// MRR and __of_employees in the catalog's key-column list.
		const ranked = rankKeyColumns(fields, roles, {}, new Set());
		expect(ranked).not.toContain('MRR');
		expect(ranked).not.toContain('notes');
	});

	it('keeps identifiers and partitioning columns', () => {
		const ranked = rankKeyColumns(fields, roles, {}, new Set());
		expect(ranked).toContain('order_id');
		expect(ranked).toContain('created');
	});

	it('ranks a column with a confirmed relationship above a bare identifier', () => {
		const ranked = rankKeyColumns(
			[field({ path: 'plain_id' }), field({ path: 'joined_col' })],
			{ plain_id: 'identifier', joined_col: 'categorical' },
			{},
			new Set(['joined_col']),
		);
		expect(ranked[0]).toBe('joined_col');
	});

	it('demotes an almost entirely null column', () => {
		const ranked = rankKeyColumns(
			[field({ path: 'a_id' }), field({ path: 'b_id' })],
			{ a_id: 'identifier', b_id: 'identifier' },
			{ a_id: stats({ path: 'a_id', nullRate: 0.99 }) },
			new Set(),
		);
		expect(ranked[0]).toBe('b_id');
	});
});

describe('formatRate', () => {
	it('never rounds a partly populated column up to 100%', () => {
		// codewords is 99.96% null but has 6 distinct values; reading "100%"
		// beside that distinct count is a contradiction.
		expect(formatRate(0.9996)).toBe('99%');
	});

	it('never rounds a column with some nulls down to 0%', () => {
		expect(formatRate(0.0001)).toBe('1%');
	});

	it('keeps the absolutes exact', () => {
		expect(formatRate(0)).toBe('0%');
		expect(formatRate(1)).toBe('100%');
		expect(formatRate(null)).toBe('—');
	});
});

describe('temporal names do not override numeric types', () => {
	it('treats an INT64 count as a measure despite a temporal-sounding name', () => {
		// `total_calls_logged` read as a timestamp because its name ends in
		// "_logged", which is nonsense for an integer count.
		expect(
			classifyColumn(
				field({ path: 'total_calls_logged', baseType: 'INT64' }),
				stats({ path: 'total_calls_logged', ndv: 400 }),
				10000,
			),
		).toBe('measure');
	});

	it('still calls a STRING date column a timestamp by name', () => {
		expect(
			classifyColumn(
				field({ path: 'created_at', baseType: 'STRING' }),
				stats({ path: 'created_at', ndv: 9000 }),
				10000,
			),
		).toBe('timestamp');
	});

	it('always trusts a real temporal type', () => {
		expect(
			classifyColumn(field({ path: 'anything', baseType: 'TIMESTAMP' }), undefined, null),
		).toBe('timestamp');
	});
});
