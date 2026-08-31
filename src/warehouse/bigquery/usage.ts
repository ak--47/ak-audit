/**
 * Reads query history, to show how a dataset is actually used.
 *
 * Schema tells you what a table holds. It cannot tell you whether anyone
 * reads it, who, how often, or which tables they read alongside it. That
 * is the dimension this adds, and it is the one that says which tables
 * matter and which are dead weight.
 *
 * Two things about `INFORMATION_SCHEMA.JOBS` are easy to get wrong:
 *
 *  - **It is not free metadata.** Measured, a 30-day window over one real
 *    project billed 66 GB (about $0.38), scaling roughly linearly with the
 *    window at ~$0.013 per day. It is budgeted like any other scan.
 *  - **Access is uneven.** `JOBS_BY_PROJECT` needs `bigquery.jobs.listAll`
 *    at project level, which a reader often lacks. Where it is denied the
 *    only fallback is `JOBS_BY_USER`, which sees the caller's own queries
 *    and nobody else's. That answers a different question, so the source is
 *    always recorded rather than quietly substituted.
 *
 * One scan pulls the raw job rows; every aggregate is computed locally, so
 * added dimensions cost nothing extra.
 */

import type { BigQueryClient } from './client.ts';
import { log } from '../../util/log.ts';

/** Which system view the history came from. They answer different questions. */
export type UsageScope =
	/** Every user's jobs in the project. */
	| 'project'
	/** Only the calling user's jobs. */
	| 'user'
	/** No history could be read. */
	| 'unavailable';

/** Characters of SQL kept per example query. */
export const MAX_QUERY_CHARS = 4000;

/** Example queries kept per table. */
export const EXAMPLES_PER_TABLE = 5;

/** Job rows pulled in one run. */
export const MAX_JOBS = 50_000;

export interface JobRow {
	job_id: string;
	user_email: string | null;
	creation_time: string | null;
	total_bytes_processed: string | number | null;
	cache_hit: boolean | string | null;
	statement_type: string | null;
	query: string | null;
	referenced_tables: { project_id: string; dataset_id: string; table_id: string }[] | null;
}

export interface UsageQueryExample {
	jobId: string;
	user: string | null;
	at: string | null;
	bytes: number;
	sql: string;
}

/** How a table's usage was detected. They are not equally reliable. */
export type UsageDetection =
	/** BigQuery listed the table in the job's referenced tables. Exact. */
	| 'referenced'
	/** The table's name was found in the query text. Views only; approximate. */
	| 'named-in-sql';

export interface TableUsage {
	table: string;
	/**
	 * How this table's usage was found.
	 *
	 * Querying a view resolves to its underlying tables, so a view never
	 * appears in `referenced_tables` and would otherwise look unread. Views
	 * are matched by name in the query text instead, which is approximate:
	 * a view named like a common word can over-count.
	 */
	detection: UsageDetection;
	queries: number;
	users: number;
	topUsers: { user: string; queries: number }[];
	bytesScanned: number;
	lastQueried: string | null;
	firstQueried: string | null;
	cacheHits: number;
	statementTypes: Record<string, number>;
	/** Tables read in the same query, with how often. */
	coAccessed: { table: string; queries: number }[];
	examples: UsageQueryExample[];
}

export interface UsageResult {
	scope: UsageScope;
	windowDays: number;
	/** Jobs examined after filtering to this dataset. */
	jobsSeen: number;
	bytesProcessed: number;
	tables: Record<string, TableUsage>;
	topUsers: { user: string; queries: number }[];
	/** Tables in the dataset that no job touched in the window. */
	unusedTables: string[];
	truncated: boolean;
	note: string;
}

/** Region-qualified system view name, e.g. `region-us`. */
function regionName(location: string): string {
	const loc = location.toLowerCase();
	return loc.startsWith('region-') ? loc : `region-${loc}`;
}

function jobsSql(
	project: string,
	location: string,
	dataset: string,
	days: number,
	scope: 'PROJECT' | 'USER',
): string {
	const safeDataset = dataset.replaceAll("'", '');
	return `
SELECT
  job_id,
  user_email,
  CAST(creation_time AS STRING) AS creation_time,
  total_bytes_processed,
  cache_hit,
  statement_type,
  SUBSTR(query, 1, ${MAX_QUERY_CHARS}) AS query,
  referenced_tables
FROM \`${project}\`.\`${regionName(location)}\`.INFORMATION_SCHEMA.JOBS_BY_${scope}
WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)
  AND job_type = 'QUERY'
  AND state = 'DONE'
  AND error_result IS NULL
  AND EXISTS (
    SELECT 1 FROM UNNEST(referenced_tables) t WHERE t.dataset_id = '${safeDataset}'
  )
ORDER BY creation_time DESC
LIMIT ${MAX_JOBS}`;
}

function toNumber(v: unknown): number {
	if (v === null || v === undefined) return 0;
	const n = Number(typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v);
	return Number.isFinite(n) ? n : 0;
}

function isTrue(v: unknown): boolean {
	return v === true || v === 'true';
}

/**
 * Whether a query's text refers to a table by name.
 *
 * Used only for views, which never appear in `referenced_tables`. Word
 * boundaries keep `orders` from matching `orders_archive`, but a view named
 * after a common word can still over-count, so callers label the result as
 * approximate rather than exact.
 */
export function mentionsTable(sql: string | null, table: string): boolean {
	if (!sql || !table) return false;
	const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(sql);
}

export interface FetchUsageOptions {
	client: BigQueryClient;
	dataset: string;
	location: string;
	days: number;
	/** Table names in the dataset, used to report which went unread. */
	knownTables: string[];
	/** View names, matched by name in SQL because they never appear as refs. */
	viewNames?: string[];
	/** Refuse the scan above this many bytes. */
	maxBytes: number;
	/** Keep raw SQL examples. */
	includeQueryText: boolean;
}

/**
 * Fetches and aggregates query history for one dataset.
 *
 * Falls back from project-wide to caller-only history when permission is
 * missing, and says which it used. It never silently substitutes one for
 * the other, because "nobody queries this table" and "I have not queried
 * this table" are very different claims.
 */
export async function fetchUsage(options: FetchUsageOptions): Promise<UsageResult> {
	const { client, dataset, location, days, knownTables } = options;
	const viewNames = options.viewNames ?? [];

	const empty = (scope: UsageScope, note: string): UsageResult => ({
		scope,
		windowDays: days,
		jobsSeen: 0,
		bytesProcessed: 0,
		tables: {},
		topUsers: [],
		unusedTables: [],
		truncated: false,
		note,
	});

	let rows: JobRow[] = [];
	let scope: UsageScope = 'unavailable';
	let bytesProcessed = 0;
	let note = '';

	for (const attempt of ['PROJECT', 'USER'] as const) {
		const sql = jobsSql(client.project, location, dataset, days, attempt);
		try {
			const estimate = await client.dryRun(sql);
			if (estimate > options.maxBytes) {
				return empty(
					'unavailable',
					`query history skipped: a ${days}-day window would scan ` +
						`${(estimate / 1024 ** 3).toFixed(1)} GB, over the limit`,
				);
			}
			const result = await client.query<JobRow>(sql);
			rows = result.rows;
			bytesProcessed = result.bytesProcessed;
			scope = attempt === 'PROJECT' ? 'project' : 'user';
			note =
				attempt === 'PROJECT'
					? `every user's queries in ${client.project}`
					: `only the calling user's own queries — ` +
						'project-wide history needs bigquery.jobs.listAll';
			break;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (attempt === 'PROJECT' && /Access Denied|permission/i.test(message)) {
				log.detail('project-wide job history denied; falling back to own jobs');
				continue;
			}
			return empty('unavailable', `query history unavailable: ${message.split('\n')[0]}`);
		}
	}

	if (scope === 'unavailable') return empty('unavailable', 'query history unavailable');

	// Everything below is local aggregation over the single scan above.
	const tables = new Map<string, TableUsage>();
	const userTotals = new Map<string, number>();
	const coCounts = new Map<string, Map<string, number>>();

	for (const row of rows) {
		// INFORMATION_SCHEMA views appear as referenced tables but are not
		// part of the dataset's contents.
		const refs = (row.referenced_tables ?? []).filter(
			(t) => t.dataset_id === dataset && !t.table_id.startsWith('INFORMATION_SCHEMA'),
		);
		const namedViews = viewNames.filter((v) => mentionsTable(row.query, v));
		if (refs.length === 0 && namedViews.length === 0) continue;

		const user = row.user_email ?? null;
		if (user) userTotals.set(user, (userTotals.get(user) ?? 0) + 1);

		const bytes = toNumber(row.total_bytes_processed);
		const all = (row.referenced_tables ?? [])
			.filter((t) => !t.table_id.startsWith('INFORMATION_SCHEMA'))
			.map((t) => `${t.project_id}.${t.dataset_id}.${t.table_id}`);

		const touched: { name: string; detection: UsageDetection }[] = [
			...refs.map((r) => ({ name: r.table_id, detection: 'referenced' as const })),
			...namedViews.map((v) => ({ name: v, detection: 'named-in-sql' as const })),
		];

		for (const ref of touched) {
			const name = ref.name;
			let u = tables.get(name);
			if (!u) {
				u = {
					table: name,
					detection: ref.detection,
					queries: 0,
					users: 0,
					topUsers: [],
					bytesScanned: 0,
					lastQueried: null,
					firstQueried: null,
					cacheHits: 0,
					statementTypes: {},
					coAccessed: [],
					examples: [],
				};
				tables.set(name, u);
			}

			u.queries++;
			u.bytesScanned += bytes;
			if (isTrue(row.cache_hit)) u.cacheHits++;
			const st = row.statement_type ?? 'UNKNOWN';
			u.statementTypes[st] = (u.statementTypes[st] ?? 0) + 1;

			if (row.creation_time) {
				if (!u.lastQueried || row.creation_time > u.lastQueried) u.lastQueried = row.creation_time;
				if (!u.firstQueried || row.creation_time < u.firstQueried) {
					u.firstQueried = row.creation_time;
				}
			}

			// Per-table user tallies, folded into topUsers at the end.
			const perUser = (u as unknown as { _users?: Map<string, number> })._users ?? new Map();
			if (user) perUser.set(user, (perUser.get(user) ?? 0) + 1);
			(u as unknown as { _users?: Map<string, number> })._users = perUser;

			let co = coCounts.get(name);
			if (!co) coCounts.set(name, (co = new Map()));
			for (const other of all) {
				const short = other.split('.').at(-1)!;
				if (short === name) continue;
				co.set(other, (co.get(other) ?? 0) + 1);
			}

			if (options.includeQueryText && row.query && u.examples.length < EXAMPLES_PER_TABLE) {
				u.examples.push({
					jobId: row.job_id,
					user,
					at: row.creation_time,
					bytes,
					sql: row.query,
				});
			}
		}
	}

	for (const [name, u] of tables) {
		const perUser = (u as unknown as { _users?: Map<string, number> })._users ?? new Map();
		u.users = perUser.size;
		u.topUsers = [...perUser.entries()]
			.map(([user, queries]) => ({ user, queries }))
			.sort((a, b) => b.queries - a.queries)
			.slice(0, 10);
		delete (u as unknown as { _users?: Map<string, number> })._users;

		u.coAccessed = [...(coCounts.get(name) ?? new Map()).entries()]
			.map(([table, queries]) => ({ table, queries }))
			.sort((a, b) => b.queries - a.queries)
			.slice(0, 10);
	}

	// A table nobody read in the window is the most actionable thing here.
	const unusedTables = knownTables.filter((t) => !tables.has(t)).sort();

	return {
		scope,
		windowDays: days,
		jobsSeen: rows.length,
		bytesProcessed,
		tables: Object.fromEntries(tables),
		topUsers: [...userTotals.entries()]
			.map(([user, queries]) => ({ user, queries }))
			.sort((a, b) => b.queries - a.queries)
			.slice(0, 25),
		unusedTables,
		truncated: rows.length >= MAX_JOBS,
		note,
	};
}

export { jobsSql };
