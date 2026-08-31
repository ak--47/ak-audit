/**
 * Join detection by merging HLL sketches.
 *
 * The sketches were captured during the profile scan that was already being
 * paid for. Merging them touches no source table at all: the sketches are
 * inlined as literals, so the merge query reads zero bytes of table data no
 * matter how large the underlying tables are.
 *
 * The cost of finding relationships is therefore O(tables) scans rather
 * than O(pairs) joins. Comparing every pair of key columns across a
 * warehouse becomes affordable.
 */

import type { JoinEdge, TableProfile } from '../../types.ts';
import type { BigQueryClient } from './client.ts';
import {
	buildEdge,
	columnKey,
	isDenseSequence,
	isIntegerRange,
	pairsToMerge,
	rankEdges,
	type SketchedColumn,
} from '../../analyze/relationships.ts';
import { log } from '../../util/log.ts';

/**
 * SQL text budget per merge query.
 *
 * BigQuery rejects statements over 1 MB. Batches are sized by estimated
 * characters rather than by a fixed pair count, because the cost of a pair
 * depends on whether its sketches are already inlined for another pair in
 * the same batch.
 */
export const MAX_MERGE_SQL_CHARS = 700_000;

/**
 * Ceiling on pairs merged in one run.
 *
 * A backstop, not the primary control: `couldProduceEdge` already discards
 * the pairs that could not yield an edge. This only stops a pathological
 * dataset from running all night.
 */
export const MAX_PAIRS = 200_000;

/** Collects every sketched column across all profiled tables. */
export function collectSketches(profiles: TableProfile[]): SketchedColumn[] {
	const columns: SketchedColumn[] = [];
	for (const profile of profiles) {
		if (profile.skipped) continue;
		for (const stats of Object.values(profile.columns)) {
			if (!stats.sketch || stats.ndv === null || stats.ndv < 2) continue;
			columns.push({
				table: profile.table,
				column: stats.path,
				ndv: stats.ndv,
				sketch: stats.sketch,
				// Derived from min/max/ndv already measured, so this costs
				// no extra query.
				dense: isDenseSequence(stats.min, stats.max, stats.ndv),
				integral: isIntegerRange(stats.min, stats.max),
			});
		}
	}
	return columns;
}

interface MergeRow {
	a_key: string;
	b_key: string;
	a_ndv: string | number | null;
	b_ndv: string | number | null;
	union_ndv: string | number | null;
}

function escape(text: string): string {
	return text.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

/**
 * Builds one merge query for a batch of pairs.
 *
 * Both sketches are inlined and merged to get the union cardinality, and
 * each sketch's own cardinality is extracted alongside it.
 *
 * Taking all three numbers from the same sketches is essential.
 * Inclusion-exclusion only holds when the cardinalities share an estimator:
 * mixing a high-precision APPROX_COUNT_DISTINCT with a precision-12 union
 * inflates the derived intersection. Measured, that error turned a pair
 * sharing 6 of 100 values into an apparent perfect containment.
 */
export function buildMergeSql(pairs: [SketchedColumn, SketchedColumn][]): string {
	// Each sketch is inlined once in a CTE and referenced by key, rather
	// than repeated for every pair that uses it. Repeating them overflowed
	// the statement limit at only 150 pairs; this comfortably fits thousands.
	const used = new Map<string, SketchedColumn>();
	for (const [a, b] of pairs) {
		used.set(columnKey(a.table, a.column), a);
		used.set(columnKey(b.table, b.column), b);
	}

	const sketches = [...used.entries()]
		.map(([key, c]) => `SELECT '${escape(key)}' AS k, FROM_BASE64('${c.sketch}') AS s`)
		.join('\nUNION ALL\n');

	const pairRows = pairs
		.map(
			([a, b]) =>
				`SELECT '${escape(columnKey(a.table, a.column))}' AS a_key, ` +
				`'${escape(columnKey(b.table, b.column))}' AS b_key`,
		)
		.join('\nUNION ALL\n');

	return `WITH sk AS (
${sketches}
), pr AS (
${pairRows}
)
SELECT pr.a_key, pr.b_key,
  HLL_COUNT.EXTRACT(a.s) AS a_ndv,
  HLL_COUNT.EXTRACT(b.s) AS b_ndv,
  (SELECT HLL_COUNT.MERGE(x) FROM UNNEST([a.s, b.s]) x) AS union_ndv
FROM pr
JOIN sk a ON a.k = pr.a_key
JOIN sk b ON b.k = pr.b_key`;
}

/**
 * Splits pairs into batches whose SQL stays inside the statement limit.
 *
 * Sizing by characters rather than pair count matters because consecutive
 * pairs usually share a sketch, so a batch's cost grows far more slowly
 * than its length.
 */
export function batchPairs(
	pairs: [SketchedColumn, SketchedColumn][],
	maxChars = MAX_MERGE_SQL_CHARS,
): [SketchedColumn, SketchedColumn][][] {
	const batches: [SketchedColumn, SketchedColumn][][] = [];
	let current: [SketchedColumn, SketchedColumn][] = [];
	const seen = new Set<string>();
	let size = 0;

	// Fully qualified names are long, so a pair row costs far more than a
	// fixed guess. Measure the parts instead.
	const pairCost = (p: [SketchedColumn, SketchedColumn]) =>
		columnKey(p[0].table, p[0].column).length + columnKey(p[1].table, p[1].column).length + 42;
	const sketchCost = (c: SketchedColumn) =>
		c.sketch.length + columnKey(c.table, c.column).length + 47;

	for (const pair of pairs) {
		const newSketches = pair.filter((c) => !seen.has(columnKey(c.table, c.column)));
		const added = pairCost(pair) + newSketches.reduce((sum, c) => sum + sketchCost(c), 0);

		if (current.length > 0 && size + added > maxChars) {
			batches.push(current);
			current = [];
			seen.clear();
			size = pairCost(pair) + pair.reduce((sum, c) => sum + sketchCost(c), 0);
		} else {
			size += added;
		}

		for (const col of pair) seen.add(columnKey(col.table, col.column));
		current.push(pair);
	}

	if (current.length > 0) batches.push(current);
	return batches;
}

export interface DetectJoinsOptions {
	client: BigQueryClient;
	profiles: TableProfile[];
	/** Reasons a column became a candidate, keyed `table.column`. */
	reasons?: Map<string, string>;
	/**
	 * View-to-source pairs from lineage.
	 *
	 * A view copies its source's columns, so every one of them overlaps
	 * perfectly. Reporting those as discovered relationships buries the real
	 * ones; lineage already states the connection exactly.
	 */
	lineagePairs?: Set<string>;
	/** Skip the merge entirely, e.g. during a cost estimate. */
	skip?: boolean;
	/** Hard ceiling on pairs to merge. */
	maxPairs?: number;
}

/** Unordered key for a pair of tables. */
export function tablePairKey(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Finds candidate joins across the dataset.
 *
 * Same-table pairs are included on purpose: they surface duplicate columns,
 * which is a genuine finding. On the probe dataset this caught
 * `rooms.distinct_id` and `rooms.room_id` holding identical value sets.
 */
export async function detectJoins(options: DetectJoinsOptions): Promise<JoinEdge[]> {
	const { client, profiles, reasons } = options;
	const columns = collectSketches(profiles);

	if (options.skip || columns.length < 2) return [];

	log.step('Detecting joins');

	const { pairs, considered, truncated } = pairsToMerge(columns, options.maxPairs ?? MAX_PAIRS);

	// A view mirrors its source, so those matches are guaranteed and
	// uninformative; lineage already states the connection exactly.
	const filtered = options.lineagePairs
		? pairs.filter(([a, b]) => !options.lineagePairs!.has(tablePairKey(a.table, b.table)))
		: pairs;

	log.info(
		`${columns.length} key columns, ${considered.toLocaleString()} possible pairs, ` +
			`${filtered.length.toLocaleString()} worth merging (0 bytes of table data scanned)`,
	);
	if (truncated) {
		log.warn(
			`pair list capped at ${(options.maxPairs ?? MAX_PAIRS).toLocaleString()}; ` +
				'some relationships may be missed',
		);
	}

	const byKey = new Map(columns.map((c) => [columnKey(c.table, c.column), c]));
	const edges: JoinEdge[] = [];

	/**
	 * Runs a batch, halving it if BigQuery still calls the statement too
	 * large. The size estimate is good but need not be perfect for the run
	 * to succeed.
	 */
	async function runBatch(batch: [SketchedColumn, SketchedColumn][]): Promise<MergeRow[]> {
		try {
			const { rows } = await client.query<MergeRow>(buildMergeSql(batch));
			return rows;
		} catch (error) {
			if (batch.length > 1 && /too large/i.test(message(error))) {
				const half = Math.ceil(batch.length / 2);
				return [
					...(await runBatch(batch.slice(0, half))),
					...(await runBatch(batch.slice(half))),
				];
			}
			throw error;
		}
	}

	for (const batch of batchPairs(filtered)) {
		try {
			const rows = await runBatch(batch);
			for (const row of rows) {
				const a = byKey.get(row.a_key);
				const b = byKey.get(row.b_key);
				const union = Number(row.union_ndv ?? 0);
				const aNdv = Number(row.a_ndv ?? 0);
				const bNdv = Number(row.b_ndv ?? 0);
				if (!a || !b || !Number.isFinite(union)) continue;

				const reason = [reasons?.get(row.a_key), reasons?.get(row.b_key)]
					.filter(Boolean)
					.join(' / ');
				// Use the sketch-derived cardinalities so all three numbers
				// in the inclusion-exclusion share one estimator.
				const edge = buildEdge(
					{ ...a, ndv: Number.isFinite(aNdv) && aNdv > 0 ? aNdv : a.ndv },
					{ ...b, ndv: Number.isFinite(bNdv) && bNdv > 0 ? bNdv : b.ndv },
					union,
					reason,
				);
				if (edge) edges.push(edge);
			}
		} catch (error) {
			log.warn(`sketch merge batch failed: ${message(error)}`);
		}
	}

	const ranked = rankEdges(edges);
	log.success(
		`${ranked.length} candidate relationship(s): ` +
			`${ranked.filter((e) => e.kind === 'foreign-key').length} foreign-key, ` +
			`${ranked.filter((e) => e.kind === 'duplicate').length} duplicate, ` +
			`${ranked.filter((e) => e.kind === 'overlap').length} overlap`,
	);
	return ranked;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
