#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Colors for Terminal Output (matching bigquery.js) ---
const colors = {
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	magenta: "\x1b[35m",
	nc: "\x1b[0m"
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CLI Configuration ---
const argv = yargs(hideBin(process.argv))
  .scriptName('ak-audit')
  .usage('$0 [options]')
  .option('dwh', {
    alias: 'd',
    type: 'string',
    default: 'bigquery',
    description: 'Data warehouse type (currently only "bigquery" supported)',
    choices: ['bigquery']
  })
  .option('project', {
    alias: 'p',
    type: 'string',
    default: 'mixpanel-gtm-training',
    description: 'BigQuery project ID'
  })
  .option('dataset', {
    alias: 's',
    type: 'string',
    default: 'warehouse_connectors',
    description: 'Dataset ID to audit'
  })
  .option('location', {
    alias: 'l',
    type: 'string',
    default: 'US',
    description: 'BigQuery region/location'
  })
  .option('filter', {
    alias: 'f',
    type: 'string',
    description: 'Comma-separated list of table names to audit (supports glob patterns)'
  })
  .option('samples', {
    alias: 'n',
    type: 'number',
    default: 10,
    description: 'Number of sample rows per table'
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    default: './output',
    description: 'Output directory for audit results'
  })
  .option('credentials', {
    alias: 'c',
    type: 'string',
    description: 'Path to Google Cloud credentials JSON file'
  })
  .help('h')
  .alias('h', 'help')
  .example('$0 --project my-project --dataset my-dataset', 'Audit a specific project and dataset')
  .example('$0 --filter "users,events*" --samples 25', 'Audit only specific tables with more samples')
  .example('$0 --credentials ./service-account.json', 'Use specific credentials file')
  .version('1.0.0')
  .wrap(120)
  .argv;

// Set up Google Cloud credentials if provided
if (argv.credentials) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(argv.credentials);
}

console.log(`\n${colors.cyan}🔍 BigQuery Dataset Auditor${colors.nc}\n`);
console.log(`${colors.cyan}Configuration:${colors.nc}`);
console.log(`  Project ID: ${colors.green}${argv.project}${colors.nc}`);
console.log(`  Dataset ID: ${colors.green}${argv.dataset}${colors.nc}`);
console.log(`  Table Filter: ${colors.yellow}${argv.filter || 'All tables'}${colors.nc}`);
console.log(`  Location: ${colors.green}${argv.location}${colors.nc}`);
console.log(`  Sample Limit: ${colors.green}${argv.samples}${colors.nc}`);
console.log(`  Output Directory: ${colors.green}${argv.output}${colors.nc}`);
console.log('');

// Build arguments for bigquery.js in the correct positional order
const bigqueryArgs = [
  argv.project,           // PROJECT_ID (argv[2])
  argv.dataset,           // DATASET_ID (argv[3])
  argv.filter || '',      // TABLE_FILTER (argv[4])
  argv.location,          // LOCATION (argv[5])
  argv.samples.toString(), // SAMPLE_LIMIT (argv[6])
  argv.output             // OUTPUT_DIR (argv[7])
];

// Path to bigquery.js relative to this file
const bigqueryPath = path.resolve(__dirname, '..', 'bigquery.js');

// Spawn the bigquery.js process with positional arguments
const child = spawn('node', [bigqueryPath, ...bigqueryArgs], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error(`${colors.red}❌ Failed to start audit: ${error.message}${colors.nc}`);
  process.exit(1);
});