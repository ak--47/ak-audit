import { describe, expect, it } from 'vitest';
import {
	buildEdge,
	pairsToMerge,
	rankEdges,
	type SketchedColumn,
} from '../src/analyze/relationships.ts';

const col = (table: string, column: string, ndv: number): SketchedColumn => ({
	table,
	column,
	ndv,
	sketch: 'x',
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

	it('reports partial overlap as the weaker "overlap" kind', () => {
		const edge = buildEdge(col('t', 'a', 100), col('u', 'b', 1000), 1050);
		expect(edge!.kind).toBe('overlap');
		expect(edge!.containment).toBe(0.5);
	});

	it('never lets containment exceed 1', () => {
		const edge = buildEdge(col('t', 'a', 100), col('u', 'b', 100), 50);
		expect(edge!.containment).toBeLessThanOrEqual(1);
	});
});

describe('rankEdges', () => {
	it('puts duplicates first, then foreign keys, then plain overlap', () => {
		const edges = [
			buildEdge(col('t', 'a', 100), col('u', 'b', 1000), 1050)!,
			buildEdge(col('t', 'c', 7289), col('u', 'd', 9877), 9877)!,
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
		const cols = [col('t', 'a', 5), col('t', 'b', 5), col('u', 'c', 5)];
		expect(pairsToMerge(cols)).toHaveLength(3);
	});
});
