import { describe, expect, it } from 'vitest';
import {
	buildProfileChunks,
	chunkFields,
	estimateLeafFields,
	LEAF_FIELD_CEILING,
	planColumnStats,
	quotePath,
} from '../src/warehouse/bigquery/profileSql.ts';
import type { SchemaField } from '../src/types.ts';

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

describe('quotePath', () => {
	it('quotes each segment of a nested path separately', () => {
		// Quoting the whole dotted path would look for a column literally
		// named "campaigns.utm_source", which does not exist.
		expect(quotePath('campaigns.utm_source')).toBe('`campaigns`.`utm_source`');
	});

	it('quotes a plain column', () => {
		expect(quotePath('event')).toBe('`event`');
	});

	it('strips backticks so a column name cannot break out of the quoting', () => {
		expect(quotePath('ev`ent')).toBe('`event`');
	});
});

describe('planColumnStats', () => {
	it('uses TO_JSON_STRING for JSON, which cannot be grouped directly', () => {
		const plan = planColumnStats(field({ path: 'payload', baseType: 'JSON' }), 0, false);
		const ndv = plan.stats.find((s) => s.kind === 'ndv');
		expect(ndv?.expr).toContain('TO_JSON_STRING');
	});

	it('collects only length stats for ARRAY columns, never aggregates them', () => {
		const plan = planColumnStats(
			field({ path: 'tags', baseType: 'STRING', mode: 'REPEATED' }),
			0,
			false,
		);
		const kinds = plan.stats.map((s) => s.kind);
		expect(kinds).toEqual(['nullCount', 'arrayElements', 'arrayMaxLength']);
		expect(plan.stats.some((s) => s.expr.includes('APPROX_COUNT_DISTINCT'))).toBe(false);
	});

	it('skips min/max for BOOL but keeps top values', () => {
		const plan = planColumnStats(field({ path: 'ok', baseType: 'BOOL' }), 0, false);
		const kinds = plan.stats.map((s) => s.kind);
		expect(kinds).toContain('topValues');
		expect(kinds).not.toContain('min');
	});

	it('skips top values for FLOAT64 where they are meaningless', () => {
		const plan = planColumnStats(field({ path: 'ratio', baseType: 'FLOAT64' }), 0, false);
		expect(plan.stats.map((s) => s.kind)).not.toContain('topValues');
	});

	it('only counts nulls for an unaggregatable type', () => {
		const plan = planColumnStats(field({ path: 'shape', baseType: 'GEOGRAPHY' }), 0, false);
		expect(plan.stats.map((s) => s.kind)).toEqual(['nullCount']);
	});

	it('casts to STRING when sketching so sketches stay type-compatible', () => {
		// An INT64 key and a STRING key must produce mergeable sketches,
		// otherwise a real join across differing types is invisible.
		const plan = planColumnStats(field({ path: 'room_id', baseType: 'INT64' }), 3, true);
		const sketch = plan.stats.find((s) => s.kind === 'sketch');
		expect(sketch?.expr).toContain('CAST(`room_id` AS STRING)');
		expect(sketch?.expr).toContain('HLL_COUNT.INIT');
	});

	it('prefixes every alias so no column name can collide with a keyword', () => {
		// `nulls` is reserved in BigQuery and broke a hand-written probe query.
		const plan = planColumnStats(field({ path: 'nulls', baseType: 'STRING' }), 7, false);
		for (const stat of plan.stats) expect(stat.alias).toMatch(/^c7_/);
	});
});

describe('estimateLeafFields', () => {
	it('matches the leaf count BigQuery itself reported for a 3006-column table', () => {
		// Measured against mixpanel-gtm-training.kodiak.events, which failed
		// with: "Too many total leaf fields: 13531, max allowed: 10000".
		// The estimator must be exact, or chunking silently under-splits.
		const fields: SchemaField[] = [
			...Array.from({ length: 504 }, (_, i) =>
				field({ path: `s${i}`, baseType: 'STRING' }),
			),
			...Array.from({ length: 500 }, (_, i) =>
				field({ path: `r${i}`, baseType: 'STRING', mode: 'REPEATED' }),
			),
			...Array.from({ length: 501 }, (_, i) =>
				field({ path: `t${i}`, baseType: 'TIMESTAMP' }),
			),
			...Array.from({ length: 500 }, (_, i) => field({ path: `i${i}`, baseType: 'INT64' })),
			...Array.from({ length: 500 }, (_, i) => field({ path: `f${i}`, baseType: 'FLOAT64' })),
			...Array.from({ length: 500 }, (_, i) => field({ path: `b${i}`, baseType: 'BOOL' })),
			field({ path: 'j0', baseType: 'JSON' }),
		];
		expect(fields).toHaveLength(3006);
		expect(estimateLeafFields(fields, new Set())).toBe(13531);
	});

	it('counts APPROX_TOP_COUNT as two leaves, not one', () => {
		const one = estimateLeafFields([field({ path: 'a', baseType: 'STRING' })], new Set());
		// row_count(1) + nullCount(1) + ndv(1) + min(1) + max(1) + top(2)
		expect(one).toBe(7);
	});
});

describe('chunkFields', () => {
	const wide = Array.from({ length: 3006 }, (_, i) =>
		field({ path: `c${i}`, baseType: 'STRING' }),
	);

	it('splits a table too wide for one query', () => {
		const chunks = chunkFields(wide, new Set(), LEAF_FIELD_CEILING);
		expect(chunks.length).toBeGreaterThan(1);
	});

	it('keeps every chunk under the BigQuery leaf-field limit', () => {
		for (const chunk of chunkFields(wide, new Set(), LEAF_FIELD_CEILING)) {
			expect(estimateLeafFields(chunk, new Set())).toBeLessThanOrEqual(10_000);
		}
	});

	it('loses no columns while chunking', () => {
		const chunks = chunkFields(wide, new Set(), LEAF_FIELD_CEILING);
		expect(chunks.flat().map((f) => f.path)).toEqual(wide.map((f) => f.path));
	});

	it('returns a single chunk for a narrow table', () => {
		expect(chunkFields(wide.slice(0, 10), new Set(), LEAF_FIELD_CEILING)).toHaveLength(1);
	});
});

describe('buildProfileChunks', () => {
	const fields = [
		field({ path: 'event', baseType: 'STRING' }),
		field({ path: 'room_id', baseType: 'INT64' }),
	];

	it('produces runnable SQL against the fully qualified table', () => {
		const [chunk] = buildProfileChunks({
			fullName: 'p.d.events',
			fields,
			sketchPaths: new Set(['room_id']),
		});
		expect(chunk!.sql).toContain('FROM `p`.`d`.`events`');
		expect(chunk!.sql).toContain('COUNT(*) AS row_count');
		expect(chunk!.sql).toContain('HLL_COUNT.INIT');
	});

	it('applies a partition filter when one is supplied', () => {
		const [chunk] = buildProfileChunks({
			fullName: 'p.d.events',
			fields,
			sketchPaths: new Set(),
			whereClause: '`time` >= TIMESTAMP("2024-06-01")',
		});
		expect(chunk!.sql).toContain('WHERE `time` >= TIMESTAMP("2024-06-01")');
	});

	it('applies TABLESAMPLE when asked, since dry runs honour it', () => {
		const [chunk] = buildProfileChunks({
			fullName: 'p.d.events',
			fields,
			sketchPaths: new Set(),
			tablesamplePercent: 1,
		});
		expect(chunk!.sql).toContain('TABLESAMPLE SYSTEM (1 PERCENT)');
	});

	it('marks fields under a REPEATED ancestor as unreachable rather than emitting bad SQL', () => {
		// `items.sku` cannot be selected directly when `items` is an ARRAY.
		const nested = [
			field({ path: 'items', baseType: 'STRUCT', mode: 'REPEATED', isContainer: true }),
			field({ path: 'items.sku', baseType: 'STRING', isNested: true }),
		];
		const [chunk] = buildProfileChunks({
			fullName: 'p.d.orders',
			fields: nested,
			sketchPaths: new Set(),
		});
		expect(chunk!.unreachable).toContain('items.sku');
		expect(chunk!.sql).not.toContain('`items`.`sku`');
	});
});
