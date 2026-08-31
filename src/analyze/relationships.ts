/**
 * Turns merged HLL sketch cardinalities into ranked join candidates.
 *
 * Overlap is derived by inclusion-exclusion over sketches:
 *
 *     |A n B| = |A| + |B| - |A u B|
 *
 * Ranking uses containment, not Jaccard. A small set almost entirely
 * contained in a large one is precisely the child-to-parent foreign key
 * signal, and Jaccard hides it: a 7k-row child inside a 10k-row parent
 * scores 0.74 on Jaccard but 1.00 on containment.
 *
 * Every number here is an estimate. Edges carry their evidence so the
 * report can present them as candidates rather than facts.
 */

import type { EdgeKind, JoinEdge } from '../types.ts';

/** Below this, a column is constant or empty and cannot identify anything. */
export const MIN_NDV = 2;

/** Below this many shared values, overlap is indistinguishable from noise. */
export const MIN_INTERSECTION = 2;

/** Containment at or above this means one side effectively contains the other. */
export const FOREIGN_KEY_CONTAINMENT = 0.9;

/** Containment and similarity at or above this means the sets are the same. */
export const DUPLICATE_SIMILARITY = 0.98;

/** Weakest containment still worth reporting. */
export const MIN_REPORTED_CONTAINMENT = 0.3;

export interface SketchedColumn {
	table: string;
	column: string;
	ndv: number;
	sketch: string;
}

export interface MergedPair {
	aKey: string;
	bKey: string;
	unionNdv: number;
}

export function columnKey(table: string, column: string): string {
	return `${table}.${column}`;
}

/**
 * Builds an edge from two cardinalities and their union.
 *
 * Returns null when the pair is too weak, too small, or too noisy to
 * report. HLL error can push a computed intersection below zero, so the
 * value is clamped rather than trusted blindly.
 */
export function buildEdge(
	a: SketchedColumn,
	b: SketchedColumn,
	unionNdv: number,
	reason = '',
): JoinEdge | null {
	if (a.ndv < MIN_NDV || b.ndv < MIN_NDV) return null;

	const intersection = Math.max(0, a.ndv + b.ndv - unionNdv);
	if (intersection < MIN_INTERSECTION) return null;

	const smaller = Math.min(a.ndv, b.ndv);
	const containment = smaller > 0 ? Math.min(1, intersection / smaller) : 0;
	const jaccard = unionNdv > 0 ? Math.min(1, intersection / unionNdv) : 0;
	if (containment < MIN_REPORTED_CONTAINMENT) return null;

	let kind: EdgeKind = 'overlap';
	if (containment >= DUPLICATE_SIMILARITY && jaccard >= DUPLICATE_SIMILARITY) {
		kind = 'duplicate';
	} else if (containment >= FOREIGN_KEY_CONTAINMENT) {
		kind = 'foreign-key';
	}

	// Orient the edge child -> parent so the graph reads as foreign keys.
	const [from, to] = a.ndv <= b.ndv ? [a, b] : [b, a];

	return {
		from: { table: from.table, column: from.column, ndv: from.ndv },
		to: { table: to.table, column: to.column, ndv: to.ndv },
		intersection,
		containment: round(containment),
		jaccard: round(jaccard),
		kind,
		sameTable: a.table === b.table,
		reason,
	};
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000;
}

/** Ranks edges strongest first: duplicates, then foreign keys, then overlap. */
export function rankEdges(edges: JoinEdge[]): JoinEdge[] {
	const weight: Record<EdgeKind, number> = { duplicate: 2, 'foreign-key': 1, overlap: 0 };
	return [...edges].sort(
		(x, y) =>
			weight[y.kind] - weight[x.kind] ||
			y.containment - x.containment ||
			y.intersection - x.intersection,
	);
}

/**
 * Every unordered pair worth merging.
 *
 * Pairs of columns whose leaf names differ AND whose cardinalities are wildly
 * apart are still included: cross-named keys are common and the merge is
 * cheap. The bound on cost comes from limiting sketches per table, not here.
 */
export function pairsToMerge(columns: SketchedColumn[]): [SketchedColumn, SketchedColumn][] {
	const pairs: [SketchedColumn, SketchedColumn][] = [];
	for (let i = 0; i < columns.length; i++) {
		for (let j = i + 1; j < columns.length; j++) {
			pairs.push([columns[i]!, columns[j]!]);
		}
	}
	return pairs;
}
