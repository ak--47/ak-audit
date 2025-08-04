#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { BigQuery } from '@google-cloud/bigquery';
import { promises as fs } from 'fs';
import generateHtmlReport from '../buildReport.js';
import path from 'path';
import https from 'https';
import { GoogleAuth } from 'google-auth-library';

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
    description: 'Comma-separated list of table names to audit (supports glob patterns)',
    coerce: (arg) => arg ? arg.split(',').map(t => t.trim()) : null
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
  .option('force-mode', {
    type: 'string',
    description: 'Force specific permission mode',
    choices: ['dataViewer', 'jobUser']
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

// Import the main audit logic from bigquery.js
const auditConfig = {
  projectId: argv.project,
  datasetId: argv.dataset,
  tableFilter: argv.filter,
  location: argv.location,
  sampleLimit: argv.samples,
  outputDir: argv.output,
  forceMode: argv.forceMode
};

console.log(`\n🔍 BigQuery Dataset Auditor\n`);
console.log(`Configuration:`);
console.log(`  Project ID: ${auditConfig.projectId}`);
console.log(`  Dataset ID: ${auditConfig.datasetId}`);
console.log(`  Table Filter: ${auditConfig.tableFilter ? auditConfig.tableFilter.join(', ') : 'All tables'}`);
console.log(`  Location: ${auditConfig.location}`);
console.log(`  Sample Limit: ${auditConfig.sampleLimit}`);
console.log(`  Output Directory: ${auditConfig.outputDir}`);
if (auditConfig.forceMode) {
  console.log(`  Force Mode: ${auditConfig.forceMode}`);
}
console.log('');

// Now import and run the audit logic
import('./audit-core.js').then(({ runAudit }) => {
  runAudit(auditConfig).catch(error => {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
  });
}).catch(error => {
  console.error('❌ Failed to load audit module:', error.message);
  process.exit(1);
});