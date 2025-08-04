#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

console.log(`\n🔍 BigQuery Dataset Auditor\n`);
console.log(`Configuration:`);
console.log(`  Project ID: ${argv.project}`);
console.log(`  Dataset ID: ${argv.dataset}`);
console.log(`  Table Filter: ${argv.filter || 'All tables'}`);
console.log(`  Location: ${argv.location}`);
console.log(`  Sample Limit: ${argv.samples}`);
console.log(`  Output Directory: ${argv.output}`);
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
  console.error('❌ Failed to start audit:', error.message);
  process.exit(1);
});