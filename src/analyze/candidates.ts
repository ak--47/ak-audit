/**
 * Chooses which columns get an HLL sketch during the profile scan.
 *
 * Sketches ride along in a scan already being paid for, so each one is
 * nearly free — but they are not free to store or to compare, since the
 * merge step is quadratic in the number of sketched columns. This module
 * keeps that number bounded.
 *
 * Selection is deliberately generous about what might be a key and strict
 * about volume. A missed candidate costs a discovered relationship; an
 * unbounded candidate list costs a slow, noisy merge.
 */

import type { SchemaField, TableMeta } from '../types.ts';
import { normalizeType } from '../warehouse/bigquery/profileSql.ts';
import { GENERIC_NAMES, isIdentifierName, KEY_TYPES, NUMERIC_KEY_TYPES } from './patterns.ts';

/** Upper bound on sketched columns per table. */
export const MAX_SKETCHES_PER_TABLE = 40;

export interface CandidateSelection {
	/** Field paths to sketch, per table full name. */
	byTable: Map<string, Set<string>>;
	/** Why each column was chosen, for the report's evidence trail. */
	reasons: Map<string, string>;
}

function leafName(path: string): string {
	return (path.split('.').at(-1) ?? path).toLowerCase();
}

function eligible(field: SchemaField): boolean {
	if (field.mode === 'REPEATED') return false;
	if (field.isContainer) return false;
	return KEY_TYPES.has(normalizeType(field.baseType || field.dataType));
}

/**
 * Selects sketch candidates across the whole dataset.
 *
 * A column qualifies when its name looks like an identifier, or when the
 * same leaf name appears in more than one table. The second rule is what
 * finds keys with project-specific names that no pattern would predict.
 */
export function selectJoinCandidates(tables: TableMeta[]): CandidateSelection {
	// Count how many distinct tables use each leaf name.
	const tablesPerName = new Map<string, Set<string>>();
	for (const table of tables) {
		for (const field of table.schema) {
			if (!eligible(field)) continue;
			const leaf = leafName(field.path);
			let seen = tablesPerName.get(leaf);
			if (!seen) tablesPerName.set(leaf, (seen = new Set()));
			seen.add(table.fullName);
		}
	}

	const byTable = new Map<string, Set<string>>();
	const reasons = new Map<string, string>();

	for (const table of tables) {
		const scored: { path: string; score: number; reason: string }[] = [];

		for (const field of table.schema) {
			if (!eligible(field)) continue;
			const leaf = leafName(field.path);
			const shared = tablesPerName.get(leaf)?.size ?? 0;
			const looksLikeId = isIdentifierName(field.path);
			const isGeneric = GENERIC_NAMES.has(leaf);
			const isNumeric = NUMERIC_KEY_TYPES.has(
				normalizeType(field.baseType || field.dataType),
			);

			// A shared generic name like `name` or `status` matches across
			// unrelated tables by coincidence. Skip unless it also reads as
			// an identifier.
			if (isGeneric && !looksLikeId) continue;

			// Numeric columns must be named like identifiers. Sharing a name
			// is not enough: measured columns such as `impressions` and
			// `screen_width` hold small integers that overlap every other
			// small-integer column, producing confident false relationships.
			if (isNumeric && !looksLikeId) continue;

			if (!looksLikeId && shared < 2) continue;

			const reasonParts: string[] = [];
			let score = 0;
			if (looksLikeId) {
				score += 10;
				reasonParts.push('name reads as an identifier');
			}
			if (shared >= 2) {
				score += Math.min(shared, 8);
				reasonParts.push(`name appears in ${shared} tables`);
			}
			// Clustering and partitioning columns are keys in practice.
			if (field.clusteringPosition !== null) {
				score += 5;
				reasonParts.push('clustering column');
			}
			if (!field.isNested) score += 2;

			scored.push({ path: field.path, score, reason: reasonParts.join('; ') });
		}

		scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
		const chosen = scored.slice(0, MAX_SKETCHES_PER_TABLE);

		byTable.set(table.fullName, new Set(chosen.map((c) => c.path)));
		for (const c of chosen) reasons.set(`${table.fullName}.${c.path}`, c.reason);
	}

	return { byTable, reasons };
}
