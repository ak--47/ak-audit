#!/usr/bin/env node

import { BigQuery } from '@google-cloud/bigquery';
import { promises as fs } from 'fs';
import  generateHtmlReport from './buildReport.js';

import path from 'path';
let { NODE_ENV = 'production' } = process.env;



// --- Configuration ---
const config = {
	projectId: process.argv[2] || 'mixpanel-gtm-training',
	datasetId: process.argv[3] || 'warehouse_connectors',
	location: process.argv[4] || 'US',
	outputDir: process.argv[5] || './output',
	sampleLimit: parseInt(process.argv[6]) || 10 // New: Number of sample records to fetch per table
};


console.log(`Running BigQuery Audit with configuration:
  - Project ID: ${config.projectId}
  - Dataset ID: ${config.datasetId}
  - Location: ${config.location}
  - Output Directory: ${config.outputDir}
  - Sample Limit: ${config.sampleLimit}
\n\n`);	


const bigquery = new BigQuery({
	projectId: config.projectId,
	location: config.location,
});

// --- Colors for Terminal Output ---
const colors = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	magenta: '\x1b[35m',
	nc: '\x1b[0m'
};





// --- Utility Functions ---
const formatRegion = (location) => {
	const r = location.toLowerCase();
	if (r === 'us' || r === 'eu') {
		return `region-${r}`;
	}
	return r;
};

const jsonEscape = (str) => {
	if (typeof str !== 'string') return '';
	return str.replace(/\\/g, '\\\\').replace(/"/g, '\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
};

const csvEscape = (str) => {
	if (str === null || str === undefined) return '';
	const s = String(str);
	if (s.includes(',') || s.includes('\n') || s.includes('"')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
};

// --- Main Audit Logic ---
async function testBigQueryAuth() {
	console.log(`${colors.yellow}Testing BigQuery authentication and connectivity...${colors.nc}`);
	try {
		const datasets = await bigquery.getDatasets();
		console.log(`${colors.green}✓ BigQuery authentication successful.${colors.nc}\n`);
	} catch (error) {
		if (NODE_ENV === "dev") debugger;
		console.error(`${colors.red}Fatal Error: BigQuery authentication or connectivity failed. Please check your Google Cloud credentials and network access.${colors.nc}`);
		console.error(error.message);
		process.exit(1);
	}
}

async function runAudit() {
	await testBigQueryAuth();
	console.log(`${colors.cyan}=== BigQuery Dataset Audit Initializing ===${colors.nc}`);
	console.log('-------------------------------------------');
	console.log(`${colors.green}▸ Project:${colors.nc}          ${config.projectId}`);
	console.log(`${colors.green}▸ Dataset:${colors.nc}          ${config.datasetId}`);
	console.log(`${colors.green}▸ Region:${colors.nc}           ${config.location}`);
	console.log(`${colors.green}▸ Output Directory:${colors.nc} ${config.outputDir}`);
	console.log('-------------------------------------------\n');

	try {
		console.log(`${colors.yellow}Clearing previous output directory: ${config.outputDir}${colors.nc}`);
		await fs.rm(config.outputDir, { recursive: true, force: true });
		await fs.mkdir(path.join(config.outputDir, 'schemas'), { recursive: true });
		await fs.mkdir(path.join(config.outputDir, 'samples'), { recursive: true });
		await fs.mkdir(path.join(config.outputDir, 'reports'), { recursive: true });
		
		console.log(`${colors.green}✓ Output directory recreated successfully.${colors.nc}\n`);
	} catch (error) {
		console.error(`${colors.red}Fatal Error: Could not manage output directory. ${error.message}${colors.nc}`);
		process.exit(1);
	}

	const formattedRegion = formatRegion(config.location);
	const allTables = [];
	let auditSummary = {
		total_tables: 0,
		total_views: 0,
		failed_objects: 0,
		total_rows_accessible: 0
	};

	// CSV Headers
	const allTablesSummaryCsv = ['table_name', 'table_type', 'row_count', 'column_count', 'creation_time', 'has_permission_error', 'error_details'];
	const allSchemasCatalogCsv = ['table_name', 'column_name', 'data_type', 'is_nullable', 'is_partitioning_column', 'clustering_ordinal_position'];
	await fs.writeFile(path.join(config.outputDir, 'reports', 'all_tables_summary.csv'), allTablesSummaryCsv.join(',') + '\n');
	await fs.writeFile(path.join(config.outputDir, 'reports', 'all_schemas_catalog.csv'), allSchemasCatalogCsv.join(',') + '\n');

	try {
		console.log(`${colors.yellow}Fetching table list from INFORMATION_SCHEMA.TABLES...${colors.nc}`);
		const tablesQuery = `
            SELECT table_name, table_type, FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', creation_time, 'UTC') as creation_time, ddl
            FROM \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.TABLES\`
            WHERE table_schema = '${config.datasetId}'
            ORDER BY table_type, table_name`;

		const [tables] = await bigquery.query({ query: tablesQuery, location: config.location });

		console.log(`${colors.green}✓ Found ${tables.length} objects to audit.\n`);

		let currentObject = 0;
		for (const table of tables) {
			currentObject++;
			console.log(`${colors.magenta}Processing [${currentObject}/${tables.length}]: ${table.table_type} '${table.table_name}'${colors.nc}`);

			const tableData = {
				table_name: table.table_name,
				table_type: table.table_type,
				creation_time: table.creation_time,
				has_permission_error: false,
				error_details: []
			};

			// 1. Get Schema
			let column_count = 0;
			try {
				const schemaQuery = `
                    SELECT column_name, data_type, is_nullable, is_partitioning_column, clustering_ordinal_position
                    FROM \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.COLUMNS\`
                    WHERE table_name = '${table.table_name}' AND table_schema = '${config.datasetId}'
                    ORDER BY ordinal_position`;
				const [schema] = await bigquery.query({ query: schemaQuery, location: config.location });
				tableData.schema = schema;
				column_count = schema.length;

				const schemaCsvHeader = ['column_name', 'data_type', 'is_nullable', 'is_partitioning_column', 'clustering_ordinal_position'];
				const schemaCsvRowsForTable = schema.map(col => [
					csvEscape(col.column_name),
					csvEscape(col.data_type),
					csvEscape(col.is_nullable),
					csvEscape(col.is_partitioning_column),
					csvEscape(col.clustering_ordinal_position)
				].join(','));
				await fs.writeFile(path.join(config.outputDir, 'schemas', `${table.table_name}.csv`), schemaCsvHeader.join(',') + '\n' + schemaCsvRowsForTable.join('\n') + '\n');

				// Append to aggregated schema catalog
				const schemaCsvRowsForCatalog = schema.map(col => [
					csvEscape(table.table_name),
					csvEscape(col.column_name),
					csvEscape(col.data_type),
					csvEscape(col.is_nullable),
					csvEscape(col.is_partitioning_column),
					csvEscape(col.clustering_ordinal_position)
				].join(','));
				await fs.appendFile(path.join(config.outputDir, 'reports', 'all_schemas_catalog.csv'), schemaCsvRowsForCatalog.join('\n') + '\n');

			} catch (e) {
				tableData.has_permission_error = true;
				tableData.error_details.push('Schema');
				tableData.schema = [];
				tableData.schema_error = jsonEscape(e.message);
				console.log(`${colors.yellow}  └ ⚠ Schema access failed. ${e.message}${colors.nc}`);
			}

			// 2. Get Row Count
			let row_count = 0;
			try {
				const countQuery = `SELECT COUNT(*) as count FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\``;
				const [countResult] = await bigquery.query({ query: countQuery, location: config.location });
				row_count = countResult[0].count;
				tableData.row_count = row_count;
				auditSummary.total_rows_accessible += Number(row_count);
			} catch (e) {
				tableData.has_permission_error = true;
				tableData.error_details.push('Row Count');
				tableData.row_count = null;
				tableData.row_count_error = jsonEscape(e.message);
				console.log(`${colors.yellow}  └ ⚠ Row count failed. ${e.message}${colors.nc}`);
			}

			// 3. Get Sample Data
			try {
				const sampleQuery = `SELECT * FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\` LIMIT ${config.sampleLimit}`;
				const [sampleData] = await bigquery.query({ query: sampleQuery, location: config.location });
				await fs.writeFile(path.join(config.outputDir, 'samples', `${table.table_name}.json`), JSON.stringify(sampleData, null, 2));
			} catch (e) {
				tableData.has_permission_error = true;
				tableData.error_details.push('Sample Data');
				tableData.sample_data = [];
				tableData.sample_data_error = jsonEscape(e.message);
				console.log(`${colors.yellow}  └ ⚠ Sample data failed. ${e.message}${colors.nc}`);
			}

			// 4. Get View Definition
            if (table.table_type === 'VIEW') {
                tableData.view_definition = jsonEscape(table.ddl);
                auditSummary.total_views++;
            } else {
                auditSummary.total_tables++;
            }

            if (tableData.has_permission_error) {
                auditSummary.failed_objects++;
                console.log(`${colors.yellow}  └ ⚠ Audit for '${table.table_name}' complete (with errors).${colors.nc}`);
            } else {
                console.log(`${colors.green}  └ ✓ Audit for '${table.table_name}' complete.${colors.nc}`);
            }

            allTables.push(tableData);

            // Append to summary CSV
            const summaryRow = [
                csvEscape(tableData.table_name),
                csvEscape(tableData.table_type),
                row_count,
                column_count,
                csvEscape(tableData.creation_time),
                tableData.has_permission_error,
                csvEscape(tableData.error_details.join('; '))
            ].join(',');
            await fs.appendFile(path.join(config.outputDir, 'all_tables_summary.csv'), summaryRow + '\n');
            }

            

            
        // Finalize JSON
        const finalJson = {
            audit_metadata: {
                generated_at: new Date().toISOString(),
                project_id: config.projectId,
                dataset_id: config.datasetId,
                region: config.location
            },
            tables: allTables,
            summary: { ...auditSummary, total_objects: tables.length }
        };
        await fs.writeFile(path.join(config.outputDir, 'reports', 'dataset_audit.json'), JSON.stringify(finalJson, null, 2));

        // Finalize audit summary CSV
        const auditSummaryCsv = [
            'metric,value',
            `total_tables,${auditSummary.total_tables}`,
            `total_views,${auditSummary.total_views}`,
            `total_objects,${tables.length}`,
            `failed_objects,${auditSummary.failed_objects}`,
            `total_rows_accessible,${auditSummary.total_rows_accessible}`
        ].join('\n');
        await fs.writeFile(path.join(config.outputDir, 'reports', 'audit_summary.csv'), auditSummaryCsv + '\n');

        // Generate HTML Report
        console.log(`\n${colors.yellow}Generating Mixpanel-themed HTML report...${colors.nc}`);
        const htmlReport = generateHtmlReport(finalJson);
        await fs.writeFile(path.join(config.outputDir, 'reports', 'audit_report.html'), htmlReport);

        console.log(`\n${colors.green}✔ Audit complete!${colors.nc}`);
        console.log('==========================================');
        console.log(`All outputs are located in: ${colors.cyan}${config.outputDir}${colors.nc}`);
        console.log(`  - Interactive Report: ${colors.cyan}${path.join(config.outputDir, 'reports', 'audit_report.html')}${colors.nc}`);
		console.log(`  - Full JSON Output: ${colors.cyan}${path.join(config.outputDir, 'reports', 'dataset_audit.json')}${colors.nc}`);
		console.log(`  - Tables Summary:   ${colors.cyan}${path.join(config.outputDir, 'reports', 'all_tables_summary.csv')}${colors.nc}`);
		console.log(`  - Schema Catalog:   ${colors.cyan}${path.join(config.outputDir, 'reports', 'all_schemas_catalog.csv')}${colors.nc}`);
        console.log('==========================================');

	} catch (error) {
		console.error(`\n${colors.red}Fatal Error: Could not fetch table list. Check permissions or dataset existence.${colors.nc}`);
		console.error(error.message);
		process.exit(1);
	}
}



if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	runAudit();
}
