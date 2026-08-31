/**
 * Stage orchestration and on-disk state.
 *
 * Stages talk to each other only through files, so any stage can run alone
 * against whatever the previous one left behind. Re-running `analyze` and
 * `report` therefore costs nothing and takes no time, which is what makes
 * iterating on scoring or on the report practical.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
	AnalysisResult,
	JoinEdge,
	RunManifest,
	TableMeta,
	TableProfile,
} from './types.ts';
import { layout, readJson, writeJson, writeText } from './output/writers.ts';
import { renderCatalog, renderOverview, renderTablePage } from './output/markdown.ts';

export const TOOL_VERSION = '2.0.0';

async function readDir<T>(dir: string): Promise<T[]> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}
	const out: T[] = [];
	for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
		const value = await readJson<T>(join(dir, name));
		if (value) out.push(value);
	}
	return out;
}

export function loadTables(outDir: string): Promise<TableMeta[]> {
	return readDir<TableMeta>(layout(outDir).raw);
}

export function loadProfiles(outDir: string): Promise<TableProfile[]> {
	return readDir<TableProfile>(layout(outDir).profile);
}

export async function loadJoins(outDir: string): Promise<JoinEdge[]> {
	const dirs = layout(outDir);
	return (await readJson<JoinEdge[]>(join(dirs.analysis, 'joins.json'))) ?? [];
}

export async function saveJoins(outDir: string, joins: JoinEdge[]): Promise<void> {
	await writeJson(join(layout(outDir).analysis, 'joins.json'), joins);
}

/** Writes every stage-3 artifact: JSON for exactness, Markdown for reading. */
export async function writeAnalysis(
	outDir: string,
	analysis: AnalysisResult,
	tables: TableMeta[],
	profiles: TableProfile[],
): Promise<void> {
	const dirs = layout(outDir);
	const byName = new Map(tables.map((t) => [t.fullName, t]));
	const profileByName = new Map(profiles.map((p) => [p.table, p]));
	const shortName = (full: string) => byName.get(full)?.table ?? full;

	await writeJson(join(dirs.analysis, 'relationships.json'), {
		dataset: analysis.dataset,
		generatedAt: analysis.generatedAt,
		joins: analysis.joins,
		lineage: analysis.lineage,
	});
	await writeJson(join(dirs.analysis, 'analysis.json'), analysis);
	await writeText(join(dirs.root, 'catalog.md'), renderCatalog(analysis, tables));
	await writeText(join(dirs.root, 'overview.md'), renderOverview(analysis, tables, profiles));

	// A single DDL file is free to produce and is exactly what an agent
	// writing SQL wants to read first.
	const ddl = tables
		.filter((t) => t.ddl)
		.map((t) => `-- ${t.fullName}\n${t.ddl!.trim()}`)
		.join('\n\n');
	if (ddl) await writeText(join(dirs.root, 'ddl.sql'), ddl);

	for (const tableAnalysis of analysis.tables) {
		const meta = byName.get(tableAnalysis.table);
		if (!meta) continue;
		await writeText(
			join(dirs.analysisTables, `${meta.table}.md`),
			renderTablePage({
				meta,
				analysis: tableAnalysis,
				profile: profileByName.get(meta.fullName),
				joins: analysis.joins,
				shortName,
			}),
		);
	}
}

export interface ManifestInput {
	project: string;
	dataset: string;
	location: string;
	options: Record<string, unknown>;
	discovered: number;
	tables: TableMeta[];
	profiles: TableProfile[];
	stages: RunManifest['stages'];
}

export async function writeManifest(outDir: string, input: ManifestInput): Promise<RunManifest> {
	const bytesProcessed = input.profiles.reduce((sum, p) => sum + p.bytesProcessed, 0);
	const manifest: RunManifest = {
		tool: 'ak-audit',
		version: TOOL_VERSION,
		generatedAt: new Date().toISOString(),
		project: input.project,
		dataset: input.dataset,
		location: input.location,
		options: input.options,
		tablesDiscovered: input.discovered,
		tablesExtracted: input.tables.length,
		tablesProfiled: input.profiles.filter((p) => !p.skipped).length,
		tablesSkipped: input.profiles
			.filter((p) => p.skipped)
			.map((p) => ({ table: p.table, reason: p.skipped! })),
		bytesProcessed,
		estimatedCostUsd: (bytesProcessed / 1024 ** 4) * 6.25,
		stages: input.stages,
	};
	await writeJson(join(layout(outDir).root, 'manifest.json'), manifest);
	return manifest;
}

export async function loadManifest(outDir: string): Promise<RunManifest | null> {
	return readJson<RunManifest>(join(layout(outDir).root, 'manifest.json'));
}
