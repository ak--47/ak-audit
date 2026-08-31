/**
 * Builds the compact data payload embedded in the HTML report.
 *
 * The report is one self-contained file, so every byte here ships to the
 * browser. Values are truncated and samples capped: the report exists to
 * find and preview things quickly, and the exact values already live in the
 * JSON files beside it.
 */

import type {
	AnalysisResult,
	ColumnRole,
	Finding,
	TableMeta,
	TableProfile,
} from '../types.ts';
import { buildStarterQuery } from '../output/markdown.ts';

/** Sample rows embedded per table. */
export const MAX_SAMPLE_ROWS = 12;

/** Characters kept per sampled cell. */
export const MAX_CELL_CHARS = 300;

/** Top values embedded per column. */
export const MAX_TOP_VALUES = 8;

export interface ReportColumn {
	p: string;
	/** Declared type. */
	t: string;
	r: ColumnRole;
	/** Null rate, 0-1, or null when not profiled. */
	n: number | null;
	/** Distinct values. */
	d: number | null;
	min: string | null;
	max: string | null;
	top: { v: string | null; c: number }[];
	/** Flags: partitioning, clustering, nested, repeated. */
	part: boolean;
	clus: boolean;
	nest: boolean;
	rep: boolean;
}

export interface ReportRelation {
	col: string;
	table: string;
	otherCol: string;
	kind: string;
	containment: number;
	shared: number;
	direction: 'out' | 'in';
}

export interface ReportTable {
	name: string;
	full: string;
	kind: string;
	rows: number | null;
	bytes: number | null;
	lastModified: string | null;
	partitionField: string | null;
	partitionGranularity: string | null;
	partitionCount: number;
	clustering: string[];
	columns: ReportColumn[];
	samples: Record<string, unknown>[];
	relations: ReportRelation[];
	reads: string[];
	readBy: string[];
	findings: Finding[];
	sql: string;
	ddl: string | null;
	profileNote: string;
}

export interface ReportPayload {
	dataset: string;
	generatedAt: string;
	totals: {
		tables: number;
		views: number;
		rows: number;
		bytes: number;
		relationships: number;
		columns: number;
		bytesScanned: number;
		costUsd: number;
	};
	tables: ReportTable[];
	findings: Finding[];
}

function truncate(value: unknown): unknown {
	if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
		return `${value.slice(0, MAX_CELL_CHARS)}… (${value.length} chars)`;
	}
	if (Array.isArray(value)) return value.map(truncate);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = truncate(v);
		return out;
	}
	return value;
}

export function buildPayload(
	analysis: AnalysisResult,
	tables: TableMeta[],
	profiles: TableProfile[],
): ReportPayload {
	const metaByName = new Map(tables.map((t) => [t.fullName, t]));
	const profileByName = new Map(profiles.map((p) => [p.table, p]));
	const analysisByName = new Map(analysis.tables.map((a) => [a.table, a]));
	const short = (full: string) => metaByName.get(full)?.table ?? full.split('.').at(-1) ?? full;

	// Views record what they read; invert that so a table also shows its readers.
	const readBy = new Map<string, string[]>();
	for (const edge of analysis.lineage) {
		const list = readBy.get(edge.to) ?? [];
		list.push(short(edge.from));
		readBy.set(edge.to, list);
	}

	const reportTables: ReportTable[] = tables.map((meta) => {
		const profile = profileByName.get(meta.fullName);
		const tableAnalysis = analysisByName.get(meta.fullName);
		const stats = profile?.columns ?? {};

		const columns: ReportColumn[] = meta.schema
			.filter((f) => !f.isContainer)
			.map((f) => {
				const s = stats[f.path];
				return {
					p: f.path,
					t: f.dataType,
					r: tableAnalysis?.roles[f.path] ?? 'unknown',
					n: s?.nullRate ?? null,
					d: s?.ndv ?? null,
					min: s?.min ?? null,
					max: s?.max ?? null,
					top: (s?.topValues ?? []).slice(0, MAX_TOP_VALUES).map((t) => ({
						v: t.value,
						c: t.count,
					})),
					part: f.isPartitioningColumn,
					clus: f.clusteringPosition !== null,
					nest: f.isNested,
					rep: f.mode === 'REPEATED',
				};
			});

		const relations: ReportRelation[] = analysis.joins
			.filter((j) => j.from.table === meta.fullName || j.to.table === meta.fullName)
			.map((j) => {
				const outbound = j.from.table === meta.fullName;
				const mine = outbound ? j.from : j.to;
				const other = outbound ? j.to : j.from;
				return {
					col: mine.column,
					table: short(other.table),
					otherCol: other.column,
					kind: j.kind,
					containment: j.containment,
					shared: j.intersection,
					direction: outbound ? ('out' as const) : ('in' as const),
				};
			})
			.sort((a, b) => b.containment - a.containment);

		return {
			name: meta.table,
			full: meta.fullName,
			kind: meta.kind,
			rows: meta.rowCount,
			bytes: meta.bytes,
			lastModified: meta.lastModified,
			partitionField: meta.partitioning?.field ?? null,
			partitionGranularity: meta.partitioning?.granularity ?? null,
			partitionCount: meta.partitions.length,
			clustering: meta.clustering,
			columns,
			samples: meta.samples
				.slice(0, MAX_SAMPLE_ROWS)
				.map((row) => truncate(row) as Record<string, unknown>),
			relations,
			reads: meta.references.map(short),
			readBy: readBy.get(meta.fullName) ?? [],
			findings: tableAnalysis?.findings ?? [],
			sql: buildStarterQuery(meta),
			ddl: meta.ddl,
			profileNote: profile?.skipped
				? `Not profiled: ${profile.skipped}`
				: (profile?.strategyDetail ?? 'Not profiled'),
		};
	});

	reportTables.sort((a, b) => a.name.localeCompare(b.name));

	const bytesScanned = profiles.reduce((sum, p) => sum + p.bytesProcessed, 0);

	return {
		dataset: analysis.dataset,
		generatedAt: analysis.generatedAt,
		totals: {
			tables: reportTables.filter((t) => t.kind === 'TABLE').length,
			views: reportTables.filter((t) => t.kind !== 'TABLE').length,
			rows: reportTables.reduce((sum, t) => sum + (t.rows ?? 0), 0),
			bytes: reportTables.reduce((sum, t) => sum + (t.bytes ?? 0), 0),
			relationships: analysis.joins.length,
			columns: reportTables.reduce((sum, t) => sum + t.columns.length, 0),
			bytesScanned,
			costUsd: (bytesScanned / 1024 ** 4) * 6.25,
		},
		tables: reportTables,
		findings: analysis.findings,
	};
}
