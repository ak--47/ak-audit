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
		'| Table | Kind | Rows | Size | Cols | Key columns | Related |',
		'| --- | --- | --- | --- | --- | --- | --- |',
	];

	for (const t of [...analysis.tables].sort((a, b) => a.table.localeCompare(b.table))) {
		const meta = byName.get(t.table);
		const short = meta?.table ?? t.table;
		lines.push(
			`| [${short}](tables/${short}.md) | ${t.kind} | ${num(t.rowCount)} | ` +
				`${bytes(t.bytes)} | ${t.columnCount} | ` +
				`${escapeCell(t.keyColumns.slice(0, 3).join(', ')) || '—'} | ` +
				`${t.relatedTables.length} |`,
		);
	}
	return lines.join('\n');
}

/** Dataset-level narrative: shape, relationships, and what to be careful about. */
export function renderOverview(
	analysis: AnalysisResult,
	tables: TableMeta[],
	profiles: TableProfile[],
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
		`- Rows: ${num(meta.rowCount)}`,
		`- Size: ${bytes(meta.bytes)}`,
		`- Columns: ${analysis.columnCount}`,
		`- Last modified: ${meta.lastModified ?? '—'}`,
	];

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

	lines.push('## Columns', '', '| Column | Type | Role | Null % | Distinct | Range |', '| --- | --- | --- | --- | --- | --- |');
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
				`${num(s?.ndv)} | ${escapeCell(range)} |`,
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
