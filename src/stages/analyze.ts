/**
 * Stage 3: analyze.
 *
 * Pure and local. No network, no cost, so scoring can be re-run and
 * iterated on freely — the best property of the original tool's design and
 * the reason the pipeline stays split.
 */

import type {
	AnalysisResult,
	ColumnRole,
	Finding,
	JoinEdge,
	LineageEdge,
	TableAnalysis,
	TableMeta,
	TableProfile,
} from '../types.ts';
import { findDuplicateColumnFindings, findTableFindings } from '../analyze/findings.ts';
import { classifyColumn, rankKeyColumns } from '../analyze/roles.ts';
import { TEMPORAL_TYPES } from '../analyze/patterns.ts';
import { normalizeType } from '../warehouse/bigquery/profileSql.ts';

export interface AnalyzeInput {
	dataset: string;
	tables: TableMeta[];
	profiles: TableProfile[];
	joins: JoinEdge[];
}

export function runAnalyze(input: AnalyzeInput): AnalysisResult {
	const { dataset, tables, profiles, joins } = input;
	const profileByTable = new Map(profiles.map((p) => [p.table, p]));

	// Which columns take part in a confirmed relationship, so role ranking
	// can prefer evidence over naming guesses.
	const relatedByTable = new Map<string, Set<string>>();
	const neighbours = new Map<string, Set<string>>();
	for (const edge of joins) {
		for (const [self, other] of [
			[edge.from, edge.to],
			[edge.to, edge.from],
		] as const) {
			let cols = relatedByTable.get(self.table);
			if (!cols) relatedByTable.set(self.table, (cols = new Set()));
			cols.add(self.column);

			if (self.table !== other.table) {
				let near = neighbours.get(self.table);
				if (!near) neighbours.set(self.table, (near = new Set()));
				near.add(other.table);
			}
		}
	}

	const lineage: LineageEdge[] = [];
	for (const table of tables) {
		for (const upstream of table.references) {
			lineage.push({ from: table.fullName, to: upstream });
			// A view reading a table is a relationship worth showing.
			let near = neighbours.get(table.fullName);
			if (!near) neighbours.set(table.fullName, (near = new Set()));
			near.add(upstream);
			let back = neighbours.get(upstream);
			if (!back) neighbours.set(upstream, (back = new Set()));
			back.add(table.fullName);
		}
	}

	const duplicateFindings = findDuplicateColumnFindings(joins);
	const allFindings: Finding[] = [...duplicateFindings];

	const analyses: TableAnalysis[] = tables.map((table) => {
		const profile = profileByTable.get(table.fullName);
		const stats = profile?.columns ?? {};
		const rowsScanned = profile?.rowsScanned ?? null;

		const roles: Record<string, ColumnRole> = {};
		for (const field of table.schema) {
			roles[field.path] = classifyColumn(field, stats[field.path], rowsScanned);
		}

		const findings = [
			...findTableFindings(table, profile),
			...duplicateFindings.filter((f) => f.table === table.fullName),
		];
		allFindings.push(...findTableFindings(table, profile));

		const timeColumns = table.schema
			.filter(
				(f) =>
					TEMPORAL_TYPES.has(normalizeType(f.baseType || f.dataType)) && !f.isContainer,
			)
			// Partitioning columns are the cheapest way to filter, so they lead.
			.sort((a, b) => Number(b.isPartitioningColumn) - Number(a.isPartitioningColumn))
			.map((f) => f.path);

		return {
			table: table.fullName,
			kind: table.kind,
			rowCount: table.rowCount,
			bytes: table.bytes,
			columnCount: table.schema.filter((f) => !f.isContainer).length,
			roles,
			keyColumns: rankKeyColumns(
				table.schema,
				roles,
				stats,
				relatedByTable.get(table.fullName) ?? new Set(),
			),
			timeColumns,
			relatedTables: [...(neighbours.get(table.fullName) ?? [])].sort(),
			findings,
		};
	});

	return {
		dataset,
		generatedAt: new Date().toISOString(),
		tables: analyses,
		joins,
		lineage,
		findings: dedupe(allFindings),
	};
}

function dedupe(findings: Finding[]): Finding[] {
	const seen = new Set<string>();
	const out: Finding[] = [];
	for (const f of findings) {
		const key = `${f.table}|${f.column}|${f.kind}|${f.message}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(f);
	}
	return out;
}
