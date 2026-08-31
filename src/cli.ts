#!/usr/bin/env -S node --import tsx
/**
 * ak-audit — maps a BigQuery dataset for agents and humans.
 *
 * Auth defaults to Application Default Credentials. `--auth <file>` uses a
 * service-account key instead.
 */

import { Command } from 'commander';
import {
	buildTableFilter,
	DEFAULTS,
	parseBytes,
	parseIntOption,
	parseTarget,
	parseUsd,
	type CommonOptions,
} from './config.ts';
import { BigQueryClient, estimateCostUsd, formatBytes } from './warehouse/bigquery/client.ts';
import { BudgetTracker, usdToBytes } from './warehouse/bigquery/budget.ts';
import { detectJoins, tablePairKey } from './warehouse/bigquery/sketches.ts';
import { selectJoinCandidates } from './analyze/candidates.ts';
import { runExtract } from './stages/extract.ts';
import { runProfile } from './stages/profile.ts';
import { runAnalyze } from './stages/analyze.ts';
import { loadUsage, runUsage } from './stages/usage.ts';
import { buildReport } from './report/build.ts';
import {
	loadJoins,
	loadProfiles,
	loadTables,
	saveJoins,
	TOOL_VERSION,
	writeAnalysis,
	writeManifest,
} from './pipeline.ts';
import type { RunManifest } from './types.ts';
import { color, log, setQuiet } from './util/log.ts';
import { layout } from './output/writers.ts';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const program = new Command();

program
	.name('ak-audit')
	.description('Map a BigQuery dataset: metadata, column stats, relationships, and a report.')
	.version(TOOL_VERSION);

function common(cmd: Command): Command {
	return cmd
		.option('-o, --out <dir>', 'output directory', DEFAULTS.out)
		.option('--auth <file>', 'service-account key file (default: application default credentials)')
		.option('--location <loc>', 'dataset region (default: detected)')
		.option('-t, --tables <list>', 'comma-separated table names or globs')
		.option('-s, --samples <n>', 'sample rows per table', DEFAULTS.samples)
		.option('-c, --concurrency <n>', 'tables processed in parallel', DEFAULTS.concurrency)
		.option('--partitions <n>', 'recent partitions to profile', DEFAULTS.partitions)
		.option('--max-cost <usd>', 'ceiling on what any one query may cost', '5')
		.option('--max-total-cost <usd>', 'ceiling on what the whole run may cost', '25')
		.option('--max-bytes-per-table <size>', 'per-query ceiling as bytes (overrides --max-cost)')
		.option('--max-bytes-total <size>', 'run ceiling as bytes (overrides --max-total-cost)')
		.option('--full', 'scan whole tables instead of pruning or sampling')
		.option('--usage', 'read query history: who queries what, and what goes unread')
		.option('--usage-days <n>', 'query-history window in days', '30')
		.option('--usage-max-bytes <size>', 'ceiling on the query-history scan', '150GB')
		.option('--no-query-text', 'omit example SQL from usage output')
		.option('--no-exact-rows', 'skip the COUNT(*) fallback used for views')
		.option('--count-budget <size>', 'ceiling on one exact row count', '20GB')
		.option('-f, --force', 're-fetch tables already on disk')
		.option('-q, --quiet', 'suppress progress output');
}

interface Session {
	client: BigQueryClient;
	project: string;
	dataset: string;
	budget: BudgetTracker;
	concurrency: number;
	samples: number;
	partitions: number;
	filter: ((name: string) => boolean) | undefined;
	force: boolean;
	full: boolean;
}

async function openSession(target: string | undefined, options: CommonOptions): Promise<Session> {
	setQuiet(Boolean(options.quiet));
	const { project, dataset } = parseTarget(target, await defaultProject());

	const client = new BigQueryClient({
		project,
		...(options.location ? { location: options.location } : {}),
		...(options.auth ? { authFile: options.auth } : {}),
	});

	log.step(`ak-audit ${TOOL_VERSION}`);
	log.info(`Target: ${color.bold(`${project}.${dataset}`)}`);
	log.info(`Auth:   ${options.auth ? `key file ${options.auth}` : 'application default credentials'}`);

	try {
		log.info(`Access: ${await client.testConnection()}`);
	} catch (error) {
		throw new Error(
			`Cannot reach BigQuery as configured: ${error instanceof Error ? error.message : error}\n` +
				'Run `gcloud auth application-default login`, or pass --auth <key.json>.',
		);
	}

	return {
		client,
		project,
		dataset,
		// Dollars are the primary interface; the byte flags stay as an escape
		// hatch for anyone who would rather think in scan size.
		budget: new BudgetTracker({
			maxBytesPerTable: options.maxBytesPerTable
				? parseBytes(options.maxBytesPerTable)
				: usdToBytes(parseUsd(options.maxCost ?? '5')),
			maxBytesTotal: options.maxBytesTotal
				? parseBytes(options.maxBytesTotal)
				: usdToBytes(parseUsd(options.maxTotalCost ?? '25')),
		}),
		concurrency: parseIntOption(options.concurrency, 'concurrency') || 8,
		samples: parseIntOption(options.samples, 'samples'),
		partitions: parseIntOption(options.partitions, 'partitions'),
		filter: buildTableFilter(options.tables),
		force: Boolean(options.force),
		full: Boolean(options.full),
	};
}

/** Reads the active gcloud project so a bare dataset name can work. */
async function defaultProject(): Promise<string | undefined> {
	if (process.env['GOOGLE_CLOUD_PROJECT']) return process.env['GOOGLE_CLOUD_PROJECT'];
	try {
		const { stdout } = await execFileAsync('gcloud', ['config', 'get-value', 'project']);
		const value = stdout.trim();
		return value && value !== '(unset)' ? value : undefined;
	} catch {
		return undefined;
	}
}

const stages: RunManifest['stages'] = {};

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
	const started = Date.now();
	const result = await fn();
	stages[name] = { ranAt: new Date(started).toISOString(), durationMs: Date.now() - started };
	return result;
}

common(program.command('extract'))
	.argument('<target>', 'project.dataset')
	.description('Read schemas, DDL, partitions, lineage and samples. Costs almost nothing.')
	.action(async (target: string, options: CommonOptions) => {
		const session = await openSession(target, options);
		await timed('extract', () => extractStage(session, options));
		log.success(`Wrote ${join(options.out, 'raw')}`);
	});

common(program.command('profile'))
	.argument('<target>', 'project.dataset')
	.option('--estimate', 'dry-run only: report projected cost, run nothing')
	.description('Measure column statistics. This is the stage that costs money.')
	.action(async (target: string, options: CommonOptions) => {
		const session = await openSession(target, options);
		const tables = await loadTables(options.out);
		if (tables.length === 0) {
			throw new Error(`No extracted tables in ${options.out}. Run "ak-audit extract" first.`);
		}
		await timed('profile', () => profileStage(session, tables, options));
	});

common(program.command('usage'))
	.argument('<target>', 'project.dataset')
	.description('Read query history: who queries what, and which tables go unread.')
	.action(async (target: string, options: CommonOptions) => {
		const session = await openSession(target, options);
		const tables = await loadTables(options.out);
		if (tables.length === 0) {
			throw new Error(`No extracted tables in ${options.out}. Run "ak-audit extract" first.`);
		}
		await timed('usage', () => usageStage(session, tables, options));
	});

common(program.command('analyze'))
	.description('Build relationships and write agent-facing docs. Local and free.')
	.action(async (options: CommonOptions) => {
		setQuiet(Boolean(options.quiet));
		await timed('analyze', () => analyzeStage(options));
	});

common(program.command('report'))
	.description('Build the HTML report. Local and free.')
	.action(async (options: CommonOptions) => {
		setQuiet(Boolean(options.quiet));
		await timed('report', () => reportStage(options));
	});

common(program.command('audit', { isDefault: true }))
	.argument('<target>', 'project.dataset')
	.option('--estimate', 'dry-run only: report projected cost, run nothing')
	.option('--no-profile', 'skip column statistics entirely')
	.description('Run every stage: extract, profile, analyze, report.')
	.action(async (target: string, options: CommonOptions) => {
		const session = await openSession(target, options);
		const started = Date.now();

		const { tables, discovered } = await timed('extract', () =>
			extractStage(session, options),
		);

		// Commander maps --no-profile to profile: false.
		const wantProfile = (options as unknown as { profile?: boolean }).profile !== false;
		const { profiles, joins } = wantProfile
			? await timed('profile', () => profileStage(session, tables, options))
			: { profiles: [], joins: [] };

		if (options.usage) await timed('usage', () => usageStage(session, tables, options));

		if (options.estimate) {
			log.step('Estimate only — nothing was executed');
			return;
		}

		await timed('analyze', () => analyzeStage(options, { tables, profiles, joins }));
		await timed('report', () => reportStage(options));

		const location = session.client.location ?? 'US';
		const manifest = await writeManifest(options.out, {
			project: session.project,
			dataset: session.dataset,
			location,
			options: {
				samples: session.samples,
				partitions: session.partitions,
				tables: options.tables ?? null,
				full: session.full,
				profiled: wantProfile,
			},
			discovered,
			tables,
			profiles,
			stages,
		});

		log.step('Done');
		log.info(`${manifest.tablesExtracted} tables, ${manifest.tablesProfiled} profiled`);
		log.info(
			`Scanned ${formatBytes(manifest.bytesProcessed)} ` +
				`(~$${manifest.estimatedCostUsd.toFixed(2)}) in ` +
				`${((Date.now() - started) / 1000).toFixed(1)}s`,
		);
		if (manifest.tablesSkipped.length > 0) {
			log.warn(
				`${manifest.tablesSkipped.length} table(s) skipped, declining ` +
					`${formatBytes(manifest.bytesDeclined)} ` +
					`(~$${((manifest.bytesDeclined / 1024 ** 4) * 6.25).toFixed(2)}); see manifest.json`,
			);
		}
		log.plain('');
		log.plain(`  Report:  ${color.bold(join(options.out, 'report', 'index.html'))}`);
		log.plain(`  Catalog: ${color.bold(join(options.out, 'catalog.md'))}`);
		log.plain('');
	});

async function extractStage(session: Session, options: CommonOptions) {
	return runExtract({
		client: session.client,
		dataset: session.dataset,
		outDir: options.out,
		sampleRows: session.samples,
		...(session.filter ? { tableFilter: session.filter } : {}),
		concurrency: session.concurrency,
		force: session.force,
		// Commander maps --no-exact-rows to exactRows: false.
		exactRowCounts: (options as unknown as { exactRows?: boolean }).exactRows !== false,
		countBudgetBytes: options.countBudget
			? parseBytes(options.countBudget)
			: usdToBytes(parseUsd(options.maxCost ?? '5')),
		budget: session.budget,
	});
}

async function profileStage(
	session: Session,
	tables: Awaited<ReturnType<typeof loadTables>>,
	options: CommonOptions,
) {
	const { profiles, estimatedBytes } = await runProfile({
		client: session.client,
		tables,
		outDir: options.out,
		budget: session.budget,
		concurrency: session.concurrency,
		force: session.force,
		estimateOnly: Boolean(options.estimate),
		partitionLookback: session.partitions,
		fullScan: session.full,
	});

	if (options.estimate) {
		log.step('Projected cost');
		log.info(
			`${formatBytes(estimatedBytes)} would be scanned ` +
				`(~$${estimateCostUsd(estimatedBytes).toFixed(2)})`,
		);
		log.info('Nothing was executed. Remove --estimate to run it.');
		return { profiles, joins: [] };
	}

	const candidates = selectJoinCandidates(tables);
	const lineagePairs = new Set<string>();
	for (const table of tables) {
		for (const upstream of table.references) {
			lineagePairs.add(tablePairKey(table.fullName, upstream));
		}
	}

	const joins = await detectJoins({
		client: session.client,
		profiles,
		reasons: candidates.reasons,
		lineagePairs,
	});
	await saveJoins(options.out, joins);

	log.info(
		`Profiling scanned ${formatBytes(session.budget.bytesSpent)} ` +
			`(~$${session.budget.costSpent.toFixed(2)})`,
	);
	return { profiles, joins };
}

async function usageStage(
	session: Session,
	tables: Awaited<ReturnType<typeof loadTables>>,
	options: CommonOptions,
) {
	return runUsage({
		client: session.client,
		dataset: session.dataset,
		location: session.client.location ?? 'US',
		tables,
		outDir: options.out,
		days: parseIntOption(options.usageDays ?? '30', 'usage-days') || 30,
		budget: session.budget,
		maxBytes: options.usageMaxBytes
			? parseBytes(options.usageMaxBytes)
			: usdToBytes(parseUsd(options.maxCost ?? '5')),
		// Commander maps --no-query-text to queryText: false.
		includeQueryText: (options as unknown as { queryText?: boolean }).queryText !== false,
	});
}

async function analyzeStage(
	options: CommonOptions,
	preloaded?: {
		tables: Awaited<ReturnType<typeof loadTables>>;
		profiles: Awaited<ReturnType<typeof loadProfiles>>;
		joins: Awaited<ReturnType<typeof loadJoins>>;
	},
) {
	const tables = preloaded?.tables ?? (await loadTables(options.out));
	if (tables.length === 0) {
		throw new Error(`No extracted tables in ${options.out}. Run "ak-audit extract" first.`);
	}
	const profiles = preloaded?.profiles ?? (await loadProfiles(options.out));
	const joins = preloaded?.joins ?? (await loadJoins(options.out));

	log.step('Analyzing');
	const dataset = `${tables[0]!.project}.${tables[0]!.dataset}`;
	const analysis = runAnalyze({ dataset, tables, profiles, joins });
	const usage = await loadUsage(options.out);
	await writeAnalysis(options.out, analysis, tables, profiles, usage);

	log.info(
		`${analysis.tables.length} tables, ${analysis.joins.length} relationships, ` +
			`${analysis.findings.length} findings`,
	);
	log.success(`Wrote ${join(options.out, 'catalog.md')} and per-table docs`);
	return analysis;
}

async function reportStage(options: CommonOptions) {
	const dirs = layout(options.out);
	log.step('Building report');
	const path = await buildReport(options.out);
	log.success(`Wrote ${path}`);
	return dirs;
}

program.parseAsync(process.argv).catch((error: unknown) => {
	log.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
