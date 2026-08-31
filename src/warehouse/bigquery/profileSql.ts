/**
 * Builds the type-aware aggregate SQL that profiles a table in one scan.
 *
 * Three BigQuery limits shape everything here, all measured against real
 * tables rather than assumed:
 *
 *  - A query fails past 10,000 leaf output fields. A 3,006-column table
 *    produced 13,531 leaves and was rejected outright, so wide tables must
 *    be chunked. Columnar billing makes chunking free: each chunk is billed
 *    only for the columns it names.
 *  - JSON columns cannot be grouped or aggregated; TO_JSON_STRING can.
 *  - ARRAY columns cannot be aggregated at all; ARRAY_LENGTH can.
 *
 * Every alias is prefixed and every identifier is quoted, so no column name
 * can collide with a reserved word. `nulls` is reserved and broke an early
 * hand-written version of this query.
 */

import type { SchemaField } from '../../types.ts';

/**
 * Chunk ceiling, held below BigQuery's hard limit of 10,000 leaf fields so
 * a small estimator error cannot fail a whole run.
 */
export const LEAF_FIELD_CEILING = 8000;

/** Rows requested from APPROX_TOP_COUNT. */
export const TOP_N = 10;

/**
 * HLL++ precision. 12 yields roughly a 1.2 KB base64 sketch with error
 * near 1.6%, which is ample for judging set overlap and small enough to
 * store one per key column across a large dataset.
 */
export const HLL_PRECISION = 12;

export type StatKind =
	| 'nullCount'
	| 'ndv'
	| 'min'
	| 'max'
	| 'topValues'
	| 'arrayElements'
	| 'arrayMaxLength'
	| 'sketch';

export interface StatExpr {
	kind: StatKind;
	alias: string;
	expr: string;
	/** Leaf output fields this expression contributes. */
	leaves: number;
}

export interface ColumnPlan {
	field: SchemaField;
	stats: StatExpr[];
}

/** Types BigQuery refuses to group, aggregate, or order. */
const UNAGGREGATABLE = new Set(['GEOGRAPHY', 'BYTES', 'INTERVAL', 'STRUCT', 'RECORD', 'RANGE']);

/** Types where MIN/MAX is meaningful. */
const ORDERABLE = new Set([
	'STRING',
	'INT64',
	'NUMERIC',
	'BIGNUMERIC',
	'FLOAT64',
	'DATE',
	'DATETIME',
	'TIME',
	'TIMESTAMP',
]);

/** Types where a top-N value list tells you something useful. */
const WORTH_TOP_N = new Set(['STRING', 'INT64', 'BOOL', 'DATE', 'NUMERIC', 'BIGNUMERIC']);

/**
 * Normalizes the several spellings BigQuery uses for the same type.
 * `bq show` reports INTEGER/FLOAT/BOOLEAN while INFORMATION_SCHEMA reports
 * INT64/FLOAT64/BOOL.
 */
export function normalizeType(raw: string): string {
	const head = (raw ?? '').trim().toUpperCase();
	if (head.startsWith('ARRAY<')) return 'ARRAY';
	if (head.startsWith('STRUCT<')) return 'STRUCT';
	const base = head.split('<')[0]!.split('(')[0]!.trim();
	switch (base) {
		case 'INTEGER':
			return 'INT64';
		case 'FLOAT':
			return 'FLOAT64';
		case 'BOOLEAN':
			return 'BOOL';
		case 'RECORD':
			return 'STRUCT';
		default:
			return base;
	}
}

/**
 * Quotes a dotted field path one segment at a time.
 *
 * Backticking the whole path would reference a column literally named
 * "campaigns.utm_source". Backticks inside a name are stripped so a column
 * name can never terminate the quoting early.
 */
export function quotePath(path: string): string {
	return path
		.split('.')
		.map((segment) => '`' + segment.replaceAll('`', '') + '`')
		.join('.');
}

/** Quotes `project.dataset.table` for use in a FROM clause. */
export function quoteTable(fullName: string): string {
	return quotePath(fullName);
}

/**
 * A leaf inside a REPEATED container cannot be selected directly; it needs
 * UNNEST, which would change row cardinality for every other column in the
 * scan. Such fields are reported as unreachable instead of profiled.
 */
export function isReachable(field: SchemaField, byPath: Map<string, SchemaField>): boolean {
	const parts = field.path.split('.');
	for (let i = 1; i < parts.length; i++) {
		const ancestor = byPath.get(parts.slice(0, i).join('.'));
		if (ancestor?.mode === 'REPEATED') return false;
	}
	return true;
}

/**
 * Chooses the statistics to collect for one field.
 *
 * @param index Position used to build a collision-proof alias prefix.
 * @param sketch Whether to emit an HLL sketch for join detection.
 */
export function planColumnStats(field: SchemaField, index: number, sketch: boolean): ColumnPlan {
	const col = quotePath(field.path);
	const p = `c${index}`;
	const type = normalizeType(field.baseType || field.dataType);
	const stats: StatExpr[] = [
		{ kind: 'nullCount', alias: `${p}_nullct`, expr: `COUNTIF(${col} IS NULL)`, leaves: 1 },
	];

	// ARRAY: not aggregatable. Length statistics are the most we can get
	// without a second scan through UNNEST.
	if (field.mode === 'REPEATED') {
		stats.push(
			{
				kind: 'arrayElements',
				alias: `${p}_elems`,
				expr: `SUM(ARRAY_LENGTH(${col}))`,
				leaves: 1,
			},
			{
				kind: 'arrayMaxLength',
				alias: `${p}_maxlen`,
				expr: `MAX(ARRAY_LENGTH(${col}))`,
				leaves: 1,
			},
		);
		return { field, stats };
	}

	// STRUCT containers and opaque types: a null count is all BigQuery allows.
	if (UNAGGREGATABLE.has(type)) return { field, stats };

	// JSON: groupable only once rendered to text.
	if (type === 'JSON') {
		stats.push({
			kind: 'ndv',
			alias: `${p}_ndv`,
			expr: `APPROX_COUNT_DISTINCT(TO_JSON_STRING(${col}))`,
			leaves: 1,
		});
		return { field, stats };
	}

	stats.push({
		kind: 'ndv',
		alias: `${p}_ndv`,
		expr: `APPROX_COUNT_DISTINCT(${col})`,
		leaves: 1,
	});

	if (ORDERABLE.has(type)) {
		stats.push(
			{ kind: 'min', alias: `${p}_min`, expr: `MIN(${col})`, leaves: 1 },
			{ kind: 'max', alias: `${p}_max`, expr: `MAX(${col})`, leaves: 1 },
		);
	}

	// APPROX_TOP_COUNT returns ARRAY<STRUCT<value, count>>: two leaf fields.
	if (WORTH_TOP_N.has(type)) {
		stats.push({
			kind: 'topValues',
			alias: `${p}_top`,
			expr: `APPROX_TOP_COUNT(${col}, ${TOP_N})`,
			leaves: 2,
		});
	}

	// Cast to STRING so an INT64 key and a STRING key produce mergeable
	// sketches. Without the cast a real cross-type join is invisible.
	if (sketch) {
		stats.push({
			kind: 'sketch',
			alias: `${p}_sketch`,
			expr: `TO_BASE64(HLL_COUNT.INIT(CAST(${col} AS STRING), ${HLL_PRECISION}))`,
			leaves: 1,
		});
	}

	return { field, stats };
}

/** Leaf output fields a set of columns would produce, including row_count. */
export function estimateLeafFields(fields: SchemaField[], sketchPaths: Set<string>): number {
	let leaves = 1; // row_count
	fields.forEach((field, i) => {
		for (const stat of planColumnStats(field, i, sketchPaths.has(field.path)).stats) {
			leaves += stat.leaves;
		}
	});
	return leaves;
}

/** Splits columns into groups that each stay under the leaf-field ceiling. */
export function chunkFields(
	fields: SchemaField[],
	sketchPaths: Set<string>,
	ceiling = LEAF_FIELD_CEILING,
): SchemaField[][] {
	const chunks: SchemaField[][] = [];
	let current: SchemaField[] = [];
	let leaves = 1; // row_count in every chunk

	for (const field of fields) {
		const cost = planColumnStats(field, 0, sketchPaths.has(field.path)).stats.reduce(
			(sum, s) => sum + s.leaves,
			0,
		);
		if (current.length > 0 && leaves + cost > ceiling) {
			chunks.push(current);
			current = [];
			leaves = 1;
		}
		current.push(field);
		leaves += cost;
	}
	if (current.length > 0) chunks.push(current);
	return chunks.length > 0 ? chunks : [[]];
}

export interface ProfileChunk {
	sql: string;
	/** Alias -> field path, used to read the single result row back. */
	aliasMap: Record<string, { path: string; kind: StatKind }>;
	fields: SchemaField[];
	/** Fields skipped because a REPEATED ancestor makes them unreachable. */
	unreachable: string[];
}

export interface BuildProfileOptions {
	fullName: string;
	fields: SchemaField[];
	sketchPaths: Set<string>;
	/** Partition predicate. The single biggest cost lever available. */
	whereClause?: string;
	/** Sampling percentage; dry-run estimates do reflect this. */
	tablesamplePercent?: number;
	ceiling?: number;
}

/** Builds one runnable profile query per chunk of columns. */
export function buildProfileChunks(options: BuildProfileOptions): ProfileChunk[] {
	const { fullName, fields, sketchPaths, whereClause, tablesamplePercent } = options;
	const byPath = new Map(fields.map((f) => [f.path, f]));

	const unreachable: string[] = [];
	const profilable = fields.filter((field) => {
		if (field.isContainer && normalizeType(field.baseType) === 'STRUCT') {
			// A STRUCT container yields only a null count; its leaves are
			// profiled individually, so it adds noise without information.
			if (field.mode !== 'REPEATED') return false;
		}
		if (!isReachable(field, byPath)) {
			unreachable.push(field.path);
			return false;
		}
		return true;
	});

	const from = quoteTable(fullName);
	const sample =
		tablesamplePercent && tablesamplePercent > 0
			? ` TABLESAMPLE SYSTEM (${tablesamplePercent} PERCENT)`
			: '';
	const where = whereClause ? `\nWHERE ${whereClause}` : '';

	return chunkFields(profilable, sketchPaths, options.ceiling).map((chunk) => {
		const aliasMap: ProfileChunk['aliasMap'] = {};
		const selects = ['COUNT(*) AS row_count'];

		chunk.forEach((field, i) => {
			for (const stat of planColumnStats(field, i, sketchPaths.has(field.path)).stats) {
				selects.push(`${stat.expr} AS ${stat.alias}`);
				aliasMap[stat.alias] = { path: field.path, kind: stat.kind };
			}
		});

		return {
			sql: `SELECT\n  ${selects.join(',\n  ')}\nFROM ${from}${sample}${where}`,
			aliasMap,
			fields: chunk,
			unreachable,
		};
	});
}
