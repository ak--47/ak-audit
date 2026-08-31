/**
 * Classifies what a column is for.
 *
 * Names alone are unreliable, and statistics alone are ambiguous, so this
 * uses both. Cardinality is the deciding evidence: a column named `user_id`
 * holding three distinct values across a million rows is a category, not an
 * identifier, whatever it is called.
 */

import type { ColumnRole, ColumnStats, SchemaField } from '../types.ts';
import { normalizeType } from '../warehouse/bigquery/profileSql.ts';
import {
	FLAG_PATTERN,
	isIdentifierName,
	isTemporalName,
	MEASURE_PATTERN,
	NUMERIC_TYPES,
	TEMPORAL_TYPES,
	TEXT_PATTERN,
} from './patterns.ts';

/** Distinct-to-row ratio above which a column can identify a row. */
export const IDENTIFIER_UNIQUENESS = 0.9;

/** Distinct count below which a column behaves as a category. */
export const CATEGORICAL_MAX_NDV = 1000;

export function classifyColumn(
	field: SchemaField,
	stats: ColumnStats | undefined,
	rowsScanned: number | null,
): ColumnRole {
	const type = normalizeType(field.baseType || field.dataType);

	if (field.isContainer || type === 'STRUCT') return 'structural';
	if (TEMPORAL_TYPES.has(type)) return 'timestamp';
	if (type === 'BOOL') return 'flag';

	const name = field.name;
	const ndv = stats?.ndv ?? null;
	const uniqueness = ndv !== null && rowsScanned && rowsScanned > 0 ? ndv / rowsScanned : null;

	// A high-cardinality column with an identifier-shaped name is a key.
	// Requiring both keeps `status` out and keeps a genuinely unique
	// `order_ref` in.
	if (isIdentifierName(name)) {
		if (uniqueness === null || uniqueness >= 0.05) return 'identifier';
		return 'categorical';
	}

	if (uniqueness !== null && uniqueness >= IDENTIFIER_UNIQUENESS && type === 'STRING') {
		return 'identifier';
	}

	if (isTemporalName(name)) return 'timestamp';
	if (FLAG_PATTERN.test(name)) return 'flag';

	if (NUMERIC_TYPES.has(type)) {
		if (MEASURE_PATTERN.test(name)) return 'measure';
		// Low-cardinality numbers act as codes rather than quantities.
		if (ndv !== null && ndv <= 50) return 'categorical';
		return 'measure';
	}

	if (type === 'STRING') {
		if (TEXT_PATTERN.test(name)) return 'text';
		if (ndv !== null && ndv <= CATEGORICAL_MAX_NDV) return 'categorical';
		return 'text';
	}

	if (type === 'JSON') return 'structural';
	return 'unknown';
}

/**
 * Ranks the columns worth querying first.
 *
 * These become the suggested starting points in the report and the entry
 * points an agent reads before deciding what to select.
 */
export function rankKeyColumns(
	fields: SchemaField[],
	roles: Record<string, ColumnRole>,
	stats: Record<string, ColumnStats>,
	relatedColumns: Set<string>,
): string[] {
	return fields
		.filter((f) => !f.isContainer)
		.map((f) => {
			let score = 0;
			if (roles[f.path] === 'identifier') score += 10;
			// A confirmed relationship outweighs any naming guess.
			if (relatedColumns.has(f.path)) score += 20;
			if (f.clusteringPosition !== null) score += 8;
			if (f.isPartitioningColumn) score += 6;
			if (!f.isNested) score += 2;
			const nullRate = stats[f.path]?.nullRate;
			if (nullRate !== null && nullRate !== undefined && nullRate > 0.9) score -= 10;
			return { path: f.path, score };
		})
		.filter((c) => c.score > 0)
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
		.slice(0, 12)
		.map((c) => c.path);
}
