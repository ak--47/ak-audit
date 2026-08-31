/**
 * Agent-facing Markdown.
 *
 * This is the half of the output built for reading rather than parsing. The
 * JSON files hold exact values; these files let an agent orient cheaply and
 * decide which JSON to open, without loading a whole dataset into context.
 *
 * Every table page ends with a ready-to-run, partition-pruned query, so the
 * step from "I understand this table" to "I can query it" needs no thought.
 */

import type {
	AnalysisResult,
	JoinEdge,
	TableAnalysis,
	TableMeta,
	TableProfile,
} from '../types.ts';
import { formatBytes } from '../warehouse/bigquery/client.ts';
import { quotePath } from '../warehouse/bigquery/profileSql.ts';
import { formatRate } from '../util/format.ts';
import type { TableUsage, UsageResult } from '../warehouse/bigquery/usage.ts';

function num(n: number | null | undefined): string {
	return n === null || n === undefined ? '—' : n.toLocaleString();
}

function bytes(n: number | null | undefined): string {
	return n === null || n === undefined ? '—' : formatBytes(n);
}

function escapeCell(text: string): string {
	return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function truncate(text: string, max = 48): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** One-line-per-table index, so an agent can find a table without opening many files. */
export function renderCatalog(
	analysis: AnalysisResult,
	tables: TableMeta[],
): string {
	const byName = new Map(tables.map((t) => [t.fullName, t]));
	const lines = [
		`# Catalog — ${analysis.dataset}`,
		'',
		`${analysis.tables.length} tables. Generated ${analysis.generatedAt}.`,
		'',
		'Open `analysis/tables/<table>.md` for detail, or `raw/<table>.json` and',
		'`profile/<table>.json` for exact values.',
		'',
		'| Table | Kind | Rows | Count from | Cols | Description |',
		'| --- | --- | --- | --- | --- | --- |',
	];

	for (const t of [...analysis.tables].sort((a, b) => a.table.localeCompare(b.table))) {
		const meta = byName.get(t.table);
		const short = meta?.table ?? t.table;
		lines.push(
			`| [${short}](tables/${short}.md) | ${t.kind} | ${num(t.rowCount)} | ` +
				`${meta?.rowCountSource ?? '—'} | ${t.columnCount} | ` +
				`${meta?.description ? escapeCell(truncate(meta.description, 100)) : '—'} |`,
		);
	}
	return lines.join('\n');
}

/**
 * Explains the folder to whoever opens it next.
 *
 * The output is meant to be read by an agent that has never seen this tool,
 * arriving at a directory of JSON with no context. Without a map it reads
 * every file to find out which one it wanted. This says where to look, and --
 * just as important -- which parts are absent rather than empty, so a missing
 * profile is never mistaken for a table with no data.
 */
function folderGuide(usage: UsageResult | null | undefined, profiled: boolean): string[] {
	const lines = [
		'## How to read this folder',
		'',
		'| Path | What is in it |',
		'| --- | --- |',
		'| `catalog.md` | Every table and column in one file. Search here first. |',
		'| `analysis/tables/*.md` | One page per table: columns, stats, relationships, a starter query. |',
		...(profiled
			? ['| `analysis/relationships.json` | Value-overlap edges between columns, with the evidence for each. |']
			: []),
		...(profiled ? ['| `analysis/joins.json` | The same edges as ready-to-run JOIN clauses. |'] : []),
		'| `raw/*.json` | Untouched metadata: schema, partitions, lineage, sample rows. |',
		...(profiled
			? ['| `profile/*.json` | Per-column statistics: nulls, distinct counts, ranges, top values. |']
			: []),
		...(usage ? ['| `usage.json` | Who queried each table, how often, and with what SQL. |'] : []),
		'| `ddl.sql` | Every table and view definition, concatenated. |',
		'| `manifest.json` | What ran, what it cost, and what was skipped and why. |',
		'| `report/index.html` | The same data as a browsable page. |',
		'',
		'Read `catalog.md` and this file before querying anything. Everything here',
		'is already on disk, so answering from it costs nothing.',
		'',
	];

	const caveats = [
		'Distinct counts, overlaps and containment are HyperLogLog estimates, not exact counts. Treat them as strong evidence, not as constraints.',
		'Row counts carry their source. A count from table metadata is exact; one from a partition sum can lag; `unavailable` means it could not be read at all.',
	];
	if (!profiled) {
		caveats.push(
			'This run did not profile any columns, so there are no statistics and no value-based relationships. That is an absence of measurement, not a finding about the data.',
		);
	}
	if (!usage) {
		caveats.push(
			'Query history was not collected, so nothing here says whether a table is actually read. Re-run with `--usage` to find out.',
		);
	} else if (usage.scope === 'user') {
		caveats.push(
			'Query history covers only the calling account, not the whole project. A table shown as unread may simply be read by someone else.',
		);
	}
	lines.push('### Before you trust a number', '', ...caveats.map((c) => `- ${c}`), '');
	return lines;
}

/** Dataset-level narrative: shape, relationships, and what to be careful about. */
export function renderOverview(
	analysis: AnalysisResult,
	tables: TableMeta[],
	profiles: TableProfile[],
	usage?: UsageResult | null,
): string {
	const byName = new Map(tables.map((t) => [t.fullName, t]));
	const shortName = (full: string) => byName.get(full)?.table ?? full;

	const totalRows = analysis.tables.reduce((sum, t) => sum + (t.rowCount ?? 0), 0);
	const totalBytes = analysis.tables.reduce((sum, t) => sum + (t.bytes ?? 0), 0);
	const views = analysis.tables.filter(
		(t) => t.kind === 'VIEW' || t.kind === 'MATERIALIZED_VIEW',
	);
	const spend = profiles.reduce((sum, p) => sum + p.bytesProcessed, 0);

	const lines = [
		`# ${analysis.dataset}`,
		'',
		`Generated ${analysis.generatedAt} by ak-audit.`,
		'',
		...folderGuide(usage, profiles.length > 0),
		'## Shape',
		'',
		`- ${analysis.tables.length} objects (${analysis.tables.length - views.length} tables, ${views.length} views)`,
		`- ${totalRows.toLocaleString()} rows, ${formatBytes(totalBytes)} logical`,
		`- ${analysis.joins.length} candidate relationships, ${analysis.lineage.length} lineage edges`,
		`- ${formatBytes(spend)} scanned while profiling`,
		'',
	];

	const fks = analysis.joins.filter((j) => j.kind === 'foreign-key' && !j.sameTable);
	if (fks.length > 0) {
		lines.push(
			'## Confirmed relationships',
			'',
			'Estimated from HyperLogLog sketches of real column values, not from',
			'column names. Containment is the share of the smaller side found in',
			'the larger, so 1.00 means every value has a match.',
			'',
			'| Child | Parent | Containment | Shared values |',
			'| --- | --- | --- | --- |',
		);
		for (const j of fks.slice(0, 40)) {
			lines.push(
				`| \`${shortName(j.from.table)}.${j.from.column}\` | ` +
					`\`${shortName(j.to.table)}.${j.to.column}\` | ` +
					`${j.containment.toFixed(2)} | ${num(j.intersection)} |`,
			);
		}
		lines.push('');
	}

	if (analysis.lineage.length > 0) {
		lines.push('## Lineage', '', 'Exact, read from each view\'s query plan.', '');
		for (const edge of analysis.lineage) {
			lines.push(`- \`${shortName(edge.from)}\` reads \`${shortName(edge.to)}\``);
		}
		lines.push('');
	}

	if (usage && usage.scope !== 'unavailable') {
		const ranked = Object.values(usage.tables).sort((a, b) => b.queries - a.queries);
		lines.push(
			'## How this dataset is used',
			'',
			usage.scope === 'user'
				? `Caller's own queries only, last ${usage.windowDays} days. ` +
					'Project-wide history needs bigquery.jobs.listAll.'
				: `All users, last ${usage.windowDays} days. ${usage.jobsSeen.toLocaleString()} queries.`,
			'',
			'| Table | Queries | Users | Scanned | Last read |',
			'| --- | --- | --- | --- | --- |',
		);
		for (const u of ranked.slice(0, 25)) {
			lines.push(
				`| \`${u.table}\`${u.present ? '' : ' *(gone)*'} | ${num(u.queries)} | ` +
					`${num(u.users)} | ${bytes(u.bytesScanned)} | ` +
					`${(u.lastQueried ?? '—').slice(0, 10)} |`,
			);
		}
		lines.push('');
		if (usage.absentTables.length > 0) {
			lines.push(
				`### Queried but no longer here (${usage.absentTables.length})`,
				'',
				'These names were read during the window and are not in the dataset now.',
				'Either they were dropped, or something still queries a table that has',
				'moved.',
				'',
				usage.absentTables.map((t) => `\`${t}\``).join(', '),
				'',
			);
		}
		if (usage.unusedTables.length > 0) {
			lines.push(
				`### Not read by anyone in ${usage.windowDays} days (${usage.unusedTables.length})`,
				'',
				usage.unusedTables.map((t) => `\`${t}\``).join(', '),
				'',
			);
		}
		if (usage.topUsers.length > 0) {
			lines.push(
				'### Most active readers',
				'',
				...usage.topUsers.slice(0, 10).map((x) => `- ${x.user} — ${num(x.queries)} queries`),
				'',
			);
		}
	}

	const warnings = analysis.findings.filter((f) => f.severity === 'warn');
	if (warnings.length > 0) {
		lines.push('## Warnings', '');
		for (const f of warnings.slice(0, 50)) {
			const where = f.column ? `\`${shortName(f.table)}.${f.column}\`` : `\`${shortName(f.table)}\``;
			lines.push(`- ${where} — ${f.message}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

export interface TablePageInput {
	meta: TableMeta;
	analysis: TableAnalysis;
	profile: TableProfile | undefined;
	joins: JoinEdge[];
	shortName: (fullName: string) => string;
	usage?: TableUsage | undefined;
	usageScope?: string | undefined;
	usageDays?: number | undefined;
}

/** Everything known about one table, including a query to start from. */
export function renderTablePage(input: TablePageInput): string {
	const { meta, analysis, profile, joins, shortName } = input;
	const stats = profile?.columns ?? {};

	const lines = [
		`# ${meta.table}`,
		'',
		`\`${meta.fullName}\` — ${meta.kind}`,
		'',
	];

	// The description is hand-written context and the single most useful
	// thing on the page, so it leads rather than trails the statistics.
	if (meta.description) lines.push(`> ${meta.description.replaceAll('\n', '\n> ')}`, '');
	if (Object.keys(meta.labels).length > 0) {
		lines.push(
			'Labels: ' +
				Object.entries(meta.labels)
					.map(([k, v]) => `\`${k}=${v}\``)
					.join(', '),
			'',
		);
	}

	lines.push(...[
		`- Rows: ${num(meta.rowCount)} (${meta.rowCountSource})`,
		`- Size: ${bytes(meta.bytes)}`,
		`- Columns: ${analysis.columnCount}`,
		`- Last modified: ${meta.lastModified ?? '—'}`,
	]);

	if (meta.partitioning) {
		lines.push(
			`- Partitioned by \`${meta.partitioning.field}\` (${meta.partitioning.granularity})` +
				`, ${meta.partitions.length} partitions`,
		);
	} else {
		lines.push('- Not partitioned');
	}
	if (meta.clustering.length > 0) {
		lines.push(`- Clustered by ${meta.clustering.map((c) => `\`${c}\``).join(', ')}`);
	}
	if (profile) {
		lines.push(`- Profiled using: ${profile.strategyDetail}`);
	}
	lines.push('');

	if (analysis.keyColumns.length > 0) {
		lines.push(
			'## Start here',
			'',
			`Most useful columns: ${analysis.keyColumns.map((c) => `\`${c}\``).join(', ')}`,
			'',
		);
	}

	const anyColumnDesc = meta.schema.some((f) => f.description);
	lines.push(
		'## Columns',
		'',
		anyColumnDesc
			? '| Column | Type | Role | Null % | Distinct | Description |'
			: '| Column | Type | Role | Null % | Distinct | Range |',
		'| --- | --- | --- | --- | --- | --- |',
	);
	for (const field of meta.schema) {
		if (field.isContainer) continue;
		const s = stats[field.path];
		const range =
			s?.min !== null && s?.min !== undefined && s?.max !== null && s?.max !== undefined
				? `${truncate(String(s.min), 20)} … ${truncate(String(s.max), 20)}`
				: '—';
		lines.push(
			`| \`${escapeCell(field.path)}\` | ${escapeCell(field.dataType)} | ` +
				`${analysis.roles[field.path] ?? '—'} | ` +
				`${formatRate(s?.nullRate)} | ` +
				`${num(s?.ndv)} | ` +
				`${anyColumnDesc ? escapeCell(truncate(field.description ?? '', 90)) || '—' : escapeCell(range)} |`,
		);
	}
	lines.push('');

	// Top values make the difference between knowing a column exists and
	// knowing what is actually in it.
	const withTop = meta.schema.filter((f) => (stats[f.path]?.topValues.length ?? 0) > 0);
	if (withTop.length > 0) {
		lines.push('## Common values', '');
		for (const field of withTop.slice(0, 25)) {
			const top = stats[field.path]!.topValues.slice(0, 8);
			const rendered = top
				.map((t) => `${t.value === null ? 'NULL' : `\`${truncate(String(t.value), 30)}\``} (${num(t.count)})`)
				.join(', ');
			lines.push(`- **${field.path}**: ${rendered}`);
		}
		lines.push('');
	}

	const related = joins.filter(
		(j) => j.from.table === meta.fullName || j.to.table === meta.fullName,
	);
	if (related.length > 0) {
		lines.push(
			'## Relationships',
			'',
			'| This column | Joins | Kind | Containment | Shared |',
			'| --- | --- | --- | --- | --- |',
		);
		for (const j of related.slice(0, 30)) {
			const mine = j.from.table === meta.fullName ? j.from : j.to;
			const other = j.from.table === meta.fullName ? j.to : j.from;
			lines.push(
				`| \`${mine.column}\` | \`${shortName(other.table)}.${other.column}\` | ` +
					`${j.kind} | ${j.containment.toFixed(2)} | ${num(j.intersection)} |`,
			);
		}
		lines.push('');
	}

	if (meta.references.length > 0) {
		lines.push('## Reads from', '');
		for (const ref of meta.references) lines.push(`- \`${shortName(ref)}\``);
		lines.push('');
	}

	if (analysis.findings.length > 0) {
		lines.push('## Notes', '');
		for (const f of analysis.findings) {
			lines.push(`- ${f.column ? `\`${f.column}\` — ` : ''}${f.message}`);
		}
		lines.push('');
	}

	if (input.usage) {
		const u = input.usage;
		lines.push(
			'## How it is used',
			'',
			input.usageScope === 'user'
				? `Caller's own queries only, last ${input.usageDays} days.`
				: `All users, last ${input.usageDays} days.`,
			'',
			`- Queried **${num(u.queries)}** times by **${num(u.users)}** user(s)`,
			`- Last read: ${u.lastQueried ?? '—'}`,
			`- Scanned ${bytes(u.bytesScanned)} in total`,
			'',
		);
		if (u.topUsers.length > 0) {
			lines.push('Top readers: ' + u.topUsers.slice(0, 5)
				.map((x) => `${x.user} (${x.queries})`).join(', '), '');
		}
		if (u.coAccessed.length > 0) {
			lines.push(
				'Most often queried alongside:',
				'',
				...u.coAccessed.slice(0, 8).map((c) => `- \`${shortName(c.table)}\` — ${num(c.queries)} queries`),
				'',
			);
		}
		if (u.examples.length > 0) {
			lines.push('### Example queries', '');
			for (const ex of u.examples.slice(0, 3)) {
				lines.push(`_${ex.user ?? 'unknown'} · ${(ex.at ?? '').slice(0, 16)}_`, '', '```sql', ex.sql.trim(), '```', '');
			}
		}
	}

	if (meta.samples.length > 0) {
		lines.push(
			'## Sample rows',
			'',
			`${meta.samples.length} rows, read from storage metadata at no query cost.`,
			'',
			'```json',
			JSON.stringify(meta.samples.slice(0, 3), null, 2),
			'```',
			'',
		);
	}

	lines.push('## Query it', '', '```sql', buildStarterQuery(meta), '```', '');

	if (meta.ddl) {
		lines.push('## DDL', '', '```sql', meta.ddl.trim(), '```', '');
	}

	return lines.join('\n');
}

/**
 * A correct starting query for a table.
 *
 * Partitioned tables get a filter on the partition column, because a query
 * without one scans everything — the single most expensive mistake to make
 * against these tables.
 */
export function buildStarterQuery(meta: TableMeta): string {
	const from = quotePath(meta.fullName);
	if (!meta.partitioning) return `SELECT *\nFROM ${from}\nLIMIT 100;`;

	const field =
		meta.partitioning.kind === 'ingestion-time'
			? '`_PARTITIONTIME`'
			: quotePath(meta.partitioning.field);

	if (meta.partitioning.kind === 'range') {
		return (
			`SELECT *\nFROM ${from}\n` +
			`-- keep the partition filter: without it this scans every partition\n` +
			`WHERE ${field} >= 0\nLIMIT 100;`
		);
	}

	const latest = [...meta.partitions]
		.filter((p) => p.rows > 0 && !p.partitionId.startsWith('__'))
		.sort((a, b) => b.partitionId.localeCompare(a.partitionId))[0];
	const day = latest ? formatPartitionDate(latest.partitionId) : 'CURRENT_DATE()';

	return (
		`SELECT *\nFROM ${from}\n` +
		`-- keep the partition filter: without it this scans every partition\n` +
		`WHERE ${field} >= TIMESTAMP(${day === 'CURRENT_DATE()' ? 'CURRENT_DATE()' : `"${day}"`})\n` +
		`LIMIT 100;`
	);
}

function formatPartitionDate(id: string): string {
	if (id.length === 8) return `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
	if (id.length === 10) return `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
	if (id.length === 6) return `${id.slice(0, 4)}-${id.slice(4, 6)}-01`;
	if (id.length === 4) return `${id}-01-01`;
	return 'CURRENT_DATE()';
}
