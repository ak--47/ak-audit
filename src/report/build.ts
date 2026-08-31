/**
 * Stage 4: build the HTML report.
 *
 * Local and free. Reads whatever the earlier stages left on disk, so the
 * report can be rebuilt instantly while iterating on its design.
 */

import { join } from 'node:path';
import { layout, readJson, writeText } from '../output/writers.ts';
import { loadProfiles, loadTables } from '../pipeline.ts';
import type { AnalysisResult } from '../types.ts';
import type { UsageResult } from '../warehouse/bigquery/usage.ts';
import { buildPayload } from './payload.ts';
import { renderHtml } from './template.ts';

export async function buildReport(outDir: string): Promise<string> {
	const dirs = layout(outDir);
	const [tables, profiles, analysis, usage] = await Promise.all([
		loadTables(outDir),
		loadProfiles(outDir),
		readJson<AnalysisResult>(join(dirs.analysis, 'analysis.json')),
		readJson<UsageResult>(join(dirs.root, 'usage.json')),
	]);

	if (!analysis) {
		throw new Error(`No analysis in ${outDir}. Run "ak-audit analyze" first.`);
	}

	const html = renderHtml(buildPayload(analysis, tables, profiles, usage));
	const path = join(dirs.report, 'index.html');
	await writeText(path, html);
	return path;
}
