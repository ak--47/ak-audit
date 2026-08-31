/**
 * Option parsing shared by every subcommand.
 */

import { DEFAULT_LIMITS } from './warehouse/bigquery/budget.ts';

export interface CommonOptions {
	out: string;
	auth?: string;
	location?: string;
	tables?: string;
	samples: string;
	concurrency: string;
	maxBytesPerTable?: string;
	maxBytesTotal?: string;
	partitions: string;
	force?: boolean;
	quiet?: boolean;
	noProfile?: boolean;
	exactRows?: boolean;
	countBudget?: string;
	maxCost?: string;
	maxTotalCost?: string;
	usage?: boolean;
	usageDays?: string;
	usageMaxBytes?: string;
	queryText?: boolean;
	estimate?: boolean;
	full?: boolean;
}

export interface Target {
	project: string;
	dataset: string;
}

/**
 * Accepts `project.dataset` or a bare `dataset` when a default project is
 * available from gcloud configuration or the environment.
 */
export function parseTarget(input: string | undefined, fallbackProject?: string): Target {
	if (!input) throw new Error('Specify a target as project.dataset');

	const parts = input.split('.').filter(Boolean);
	if (parts.length >= 2) {
		return { project: parts.slice(0, -1).join('.'), dataset: parts.at(-1)! };
	}

	const project =
		fallbackProject ??
		process.env['GOOGLE_CLOUD_PROJECT'] ??
		process.env['GCLOUD_PROJECT'];
	if (!project) {
		throw new Error(
			`Cannot infer a project from "${input}". Pass it as project.dataset, ` +
				'or set GOOGLE_CLOUD_PROJECT.',
		);
	}
	return { project, dataset: parts[0]! };
}

/**
 * Compiles a comma-separated list of table names or globs into a predicate.
 * `*` matches any run of characters; everything else is literal.
 */
export function buildTableFilter(spec: string | undefined): ((name: string) => boolean) | undefined {
	if (!spec) return undefined;
	const patterns = spec
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (patterns.length === 0) return undefined;

	const regexes = patterns.map(
		(p) =>
			new RegExp(
				'^' + p.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : `\\${m}`)) + '$',
				'i',
			),
	);
	return (name: string) => regexes.some((r) => r.test(name));
}

/** Parses `$5`, `5`, `2.50` into dollars. */
export function parseUsd(input: string): number {
	const n = Number(String(input).trim().replace(/^\$/, ''));
	if (!Number.isFinite(n) || n < 0) throw new Error(`Cannot read a dollar amount from "${input}"`);
	return n;
}

/** Parses `50GB`, `2.5TB`, `1024`, and similar. */
export function parseBytes(input: string): number {
	const match = /^\s*([\d.]+)\s*([KMGTP]?B?)\s*$/i.exec(input);
	if (!match) throw new Error(`Cannot read a byte size from "${input}"`);
	const value = Number(match[1]);
	const unit = (match[2] ?? '').toUpperCase().replace('B', '');
	const scale: Record<string, number> = {
		'': 1,
		K: 1024,
		M: 1024 ** 2,
		G: 1024 ** 3,
		T: 1024 ** 4,
		P: 1024 ** 5,
	};
	const factor = scale[unit];
	if (factor === undefined) throw new Error(`Unknown byte unit in "${input}"`);
	return Math.round(value * factor);
}

export function parseIntOption(input: string, name: string): number {
	const n = Number.parseInt(input, 10);
	if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
	return n;
}

export const DEFAULTS = {
	out: './output',
	samples: '20',
	concurrency: '8',
	partitions: '3',
	maxBytesPerTable: `${DEFAULT_LIMITS.maxBytesPerTable}`,
	maxBytesTotal: `${DEFAULT_LIMITS.maxBytesTotal}`,
};
