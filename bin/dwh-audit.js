#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
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

// --- Input Validation Functions ---
async function validateCredentials(credentialsPath) {
	try {
		const resolvedPath = path.resolve(credentialsPath);
		const stats = await fs.stat(resolvedPath);
		
		if (!stats.isFile()) {
			throw new Error('Credentials path exists but is not a file');
		}
		
		// Try to parse as JSON to validate structure
		const content = await fs.readFile(resolvedPath, 'utf8');
		const parsed = JSON.parse(content);
		
		// Basic validation for Google Cloud service account key
		if (!parsed.type || !parsed.project_id || !parsed.client_email) {
			throw new Error('Credentials file does not appear to be a valid Google Cloud service account key');
		}
		
		return resolvedPath;
	} catch (error) {
		throw new Error(`Invalid credentials file: ${error.message}`);
	}
}

function validateProjectId(projectId) {
	if (!projectId || typeof projectId !== 'string') {
		throw new Error('Project ID is required');
	}
	
	// Google Cloud project ID rules
	const projectIdPattern = /^[a-z][a-z0-9\-]*[a-z0-9]$/;
	if (!projectIdPattern.test(projectId) || projectId.length > 30) {
		throw new Error('Project ID must start with lowercase letter, contain only lowercase letters, numbers, and hyphens, and be 30 chars or less');
	}
	
	return projectId;
}

function validateDatasetId(datasetId) {
	if (!datasetId || typeof datasetId !== 'string') {
		throw new Error('Dataset ID is required');
	}
	
	// BigQuery dataset ID rules
	const datasetIdPattern = /^[a-zA-Z0-9_]+$/;
	if (!datasetIdPattern.test(datasetId) || datasetId.length > 1024) {
		throw new Error('Dataset ID must contain only letters, numbers, and underscores, and be 1024 chars or less');
	}
	
	return datasetId;
}

function validateSamples(samples) {
	if (typeof samples !== 'number' || samples < 0 || samples > 10000) {
		throw new Error('Sample limit must be a number between 0 and 10000');
	}
	
	return samples;
}

function validateLocation(location) {
	const validLocations = [
		'US', 'EU', 'us-central1', 'us-east1', 'us-east4', 'us-west1', 'us-west2', 'us-west3', 'us-west4',
		'europe-north1', 'europe-west1', 'europe-west2', 'europe-west3', 'europe-west4', 'europe-west6',
		'asia-east1', 'asia-east2', 'asia-northeast1', 'asia-northeast2', 'asia-northeast3',
		'asia-south1', 'asia-southeast1', 'asia-southeast2', 'australia-southeast1'
	];
	
	if (!validLocations.includes(location)) {
		console.warn(`${colors.yellow}⚠️  Warning: '${location}' may not be a valid BigQuery location. Valid locations include: US, EU, or specific regions like us-central1, europe-west1, etc.${colors.nc}`);
	}
	
	return location;
}

// --- CLI Configuration ---
const argv = yargs(hideBin(process.argv))
  .scriptName('dwh-audit')
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
    description: 'BigQuery project ID (required)',
    demandOption: true
  })
  .option('dataset', {
    alias: 's',
    type: 'string', 
    description: 'Dataset ID to audit (required)',
    demandOption: true
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
  .example('$0 --project my-project --dataset my-dataset', 'Basic audit of a dataset')
  .example('$0 --project my-project --dataset my-dataset --filter "users,events*" --samples 25', 'Audit specific tables with more samples')
  .example('$0 --project my-project --dataset my-dataset --credentials ./service-account.json', 'Use specific credentials file')
  .version('1.0.0')
  .wrap(120)
  .argv;

// --- Validation and Setup ---
async function main() {
  try {
    // Validate inputs
    const validatedProject = validateProjectId(argv.project);
    const validatedDataset = validateDatasetId(argv.dataset);
    const validatedSamples = validateSamples(argv.samples);
    const validatedLocation = validateLocation(argv.location);
    
    // Set up Google Cloud credentials if provided
    if (argv.credentials) {
      const validatedCredentials = await validateCredentials(argv.credentials);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = validatedCredentials;
      console.log(`${colors.green}✓ Using credentials file: ${validatedCredentials}${colors.nc}`);
    } else {
      console.log(`${colors.yellow}ℹ️  Using default Google Cloud authentication (gcloud auth application-default login)${colors.nc}`);
    }
    
    // Validate output directory parent exists
    const outputParent = path.dirname(path.resolve(argv.output));
    try {
      await fs.access(outputParent);
    } catch (error) {
      throw new Error(`Output directory parent '${outputParent}' does not exist or is not accessible`);
    }

    console.log(`\n${colors.cyan}🔍 BigQuery Dataset Auditor${colors.nc}\n`);
    console.log(`${colors.cyan}Configuration:${colors.nc}`);
    console.log(`  Project ID: ${colors.green}${validatedProject}${colors.nc}`);
    console.log(`  Dataset ID: ${colors.green}${validatedDataset}${colors.nc}`);
    console.log(`  Table Filter: ${colors.yellow}${argv.filter || 'All tables'}${colors.nc}`);
    console.log(`  Location: ${colors.green}${validatedLocation}${colors.nc}`);
    console.log(`  Sample Limit: ${colors.green}${validatedSamples}${colors.nc}`);
    console.log(`  Output Directory: ${colors.green}${argv.output}${colors.nc}`);
    console.log('');

    return {
      project: validatedProject,
      dataset: validatedDataset,
      location: validatedLocation,
      samples: validatedSamples
    };
  } catch (error) {
    console.error(`${colors.red}❌ Validation Error: ${error.message}${colors.nc}\n`);
    
    // Provide helpful suggestions based on error type
    if (error.message.includes('Project ID')) {
      console.error(`${colors.yellow}💡 Tip: Project IDs should look like 'my-project-123' or 'analytics-prod'${colors.nc}`);
      console.error(`${colors.yellow}   You can find your project ID in the Google Cloud Console.${colors.nc}`);
    } else if (error.message.includes('Dataset ID')) {
      console.error(`${colors.yellow}💡 Tip: Dataset IDs should look like 'my_dataset' or 'warehouse_prod'${colors.nc}`);
      console.error(`${colors.yellow}   You can list datasets with: bq ls --datasets ${argv.project}${colors.nc}`);
    } else if (error.message.includes('credentials')) {
      console.error(`${colors.yellow}💡 Tip: Generate a service account key from Google Cloud Console > IAM & Admin > Service Accounts${colors.nc}`);
      console.error(`${colors.yellow}   Or use: gcloud auth application-default login${colors.nc}`);
    }
    
    process.exit(1);
  }
}

main().then(async (validated) => {
  // Build arguments for bigquery.js in the correct positional order
  const bigqueryArgs = [
    validated.project,                 // PROJECT_ID (argv[2])
    validated.dataset,                 // DATASET_ID (argv[3])
    argv.filter || '',                 // TABLE_FILTER (argv[4])
    validated.location,                // LOCATION (argv[5])
    validated.samples.toString(),      // SAMPLE_LIMIT (argv[6])
    argv.output                        // OUTPUT_DIR (argv[7])
  ];

  // Path to bigquery.js relative to this file
  const bigqueryPath = path.resolve(__dirname, '..', 'bigquery.js');

  // Check if bigquery.js exists
  try {
    await fs.access(bigqueryPath);
  } catch (error) {
    console.error(`${colors.red}❌ Internal Error: Could not find audit engine at ${bigqueryPath}${colors.nc}`);
    console.error(`${colors.yellow}💡 This may indicate a corrupted installation. Try reinstalling dwh-audit.${colors.nc}`);
    process.exit(1);
  }

  // Spawn the bigquery.js process with positional arguments
  const child = spawn('node', [bigqueryPath, ...bigqueryArgs], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log(`\n${colors.green}✨ Audit completed successfully!${colors.nc}`);
      console.log(`${colors.cyan}📁 Find your reports in: ${argv.output}/reports/${colors.nc}`);
    }
    process.exit(code || 0);
  });

  child.on('error', (error) => {
    console.error(`${colors.red}❌ Failed to start audit: ${error.message}${colors.nc}`);
    
    if (error.code === 'ENOENT') {
      console.error(`${colors.yellow}💡 Node.js may not be in your PATH, or the audit engine is missing${colors.nc}`);
    }
    
    process.exit(1);
  });

}).catch((error) => {
  console.error(`${colors.red}❌ Startup Error: ${error.message}${colors.nc}`);
  process.exit(1);
});