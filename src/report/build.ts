/**
 * Stage 4: build the HTML report.
 *
 * Placeholder implementation; the real UI lands next.
 */

import { join } from 'node:path';
import { layout, writeText } from '../output/writers.ts';
import { loadJoins, loadProfiles, loadTables } from '../pipeline.ts';

export async function buildReport(outDir: string): Promise<string> {
	const dirs = layout(outDir);
	const [tables, profiles, joins] = await Promise.all([
		loadTables(outDir),
		loadProfiles(outDir),
		loadJoins(outDir),
	]);
	const path = join(dirs.report, 'index.html');
	await writeText(
		path,
		`<!doctype html><meta charset="utf-8"><title>ak-audit</title>
<pre>${tables.length} tables, ${profiles.length} profiles, ${joins.length} joins</pre>`,
	);
	return path;
}
