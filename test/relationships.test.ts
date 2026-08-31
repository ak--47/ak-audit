import { describe, expect, it } from 'vitest';
import {
	buildEdge,
	couldProduceEdge,
	isDenseSequence,
	namesCompatible,
	pairsToMerge,
	rankEdges,
	type SketchedColumn,
} from '../src/analyze/relationships.ts';

const col = (
	table: string,
	column: string,
	ndv: number,
	dense = false,
	integral = dense,
): SketchedColumn => ({
	table,
	column,
	ndv,
	sketch: 'x',
	dense,
	integral,
});

/**
 * The numbers below are real HLL results measured against
 * mixpanel-gtm-training.warehouse_connectors on 2026-08-30.
 */
describe('buildEdge against measured BigQuery overlap', () => {
	it('reports a genuine foreign key: complexTypes.room_id inside rooms.room_id', () => {
		const edge = buildEdge(
			col('warehouse_connectors.complexTypes', 'room_id', 7289),
			col('warehouse_connectors.rooms', 'room_id', 9877),
			9877,
		);
		expect(edge).not.toBeNull();
		expect(edge!.intersection).toBe(7289);
		expect(edge!.containment).toBe(1);
		expect(edge!.kind).toBe('foreign-key');
	});

	it('orients the edge from the child to the parent', () => {
		const edge = buildEdge(
			col('warehouse_connectors.rooms', 'room_id', 9877),
			col('warehouse_connectors.complexTypes', 'room_id', 7289),
			9877,
		);
		expect(edge!.from.table).toBe('warehouse_connectors.complexTypes');
		expect(edge!.to.table).toBe('warehouse_connectors.rooms');
	});

	it('rejects the name-matching false positive users.distinct_id / rooms.distinct_id', () => {
		// Same column name, different types, 6 shared values out of 100.
		// The old tool reported this as a join key.
		const edge = buildEdge(
			col('warehouse_connectors.users', 'distinct_id', 100),
			col('warehouse_connectors.rooms', 'distinct_id', 9877),
			9971,
		);
		expect(edge).toBeNull();
	});

	it('flags duplicate columns inside one table', () => {
		const edge = buildEdge(
			col('warehouse_connectors.rooms', 'distinct_id', 9877),
			col('warehouse_connectors.rooms', 'room_id', 9877),
			9877,
		);
		expect(edge!.kind).toBe('duplicate');
		expect(edge!.sameTable).toBe(true);
	});

	it('rejects unrelated columns with no shared values', () => {
		expect(
			buildEdge(
				col('warehouse_connectors.events', 'device_id', 570),
				col('warehouse_connectors.users', 'distinct_id', 100),
				670,
			),
		).toBeNull();
	});
});

describe('buildEdge guards', () => {
	it('clamps negative intersections produced by HLL estimation error', () => {
		// A union larger than the sum of parts is impossible in set terms but
		// reachable through sketch error; it must not become a negative count.
		const edge = buildEdge(col('t', 'a', 100), col('u', 'b', 100), 250);
		expect(edge).toBeNull();
	});

	it('ignores constant or empty columns', () => {
		expect(buildEdge(col('t', 'a', 1), col('u', 'b', 5000), 5000)).toBeNull();
	});

	it('rejects a tiny column that lands inside a huge one by coincidence', () => {
		// Measured: users.country_code (15 values) scored containment 1.00
		// against complexTypes.session_id (14,341 values).
		expect(
			buildEdge(
				col('warehouse_connectors.users', 'country_code', 15),
				col('warehouse_connectors.complexTypes', 'session_id', 14341),
				14341,
			),
		).toBeNull();
	});

	it('reports partial overlap as the weaker "overlap" kind', () => {
		// Matching names, so containment carries the judgement on its own.
		const edge = buildEdge(col('t', 'user_id', 100), col('u', 'user_id', 1000), 1050);
		expect(edge!.kind).toBe('overlap');
		expect(edge!.containment).toBe(0.5);
	});

	it('drops a weakly similar pair whose names do not agree', () => {
		// Same numbers as above but unrelated names: containment 0.5 at a
		// Jaccard of 0.048 is not evidence of anything.
		expect(buildEdge(col('t', 'alpha', 100), col('u', 'beta', 1000), 1050)).toBeNull();
	});

	it('never lets containment exceed 1', () => {
		const edge = buildEdge(col('t', 'a', 100), col('u', 'b', 100), 50);
		expect(edge!.containment).toBeLessThanOrEqual(1);
	});
});

describe('dense integer sequences', () => {
	it('recognises a gap-free surrogate key', () => {
		expect(isDenseSequence('1', '9992', 9992)).toBe(true);
	});

	it('does not call a sparse numeric column dense', () => {
		// 500 values spread over a million-wide range.
		expect(isDenseSequence('1', '1000000', 500)).toBe(false);
	});

	it('ignores non-integer values', () => {
		expect(isDenseSequence('aaa', 'zzz', 100)).toBe(false);
		expect(isDenseSequence('1.5', '9.5', 9)).toBe(false);
	});

	it('rejects two unrelated dense sequences that overlap by arithmetic', () => {
		// Measured: products.product_id (1..1000) scored containment 1.00
		// against rooms.room_id (1..9992). Both are generated keys; the
		// overlap is arithmetic, not a relationship.
		expect(
			buildEdge(
				col('warehouse_connectors.products', 'product_id', 1000, true),
				col('warehouse_connectors.rooms', 'room_id', 9992, true),
				9992,
			),
		).toBeNull();
	});

	it('keeps a dense pair when the names agree', () => {
		// complexTypes.room_id -> rooms.room_id is a real foreign key.
		const edge = buildEdge(
			col('warehouse_connectors.complexTypes', 'room_id', 7367, true),
			col('warehouse_connectors.rooms', 'room_id', 9992, true),
			9992,
		);
		expect(edge?.kind).toBe('foreign-key');
	});

	it('keeps a dense pair when the sets are identical', () => {
		const edge = buildEdge(
			col('warehouse_connectors.rooms', 'distinct_id', 9992, true),
			col('warehouse_connectors.rooms', 'room_id', 9992, true),
			9992,
		);
		expect(edge?.kind).toBe('duplicate');
	});

	it('still trusts overlap between sparse columns with unrelated names', () => {
		// Hashes and UUIDs do not collide by arithmetic, so a match is real
		// even when the names differ.
		const edge = buildEdge(
			col('t', 'checkout_token', 5000, false),
			col('u', 'payment_ref', 5200, false),
			5200,
		);
		expect(edge?.kind).toBe('foreign-key');
	});
});

describe('namesCompatible', () => {
	it('matches identical column names', () => {
		expect(namesCompatible(col('a.orders', 'room_id', 9), col('a.rooms', 'room_id', 9))).toBe(
			true,
		);
	});

	it('matches a bare id against the referring table entity', () => {
		expect(namesCompatible(col('a.rooms', 'id', 9), col('a.events', 'room_id', 9))).toBe(true);
	});

	it('matches across differing key suffixes', () => {
		expect(namesCompatible(col('a.x', 'user_id', 9), col('a.y', 'user_uuid', 9))).toBe(true);
	});

	it('rejects different entities', () => {
		expect(
			namesCompatible(col('a.products', 'product_id', 9), col('a.rooms', 'room_id', 9)),
		).toBe(false);
	});
});

describe('rankEdges', () => {
	it('puts duplicates first, then foreign keys, then plain overlap', () => {
		const edges = [
			buildEdge(col('t', 'user_id', 100), col('u', 'user_id', 1000), 1050)!,
			buildEdge(col('t', 'room_id', 7289), col('u', 'room_id', 9877), 9877)!,
			buildEdge(col('t', 'e', 500), col('t', 'f', 500), 500)!,
		];
		expect(rankEdges(edges).map((e) => e.kind)).toEqual([
			'duplicate',
			'foreign-key',
			'overlap',
		]);
	});
});

describe('pairsToMerge', () => {
	it('produces every unordered pair exactly once', () => {
		const cols = [col('t', 'user_id', 500), col('t', 'user_id2', 500), col('u', 'user_id', 500)];
		expect(pairsToMerge(cols).pairs).toHaveLength(3);
	});
});

describe('couldProduceEdge pruning', () => {
	it('keeps name-compatible pairs whatever their sizes', () => {
		expect(
			couldProduceEdge(col('a.orders', 'room_id', 30), col('b.rooms', 'room_id', 900000)),
		).toBe(true);
	});

	it('drops pairs too lopsided to ever clear the Jaccard floor', () => {
		// 131 values inside 58,257 caps Jaccard at 0.002, far under the floor,
		// so merging the pair could only ever confirm a rejection.
		expect(
			couldProduceEdge(col('a.events', 'product_id', 131), col('b.ct', 'insert_id', 58257)),
		).toBe(false);
	});

	it('drops pairs below the smallest possible cardinality floor', () => {
		expect(couldProduceEdge(col('a.t', 'x', 4), col('b.u', 'y', 4))).toBe(false);
	});

	it('drops dense integer runs with unrelated names', () => {
		expect(
			couldProduceEdge(
				col('a.products', 'product_id', 1000, true),
				col('b.rooms', 'room_id', 1200, true),
			),
		).toBe(false);
	});

	it('keeps plausible unrelated-name pairs of similar size', () => {
		expect(
			couldProduceEdge(col('a.t', 'checkout_token', 5000), col('b.u', 'payment_ref', 5200)),
		).toBe(true);
	});

	it('cuts the pair space by orders of magnitude on a realistic mix', () => {
		const cols = [
			...Array.from({ length: 300 }, (_, i) =>
				col(`t${i % 40}`, `metric_${i}`, 50 + i, true),
			),
			...Array.from({ length: 60 }, (_, i) => col(`t${i % 20}`, 'user_id', 900 + i)),
		];
		const { pairs, considered } = pairsToMerge(cols);
		expect(considered).toBeGreaterThan(60000);
		expect(pairs.length).toBeLessThan(considered / 10);
	});

	it('stops at the pair ceiling instead of exhausting memory', () => {
		const cols = Array.from({ length: 400 }, (_, i) => col(`t${i}`, 'user_id', 1000 + i));
		const { pairs, truncated } = pairsToMerge(cols, 100);
		expect(pairs).toHaveLength(100);
		expect(truncated).toBe(true);
	});
});
