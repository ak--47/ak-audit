#!/usr/bin/env node
/**
 * Builds a cross-dataset inventory summary from the ak-audit output folders.
 *
 * Answers the three things the requester asked for per table -- real row
 * count, columns and types, table-or-view -- and, just as importantly, says
 * where each row count came from, so nothing has to be taken on trust.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(homedir(), 'tmp');
const DATASETS = [
	'dbt_aeng',
	'sales_intelligence',
	'dbt',
	'dbt_sources',
	'p3_json_export',
	'pylon_operations',
];

const n = (v) => (v === null || v === undefined ? '—' : v.toLocaleString());
const esc = (s) => String(s ?? '').replaceAll('|', '\\|');

function load(dataset) {
	const raw = join(ROOT, dataset, 'raw');
	if (!existsSync(raw)) return null;
	const tables = readdirSync(raw)
		.filter((f) => f.endsWith('.json'))
		.map((f) => JSON.parse(readFileSync(join(raw, f), 'utf8')));
	let manifest = null;
	const mp = join(ROOT, dataset, 'manifest.json');
	if (existsSync(mp)) {
		try {
			manifest = JSON.parse(readFileSync(mp, 'utf8'));
		} catch {}
	}
	return { dataset, tables, manifest };
}

const loaded = DATASETS.map(load).filter(Boolean);

// ---------- top-level summary ----------
const out = [
	'# Mixpanel internal data — inventory',
	'',
	`Generated ${new Date().toISOString()} by ak-audit.`,
	'',
	'Per table this records the **real row count**, every column name and',
	'type, and whether it is a table or a view.',
	'',
	'## Why the row counts here differ from the metadata views',
	'',
	'BigQuery reports `numRows: 0` for a plain view rather than reporting',
	'nothing, so any tool reading table metadata concludes every view is dead.',
	'That is the drift already noticed in `sales_intelligence`. Counts below',
	'come from the cheapest *exact* source available, and each row says which:',
	'',
	'| Source | Meaning | Cost |',
	'| --- | --- | --- |',
	'| `partitions` | Summed per-partition counts. Exact. | free |',
	'| `table-metadata` | The table\'s own count. Exact. Base tables only. | free |',
	'| `count-query` | A real `COUNT(*)`. The only option for a view. | a scan |',
	'| `storage-metadata` | Region storage view. Absent for views. | free |',
	'| `unavailable` | No count could be obtained. | — |',
	'',
	'## Datasets',
	'',
	'| Dataset | Objects | Tables | Views | Total rows | Columns | Report |',
	'| --- | --- | --- | --- | --- | --- | --- |',
];

for (const { dataset, tables } of loaded) {
	const views = tables.filter((t) => t.kind !== 'TABLE');
	const rows = tables.reduce((s, t) => s + (t.rowCount ?? 0), 0);
	const cols = tables.reduce((s, t) => s + t.schema.filter((f) => !f.isContainer).length, 0);
	out.push(
		`| [${dataset}](${dataset}/catalog.md) | ${tables.length} | ` +
			`${tables.length - views.length} | ${views.length} | ${n(rows)} | ${n(cols)} | ` +
			`[html](${dataset}/report/index.html) |`,
	);
}

// ---------- per dataset ----------
for (const { dataset, tables, manifest } of loaded) {
	out.push('', `## ${dataset}`, '');
	if (manifest) {
		out.push(
			`Scanned ${(manifest.bytesProcessed / 1024 ** 3).toFixed(2)} GB ` +
				`(~$${manifest.estimatedCostUsd.toFixed(2)}). ` +
				`${manifest.tablesProfiled} of ${manifest.tablesExtracted} profiled.`,
			'',
		);
	}

	const bySource = {};
	for (const t of tables) bySource[t.rowCountSource] = (bySource[t.rowCountSource] ?? 0) + 1;
	out.push(
		'Row counts by source: ' +
			Object.entries(bySource)
				.map(([k, v]) => `${k} ${v}`)
				.join(', '),
		'',
	);

	const missing = tables.filter((t) => t.rowCount === null);
	if (missing.length > 0) {
		out.push(`**${missing.length} table(s) without a row count:** ` +
			missing.map((t) => `\`${t.table}\``).join(', '), '');
	}

	const empty = tables.filter((t) => t.rowCount === 0);
	if (empty.length > 0) {
		out.push(
			`**${empty.length} genuinely empty:** ` + empty.map((t) => `\`${t.table}\``).join(', '),
			'',
		);
	}

	out.push(
		'| Table | Kind | Rows | Count from | Cols | Partitioned | Last modified |',
		'| --- | --- | --- | --- | --- | --- | --- |',
	);
	for (const t of [...tables].sort((a, b) => a.table.localeCompare(b.table))) {
		out.push(
			`| \`${esc(t.table)}\` | ${t.kind === 'TABLE' ? 'table' : t.kind.toLowerCase().replace('_', ' ')} | ` +
				`${n(t.rowCount)} | ${t.rowCountSource} | ` +
				`${t.schema.filter((f) => !f.isContainer).length} | ` +
				`${t.partitioning ? `${t.partitioning.field} (${t.partitioning.granularity})` : '—'} | ` +
				`${t.lastModified ? t.lastModified.slice(0, 10) : '—'} |`,
		);
	}
}

writeFileSync(join(ROOT, 'INVENTORY.md'), out.join('\n') + '\n');

// ---------- machine-readable ----------
const columnsCsv = ['dataset,table,kind,row_count,row_count_source,column,data_type,mode'];
for (const { dataset, tables } of loaded) {
	for (const t of tables) {
		for (const f of t.schema) {
			columnsCsv.push(
				[
					dataset,
					t.table,
					t.kind,
					t.rowCount ?? '',
					t.rowCountSource,
					f.path,
					`"${String(f.dataType).replaceAll('"', '""')}"`,
					f.mode,
				].join(','),
			);
		}
	}
}
writeFileSync(join(ROOT, 'all_columns.csv'), columnsCsv.join('\n') + '\n');

const tablesCsv = [
	'dataset,table,kind,row_count,row_count_source,columns,partition_field,require_partition_filter,last_modified',
];
for (const { dataset, tables } of loaded) {
	for (const t of tables) {
		tablesCsv.push(
			[
				dataset,
				t.table,
				t.kind,
				t.rowCount ?? '',
				t.rowCountSource,
				t.schema.filter((f) => !f.isContainer).length,
				t.partitioning?.field ?? '',
				t.requirePartitionFilter,
				t.lastModified ?? '',
			].join(','),
		);
	}
}
writeFileSync(join(ROOT, 'all_tables.csv'), tablesCsv.join('\n') + '\n');

const totalTables = loaded.reduce((s, d) => s + d.tables.length, 0);
const totalCols = columnsCsv.length - 1;
console.log(`INVENTORY.md      ${loaded.length} datasets, ${totalTables} tables`);
console.log(`all_tables.csv    ${totalTables} rows`);
console.log(`all_columns.csv   ${totalCols} rows`);
