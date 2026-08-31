/**
 * Notable observations about a dataset.
 *
 * Findings answer "what should I know before I trust this table" — empty
 * tables, columns that are always null, columns that never vary, stale
 * data, and large tables that will be expensive to query. They are
 * observations, not a score; the old tool graded datasets, which turned out
 * to be less useful than plainly stating what is unusual.
 */

import type { Finding, JoinEdge, TableMeta, TableProfile } from '../types.ts';

/** Days without a write after which a table is called stale. */
export const STALE_DAYS = 90;

/** Bytes above which an unpartitioned table is worth warning about. */
export const LARGE_UNPARTITIONED_BYTES = 100 * 1024 ** 3;

/** Null rate above which a column is barely populated. */
export const MOSTLY_NULL_RATE = 0.95;

export function findTableFindings(
	table: TableMeta,
	profile: TableProfile | undefined,
	now = Date.now(),
): Finding[] {
	const findings: Finding[] = [];
	const add = (
		kind: string,
		severity: Finding['severity'],
		message: string,
		column: string | null = null,
	) => findings.push({ kind, severity, table: table.fullName, column, message });

	if (table.rowCount === 0) {
		add('empty-table', 'warn', 'Table has no rows.');
	}

	if (table.errors.length > 0) {
		for (const error of table.errors) add('extract-error', 'warn', error);
	}

	if (
		table.kind === 'TABLE' &&
		!table.partitioning &&
		table.bytes !== null &&
		table.bytes > LARGE_UNPARTITIONED_BYTES
	) {
		add(
			'large-unpartitioned',
			'warn',
			'Large table with no partitioning; every query scans the whole table.',
		);
	}

	if (table.lastModified) {
		const age = now - Date.parse(table.lastModified);
		const days = Math.floor(age / 86_400_000);
		if (Number.isFinite(days) && days > STALE_DAYS) {
			add('stale', 'info', `No writes for ${days} days.`);
		}
	}

	if (profile?.skipped) {
		add('not-profiled', 'info', `Column statistics skipped: ${profile.skipped}`);
	}

	if (profile && !profile.skipped) {
		const scanned = profile.rowsScanned ?? 0;
		for (const stats of Object.values(profile.columns)) {
			if (stats.skipped) continue;

			if (scanned > 0 && stats.nullCount === scanned) {
				add('all-null', 'warn', 'Every sampled value is null.', stats.path);
				continue;
			}
			if (stats.nullRate !== null && stats.nullRate >= MOSTLY_NULL_RATE) {
				add(
					'mostly-null',
					'info',
					`${Math.round(stats.nullRate * 100)}% null in the sampled rows.`,
					stats.path,
				);
			}
			if (stats.ndv === 1 && scanned > 1) {
				const only = stats.topValues[0]?.value;
				add(
					'constant',
					'info',
					only === null || only === undefined
						? 'Only one distinct value.'
						: `Only one distinct value: ${truncate(only)}.`,
					stats.path,
				);
			}
		}
	}

	return findings;
}

/** Turns confirmed duplicate-column edges into findings. */
export function findDuplicateColumnFindings(edges: JoinEdge[]): Finding[] {
	return edges
		.filter((e) => e.kind === 'duplicate' && e.sameTable)
		.map((e) => ({
			kind: 'duplicate-column',
			severity: 'info' as const,
			table: e.from.table,
			column: e.from.column,
			message:
				`Holds the same set of values as ${e.to.column} ` +
				`(~${e.from.ndv.toLocaleString()} distinct in both).`,
		}));
}

function truncate(text: string, max = 60): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
