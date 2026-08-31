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

/**
 * Cross-table overlap below this many distinct values is coincidence.
 *
 * Measured: a 15-value `country_code` column scored containment 1.00
 * against a 14,341-value `session_id`, purely because fifteen short strings
 * happen to appear somewhere in a large set.
 */
export const MIN_KEY_NDV = 25;

/** Same-table duplicates are strong evidence, so they need less headroom. */
export const MIN_DUPLICATE_NDV = 10;

/** Fill ratio at which a numeric column counts as a dense sequence. */
export const DENSE_FILL_RATIO = 0.8;

/**
 * Similarity required to report a relationship between differently named
 * columns.
 *
 * Containment alone cannot tell a real key from a small set that happens to
 * sit inside a large one. When the names agree, containment is enough; when
 * they do not, the sets must also be a meaningful fraction of each other.
 */
export const MIN_UNNAMED_JACCARD = 0.05;

export interface SketchedColumn {
	table: string;
	column: string;
	ndv: number;
	sketch: string;
	/**
	 * True when the column's values form a nearly gap-free integer run, as a
	 * generated surrogate key does.
	 *
	 * Sketches are built over values cast to STRING, so any two dense
	 * integer runs starting near 1 overlap almost completely whether or not
	 * they are related. Measured: `products.product_id` (1..1000) scored
	 * containment 1.00 against `rooms.room_id` (1..9992), as did
	 * `ad_spend.impressions`. Without this flag the graph fills with
	 * confident nonsense.
	 */
	dense: boolean;
	/**
	 * True when the column's values are integers.
	 *
	 * Density alone is not enough to catch the problem. A child column
	 * holding a subset of a generated key is itself sparse -- measured,
	 * `complexTypes.room_id` fills only 74% of its range -- yet it still
	 * sits entirely inside any dense run of the same magnitude. What matters
	 * is that small integers land inside a dense integer sequence whatever
	 * their own spacing.
	 */
	integral: boolean;
}

/**
 * Decides whether two column names refer to the same thing.
 *
 * Used only to break ties for dense numeric columns, where values alone
 * cannot distinguish a real key from an arithmetic coincidence.
 */
export function namesCompatible(a: SketchedColumn, b: SketchedColumn): boolean {
	const an = leaf(a.column);
	const bn = leaf(b.column);
	if (an === bn) return true;

	// `orders.id` referenced as `items.order_id`.
	const aEntity = entityOf(a.table);
	const bEntity = entityOf(b.table);
	if (isBareId(an) && bn === `${aEntity}_id`) return true;
	if (isBareId(bn) && an === `${bEntity}_id`) return true;

	// `user_id` against `user_uuid`, or `account_id` against `id_account`.
	const aStem = stem(an);
	const bStem = stem(bn);
	return aStem.length > 2 && aStem === bStem;
}

function leaf(path: string): string {
	return (path.split('.').at(-1) ?? path).toLowerCase();
}

function isBareId(name: string): boolean {
	return name === 'id' || name === '_id' || name === 'pk';
}

/** Strips a trailing key suffix so `user_id` and `user_uuid` compare equal. */
function stem(name: string): string {
	return name.replace(/_(id|key|uuid|guid|code|ref|num|number|pk|fk)$/, '');
}

/** Best-effort singular entity name for a table, e.g. `rooms` -> `room`. */
function entityOf(fullName: string): string {
	const table = (fullName.split('.').at(-1) ?? fullName).toLowerCase();
	return table.endsWith('ies')
		? `${table.slice(0, -3)}y`
		: table.endsWith('s') && !table.endsWith('ss')
			? table.slice(0, -1)
			: table;
}

/** True when a column's observed values are integers. */
export function isIntegerRange(min: string | null, max: string | null): boolean {
	if (min === null || max === null) return false;
	return /^-?\d+$/.test(String(min).trim()) && /^-?\d+$/.test(String(max).trim());
}

/**
 * Detects a nearly gap-free integer run from statistics already collected.
 *
 * Needs no extra query: min, max and distinct count come from the profile
 * scan.
 */
export function isDenseSequence(
	min: string | null,
	max: string | null,
	ndv: number | null,
): boolean {
	if (!isIntegerRange(min, max) || ndv === null) return false;
	const lo = Number(min);
	const hi = Number(max);
	if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return false;
	const span = hi - lo + 1;
	if (span <= 0 || span > Number.MAX_SAFE_INTEGER) return false;
	return ndv / span >= DENSE_FILL_RATIO;
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

	const sameTable = a.table === b.table;
	const looksDuplicate = containment >= DUPLICATE_SIMILARITY && jaccard >= DUPLICATE_SIMILARITY;

	// Too few distinct values for overlap to mean anything.
	if (smaller < (looksDuplicate ? MIN_DUPLICATE_NDV : MIN_KEY_NDV)) return null;

	const compatible = namesCompatible(a, b);

	if (!looksDuplicate && !compatible) {
		const smallerSide = a.ndv <= b.ndv ? a : b;
		const largerSide = a.ndv <= b.ndv ? b : a;

		// A dense integer run is swallowed by almost any larger set, so full
		// containment of one proves nothing on its own. Measured:
		// events.product_id (131 dense values) scored containment 1.00
		// against complexTypes.insert_id (58,257 values).
		if (smallerSide.dense) return null;

		// The mirror case: any set of small integers lies inside a dense
		// integer run of the same magnitude. Measured:
		// complexTypes.room_id scored containment 1.00 against
		// videos.video_id (1..50000) purely because both count from one.
		if (largerSide.dense && smallerSide.integral) return null;

		// Containment alone cannot separate a genuine key from a small set
		// that happens to sit inside a large one. Without agreeing names,
		// require the two sets to be a meaningful fraction of each other.
		// Measured: events.video_id -> complexTypes.session_id reached
		// containment 1.00 at a Jaccard of 0.015.
		if (jaccard < MIN_UNNAMED_JACCARD) return null;
	}

	let kind: EdgeKind = 'overlap';
	if (looksDuplicate) {
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
		sameTable,
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
 * Decides whether a pair could possibly produce an edge.
 *
 * Pair count grows with the square of the sketched columns, so a dataset of
 * 600 tables reaches hundreds of millions of pairs — far past what can be
 * merged, or even held in memory. Almost all of them are pairs `buildEdge`
 * would reject anyway.
 *
 * Every test below mirrors a rejection rule that needs no union value, so
 * pruning here removes only pairs that were certain to be discarded. It is
 * a speed change, not a behaviour change.
 */
export function couldProduceEdge(a: SketchedColumn, b: SketchedColumn): boolean {
	if (a.table === b.table && a.column === b.column) return false;

	const smallerNdv = Math.min(a.ndv, b.ndv);
	const largerNdv = Math.max(a.ndv, b.ndv);

	// No threshold in buildEdge is ever below the duplicate floor.
	if (smallerNdv < MIN_DUPLICATE_NDV) return false;

	if (namesCompatible(a, b)) return true;

	// Without agreeing names the pair must clear both the key floor and the
	// Jaccard floor. The best case for Jaccard is every value of the smaller
	// side matching, so min/max is an upper bound on what it could reach.
	if (smallerNdv < MIN_KEY_NDV) return false;
	if (largerNdv > 0 && smallerNdv / largerNdv < MIN_UNNAMED_JACCARD) return false;

	// Dense integer runs overlap by arithmetic, so they need agreeing names.
	const smaller = a.ndv <= b.ndv ? a : b;
	const larger = a.ndv <= b.ndv ? b : a;
	if (smaller.dense) return false;
	if (larger.dense && smaller.integral) return false;

	return true;
}

/**
 * Every unordered pair worth merging, best candidates first.
 *
 * Pairs are filtered while they are enumerated rather than afterwards: the
 * unfiltered list for a large dataset does not fit in memory.
 *
 * Order matters as much as the filter. When a cap has to bite, truncating
 * the list in enumeration order would keep whatever happened to come first
 * alphabetically and discard the rest of the dataset entirely. Pairs whose
 * names agree are far likelier to be real keys, so they are collected
 * separately and always survive the cap.
 */
export function pairsToMerge(
	columns: SketchedColumn[],
	maxPairs = Number.POSITIVE_INFINITY,
): {
	pairs: [SketchedColumn, SketchedColumn][];
	considered: number;
	truncated: boolean;
	named: number;
} {
	const named: [SketchedColumn, SketchedColumn][] = [];
	const unnamed: [SketchedColumn, SketchedColumn][] = [];
	let considered = 0;
	let dropped = false;

	for (let i = 0; i < columns.length; i++) {
		for (let j = i + 1; j < columns.length; j++) {
			considered++;
			const a = columns[i]!;
			const b = columns[j]!;
			if (!couldProduceEdge(a, b)) continue;

			if (namesCompatible(a, b)) {
				if (named.length < maxPairs) named.push([a, b]);
				else dropped = true;
			} else if (unnamed.length < maxPairs) {
				unnamed.push([a, b]);
			} else {
				dropped = true;
			}
		}
	}

	const room = Math.max(0, maxPairs - named.length);
	const pairs = [...named, ...unnamed.slice(0, room)];
	return {
		pairs,
		considered,
		truncated: dropped || unnamed.length > room,
		named: named.length,
	};
}
