#!/usr/bin/env node

import { BigQuery } from "@google-cloud/bigquery";
import { promises as fs } from "fs";
// HTML report generation moved to rebuild.js step

import path from "path";
let { NODE_ENV = "production" } = process.env;

// --- Configuration ---
const config = {
	projectId: process.argv[2] || "mixpanel-gtm-training",
	datasetId: process.argv[3] || "warehouse_connectors",
	tableFilter: process.argv[4] ? process.argv[4].split(",").map(t => t.trim()) : null, // Comma-separated list of specific tables to audit (supports glob patterns)
	location: process.argv[5] || "US",
	sampleLimit: parseInt(process.argv[6]) || 10,
	outputDir: process.argv[7] || "./output"
};

console.log(`\n\nRunning BigQuery Data Extraction with configuration:\n
  - Project ID: ${config.projectId}
  - Dataset ID: ${config.datasetId}
  - Table Filter: ${config.tableFilter ? config.tableFilter.join(", ") : "All tables"}
  - Location: ${config.location}
  - Sample Limit: ${config.sampleLimit}
  - Output Directory: ${config.outputDir}
\n`);

const bigquery = new BigQuery({
	projectId: config.projectId,
	location: config.location
});

// Import required modules for REST API fallback
import https from "https";
import { GoogleAuth } from "google-auth-library";
const auth = new GoogleAuth({
	scopes: ["https://www.googleapis.com/auth/bigquery"]
});

// --- Colors for Terminal Output ---
const colors = {
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	magenta: "\x1b[35m",
	nc: "\x1b[0m"
};

// --- Utility Functions ---
const formatRegion = location => {
	const r = location.toLowerCase();
	if (r === "us" || r === "eu") {
		return `region-${r}`;
	}
	return r;
};

// Simple glob pattern matching function
const matchesGlob = (str, pattern) => {
	// Convert glob pattern to regex
	// * matches any characters, ? matches single character
	const regexPattern = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
		.replace(/\*/g, '.*') // Convert * to .*
		.replace(/\?/g, '.'); // Convert ? to .

	const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case insensitive
	return regex.test(str);
};

const jsonEscape = str => {
	if (typeof str !== "string") return "";
	return str.replace(/\\/g, "\\\\").replace(/"/g, '"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
};

// Parse view definitions to extract table dependencies
const parseViewDependencies = (ddl, datasetId) => {
	if (!ddl || typeof ddl !== "string") return [];

	const dependencies = new Set();

	// Common patterns for table references in BigQuery DDL
	const patterns = [
		// `dataset.table` or `project.dataset.table`
		/`[^`]*\.${datasetId}\.(\w+)`/gi,
		// dataset.table without backticks (less reliable but common)
		new RegExp(`\\b${datasetId}\\.(\\w+)\\b`, "gi"),
		// FROM or JOIN clauses with table names
		/FROM\s+`?[^`\s]*\.?${datasetId}\.(\w+)`?/gi,
		/JOIN\s+`?[^`\s]*\.?${datasetId}\.(\w+)`?/gi
	];

	patterns.forEach(pattern => {
		let match;
		while ((match = pattern.exec(ddl)) !== null) {
			if (match[1] && match[1] !== datasetId) {
				dependencies.add(match[1]);
			}
		}
	});

	return Array.from(dependencies);
};


const csvEscape = str => {
	if (str === null || str === undefined) return "";
	const s = String(str);
	if (s.includes(",") || s.includes("\n") || s.includes('"')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
};

// --- Main Data Extraction Logic ---
async function testBigQueryAuth() {
	console.log(`${colors.yellow}Testing BigQuery authentication and connectivity...${colors.nc}`);
	try {
		const datasets = await bigquery.getDatasets();
		console.log(`${colors.green}✓ BigQuery authentication successful.${colors.nc}`);

		// Test if we have query permissions (jobUser role)
		try {
			const testQuery = `SELECT 1 as test_col LIMIT 1`;
			await bigquery.query({
				query: testQuery,
				dryRun: true
			});
			console.log(`${colors.green}✓ Query permissions available (jobUser role detected).${colors.nc}\n`);
			return "dataViewer";
			// return "jobUser";
		} catch (queryError) {
			console.log(`${colors.yellow}⚠ Query permissions not available - will use REST API only (dataViewer mode).${colors.nc}\n`);
			return "dataViewer";
		}
	} catch (error) {
		if (NODE_ENV === "dev") debugger;
		console.error(
			`${colors.red}Fatal Error: BigQuery authentication or connectivity failed. Please check your Google Cloud credentials and network access.${colors.nc}`
		);
		console.error(error.message);
		console.error(`\n${colors.yellow}Try running this command to set up basic permissions:${colors.nc}`);
		console.error(`${colors.cyan}gcloud projects add-iam-policy-binding ${config.projectId} \\${colors.nc}`);
		console.error(`${colors.cyan}  --member='user:your_name@yourdomain.com' \\${colors.nc}`);
		console.error(`${colors.cyan}  --role='roles/bigquery.dataViewer'${colors.nc}`);
		console.error(`\n${colors.yellow}For full functionality, also add:${colors.nc}`);
		console.error(`${colors.cyan}gcloud projects add-iam-policy-binding ${config.projectId} \\${colors.nc}`);
		console.error(`${colors.cyan}  --member='user:your_name@yourdomain.com' \\${colors.nc}`);
		console.error(`${colors.cyan}  --role='roles/bigquery.jobUser'${colors.nc}`);
		process.exit(1);
	}
}

async function getSampleDataViaREST(projectId, datasetId, tableName, schema, maxResults = 10) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		return new Promise((resolve, reject) => {
			const path = `/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableName}/data?maxResults=${maxResults}`;
			const options = {
				hostname: 'www.googleapis.com',
				path: path,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken.token}`,
					'Content-Type': 'application/json'
				}
			};

			const req = https.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => data += chunk);
				res.on('end', () => {
					try {
						const result = JSON.parse(data);
						if (result.error) {
							reject(new Error(`REST API Error: ${result.error.message}`));
							return;
						}

						// Transform BigQuery REST API response to match our expected format
						const rows = (result.rows || []).map(row => {
							const rowObj = {};
							(row.f || []).forEach((field, index) => {
								if (schema && schema[index]) {
									rowObj[schema[index].column_name] = field.v;
								} else {
									rowObj[`column_${index}`] = field.v;
								}
							});
							return rowObj;
						});

						resolve(rows);
					} catch (parseError) {
						reject(new Error(`Failed to parse REST API response: ${parseError.message}`));
					}
				});
			});

			req.on('error', (error) => {
				reject(new Error(`REST API request failed: ${error.message}`));
			});

			req.end();
		});
	} catch (error) {
		throw new Error(`REST API authentication failed: ${error.message}`);
	}
}

async function getTablesViaREST(projectId, datasetId) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		return new Promise((resolve, reject) => {
			const path = `/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables?maxResults=1000`;
			const options = {
				hostname: 'www.googleapis.com',
				path: path,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken.token}`,
					'Content-Type': 'application/json'
				}
			};

			const req = https.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => data += chunk);
				res.on('end', () => {
					try {
						const result = JSON.parse(data);
						if (result.error) {
							reject(new Error(`REST API Error: ${result.error.message}`));
							return;
						}

						// Transform to match INFORMATION_SCHEMA.TABLES format
						const tables = (result.tables || []).map(table => {
							const tableRef = table.tableReference;
							return {
								table_name: tableRef.tableId,
								table_type: table.type === 'VIEW' ? 'VIEW' : 'TABLE',
								creation_time: table.creationTime ? new Date(parseInt(table.creationTime)).toISOString() : null
							};
						});

						resolve(tables);
					} catch (parseError) {
						reject(new Error(`Failed to parse REST API response: ${parseError.message}`));
					}
				});
			});

			req.on('error', (error) => {
				reject(new Error(`REST API request failed: ${error.message}`));
			});

			req.end();
		});
	} catch (error) {
		throw new Error(`REST API authentication failed: ${error.message}`);
	}
}

async function getTableMetadataViaREST(projectId, datasetId, tableName) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		return new Promise((resolve, reject) => {
			const path = `/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableName}`;
			const options = {
				hostname: 'www.googleapis.com',
				path: path,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken.token}`,
					'Content-Type': 'application/json'
				}
			};

			const req = https.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => data += chunk);
				res.on('end', () => {
					try {
						const result = JSON.parse(data);
						if (result.error) {
							reject(new Error(`REST API Error: ${result.error.message}`));
							return;
						}
						resolve(result);
					} catch (parseError) {
						reject(new Error(`Failed to parse REST API response: ${parseError.message}`));
					}
				});
			});

			req.on('error', (error) => {
				reject(new Error(`REST API request failed: ${error.message}`));
			});

			req.end();
		});
	} catch (error) {
		throw new Error(`REST API authentication failed: ${error.message}`);
	}
}

async function getTableSchemaViaREST(projectId, datasetId, tableName) {
	const metadata = await getTableMetadataViaREST(projectId, datasetId, tableName);
	return metadata.schema;
}

async function getSampleDataViaJobsAPI(projectId, datasetId, tableName, maxResults = 10) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		// Create a query job to sample data from the view
		const jobConfig = {
			configuration: {
				query: {
					query: `SELECT * FROM \`${projectId}.${datasetId}.${tableName}\` LIMIT ${maxResults}`,
					useLegacySql: false
				}
			}
		};

		// Submit the job
		const jobResponse = await new Promise((resolve, reject) => {
			const postData = JSON.stringify(jobConfig);
			const options = {
				hostname: 'www.googleapis.com',
				path: `/bigquery/v2/projects/${projectId}/jobs`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken.token}`,
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(postData)
				}
			};

			const req = https.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => data += chunk);
				res.on('end', () => {
					try {
						const result = JSON.parse(data);
						if (result.error) {
							reject(new Error(`Jobs API Error: ${result.error.message}`));
							return;
						}
						resolve(result);
					} catch (parseError) {
						reject(new Error(`Failed to parse Jobs API response: ${parseError.message}`));
					}
				});
			});

			req.on('error', (error) => {
				reject(new Error(`Jobs API request failed: ${error.message}`));
			});

			req.write(postData);
			req.end();
		});

		const jobId = jobResponse.jobReference.jobId;

		// Wait for job completion and get results
		let jobComplete = false;
		let attempts = 0;
		const maxAttempts = 30; // 30 seconds timeout

		while (!jobComplete && attempts < maxAttempts) {
			await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
			attempts++;

			const statusResponse = await new Promise((resolve, reject) => {
				const options = {
					hostname: 'www.googleapis.com',
					path: `/bigquery/v2/projects/${projectId}/jobs/${jobId}`,
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${accessToken.token}`,
						'Content-Type': 'application/json'
					}
				};

				const req = https.request(options, (res) => {
					let data = '';
					res.on('data', (chunk) => data += chunk);
					res.on('end', () => {
						try {
							const result = JSON.parse(data);
							if (result.error) {
								reject(new Error(`Jobs API Error: ${result.error.message}`));
								return;
							}
							resolve(result);
						} catch (parseError) {
							reject(new Error(`Failed to parse Jobs API response: ${parseError.message}`));
						}
					});
				});

				req.on('error', (error) => {
					reject(new Error(`Jobs API request failed: ${error.message}`));
				});

				req.end();
			});

			jobComplete = statusResponse.status && statusResponse.status.state === 'DONE';

			if (jobComplete) {
				if (statusResponse.status.errorResult) {
					throw new Error(`Query failed: ${statusResponse.status.errorResult.message}`);
				}

				// Get query results
				const resultsResponse = await new Promise((resolve, reject) => {
					const options = {
						hostname: 'www.googleapis.com',
						path: `/bigquery/v2/projects/${projectId}/queries/${jobId}?maxResults=${maxResults}`,
						method: 'GET',
						headers: {
							'Authorization': `Bearer ${accessToken.token}`,
							'Content-Type': 'application/json'
						}
					};

					const req = https.request(options, (res) => {
						let data = '';
						res.on('data', (chunk) => data += chunk);
						res.on('end', () => {
							try {
								const result = JSON.parse(data);
								if (result.error) {
									reject(new Error(`Jobs API Error: ${result.error.message}`));
									return;
								}
								resolve(result);
							} catch (parseError) {
								reject(new Error(`Failed to parse Jobs API response: ${parseError.message}`));
							}
						});
					});

					req.on('error', (error) => {
						reject(new Error(`Jobs API request failed: ${error.message}`));
					});

					req.end();
				});

				// Transform results to match our expected format
				const rows = (resultsResponse.rows || []).map(row => {
					const rowObj = {};
					(row.f || []).forEach((field, index) => {
						if (resultsResponse.schema && resultsResponse.schema.fields && resultsResponse.schema.fields[index]) {
							rowObj[resultsResponse.schema.fields[index].name] = field.v;
						} else {
							rowObj[`column_${index}`] = field.v;
						}
					});
					return rowObj;
				});

				return rows;
			}
		}

		if (!jobComplete) {
			throw new Error('Query job timed out');
		}

	} catch (error) {
		throw new Error(`Jobs API query failed: ${error.message}`);
	}
}

async function runDataExtraction() {
	const permissionMode = await testBigQueryAuth();
	console.log(`${colors.cyan}=== BigQuery Data Extraction Starting ===${colors.nc}`);
	console.log("-------------------------------------------");
	console.log(`${colors.green}▸ Project:${colors.nc}          ${config.projectId}`);
	console.log(`${colors.green}▸ Dataset:${colors.nc}          ${config.datasetId}`);
	console.log(`${colors.green}▸ Region:${colors.nc}           ${config.location}`);
	console.log(`${colors.green}▸ Table Filter:${colors.nc}    ${config.tableFilter ? config.tableFilter.join(", ") : "All tables"}`);
	console.log(`${colors.green}▸ Sample Limit:${colors.nc}     ${config.sampleLimit}`);
	console.log(`${colors.green}▸ Permission Mode:${colors.nc}  ${permissionMode === "jobUser" ? "JobUser (query access)" : "DataViewer (REST API only)"}`);
	console.log(`${colors.green}▸ Output Directory:${colors.nc} ${config.outputDir}`);
	console.log("-------------------------------------------\n");

	try {
		console.log(`${colors.yellow}Setting up output directory structure...${colors.nc}`);
		await fs.rm(config.outputDir, { recursive: true, force: true });
		await fs.mkdir(path.join(config.outputDir, "schemas"), { recursive: true });
		await fs.mkdir(path.join(config.outputDir, "samples"), { recursive: true });
		await fs.mkdir(path.join(config.outputDir, "reports"), { recursive: true });

		console.log(`${colors.green}✓ Output directories created:${colors.nc}`);
		console.log(`  - ${path.join(config.outputDir, "reports")} (aggregated reports)`);
		console.log(`  - ${path.join(config.outputDir, "schemas")} (individual table schemas)`);
		console.log(`  - ${path.join(config.outputDir, "samples")} (sample data files)\n`);
	} catch (error) {
		console.error(`${colors.red}Fatal Error: Could not manage output directory. ${error.message}${colors.nc}`);
		process.exit(1);
	}

	const formattedRegion = formatRegion(config.location);
	const allTables = [];
	let extractionSummary = {
		total_tables: 0,
		total_views: 0,
		failed_objects: 0,
		total_rows_accessible: 0
	};

	// CSV Headers
	const allTablesSummaryCsv = [
		"table_name",
		"table_type", 
		"row_count",
		"column_count",
		"size_mb",
		"num_partitions",
		"creation_time",
		"has_permission_error",
		"error_details"
	];

	console.log(`${colors.yellow}Discovering tables and views in dataset...${colors.nc}`);
	
	let tables;
	try {
		if (permissionMode === "jobUser") {
			// Use SQL query to get comprehensive metadata
			const tablesQuery = `
				SELECT 
					table_name,
					table_type,
					creation_time,
					-- row_count, 
					size_bytes,
					EXTRACT(DATE FROM TIMESTAMP_MILLIS(creation_time)) as creation_date
				FROM \`${config.projectId}.${config.datasetId}.INFORMATION_SCHEMA.TABLES\`
				ORDER BY table_name
			`;

			const [rows] = await bigquery.query({ query: tablesQuery });
			tables = rows.map(row => ({
				table_name: row.table_name,
				table_type: row.table_type,
				creation_time: row.creation_time ? row.creation_time.toISOString() : null,
				row_count: row.row_count ? parseInt(row.row_count) : null,
				size_bytes: row.size_bytes ? parseInt(row.size_bytes) : null
			}));
		} else {
			// Use REST API
			tables = await getTablesViaREST(config.projectId, config.datasetId);
		}

		// Apply table filtering if specified
		if (config.tableFilter && config.tableFilter.length > 0) {
			const originalCount = tables.length;
			tables = tables.filter(table => 
				config.tableFilter.some(filter => matchesGlob(table.table_name, filter))
			);
			console.log(`${colors.cyan}Filtered to ${tables.length} tables from ${originalCount} total (filter: ${config.tableFilter.join(", ")})${colors.nc}`);
		}

		console.log(`${colors.green}✓ Found ${tables.length} objects to extract: ${tables.filter(t => t.table_type === 'TABLE').length} tables, ${tables.filter(t => t.table_type === 'VIEW').length} views${colors.nc}\n`);

	} catch (error) {
		console.error(`${colors.red}Fatal Error: Could not fetch table list. Check permissions or dataset existence.${colors.nc}`);
		console.error(error.message);
		process.exit(1);
	}

	// Process each table/view
	let processedCount = 0;
	for (const tableInfo of tables) {
		const tableName = tableInfo.table_name;
		processedCount++;
		
		console.log(`${colors.cyan}[${processedCount}/${tables.length}] Processing: ${colors.nc}${tableName} (${tableInfo.table_type})`);

		const tableData = {
			table_name: tableName,
			table_type: tableInfo.table_type,
			creation_time: tableInfo.creation_time,
			has_permission_error: false,
			error_details: [],
			schema: [],
			row_count: tableInfo.row_count || 0,
			size_bytes: tableInfo.size_bytes || 0,
			sample_data: [],
			view_definition: null,
			partitioning_info: null,
			clustering_info: null
		};

		try {
			// Get schema information
			if (permissionMode === "jobUser") {
				// Get detailed schema with COLUMN_FIELD_PATHS for nested fields (includes all subfields)
				const formattedRegion = formatRegion(config.location);
				const schemaQuery = `
					SELECT 
						cfp.column_name,
						cfp.ordinal_position,
						cfp.field_path AS nested_field_path,
						cfp.data_type AS nested_type,
						COALESCE(c.is_nullable, 'YES') as is_nullable,
						COALESCE(c.is_partitioning_column, 'NO') as is_partitioning_column,
						c.clustering_ordinal_position
					FROM \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.COLUMN_FIELD_PATHS\` cfp
					LEFT JOIN \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.COLUMNS\` c
						ON cfp.table_catalog = c.table_catalog 
						AND cfp.table_schema = c.table_schema 
						AND cfp.table_name = c.table_name 
						AND cfp.column_name = c.column_name
					WHERE cfp.table_name = @tableName AND cfp.table_schema = @datasetId
					ORDER BY cfp.ordinal_position, cfp.field_path
				`;

				const [schemaRows] = await bigquery.query({
					query: schemaQuery,
					params: { 
						tableName: tableName,
						datasetId: config.datasetId
					}
				});

				tableData.schema = schemaRows.map(row => ({
					column_name: row.column_name,
					ordinal_position: row.ordinal_position,
					is_nullable: row.is_nullable,
					data_type: row.nested_type, // Use the specific data_type from COLUMN_FIELD_PATHS
					is_partitioning_column: row.is_partitioning_column === 'YES',
					clustering_ordinal_position: row.clustering_ordinal_position,
					nested_field_path: row.nested_field_path || row.column_name,
					nested_type: row.nested_type
				}));

			} else {
				// Use REST API to get schema - extract nested fields recursively
				const metadata = await getTableMetadataViaREST(config.projectId, config.datasetId, tableName);
				
				if (metadata.schema && metadata.schema.fields) {
					// Recursively flatten nested fields from REST API response
					const flattenFields = (fields, parentPath = '', ordinalStart = 1) => {
						const result = [];
						let ordinal = ordinalStart;
						
						for (const field of fields) {
							const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;
							
							// Add the field itself
							result.push({
								column_name: parentPath ? parentPath.split('.')[0] : field.name,
								ordinal_position: ordinal,
								is_nullable: field.mode !== 'REQUIRED' ? 'YES' : 'NO',
								data_type: field.type,
								is_partitioning_column: false,
								clustering_ordinal_position: null,
								nested_field_path: fieldPath,
								nested_type: field.type
							});
							
							// If this field has nested fields (STRUCT/RECORD), add them recursively
							if (field.fields && field.fields.length > 0) {
								const nestedFields = flattenFields(field.fields, fieldPath, ordinal);
								result.push(...nestedFields);
							}
							
							ordinal++;
						}
						
						return result;
					};
					
					tableData.schema = flattenFields(metadata.schema.fields);
				}

				// Get additional metadata
				if (metadata.numRows) {
					tableData.row_count = parseInt(metadata.numRows);
				}
				if (metadata.numBytes) {
					tableData.size_bytes = parseInt(metadata.numBytes);
				}
				if (metadata.timePartitioning) {
					tableData.partitioning_info = metadata.timePartitioning;
				}
				if (metadata.clustering) {
					tableData.clustering_info = metadata.clustering;
				}
			}

			// Get sample data
			if (config.sampleLimit > 0 && tableData.schema.length > 0) {
				try {
					if (permissionMode === "jobUser") {
						// Use SQL query for sampling
						const sampleQuery = `SELECT * FROM \`${config.projectId}.${config.datasetId}.${tableName}\` LIMIT ${config.sampleLimit}`;
						const [sampleRows] = await bigquery.query({ query: sampleQuery });
						tableData.sample_data = sampleRows.map(row => {
							// Convert BigQuery types to JSON-serializable format
							const cleanRow = {};
							Object.keys(row).forEach(key => {
								const value = row[key];
								if (value && typeof value === 'object' && value.constructor.name === 'BigQueryDate') {
									cleanRow[key] = value.value;
								} else if (value && typeof value === 'object' && value.constructor.name === 'BigQueryTimestamp') {
									cleanRow[key] = value.value;
								} else {
									cleanRow[key] = value;
								}
							});
							return cleanRow;
						});
					} else {
						// Use REST API for tables, Jobs API for views in dataViewer mode
						if (tableInfo.table_type === 'VIEW') {
							// For views in dataViewer mode, use Jobs API to execute SELECT query
							tableData.sample_data = await getSampleDataViaJobsAPI(config.projectId, config.datasetId, tableName, config.sampleLimit);
						} else {
							// For tables, use direct REST API
							tableData.sample_data = await getSampleDataViaREST(config.projectId, config.datasetId, tableName, tableData.schema, config.sampleLimit);
						}
					}
				} catch (sampleError) {
					console.log(`   ${colors.yellow}⚠ Could not get sample data: ${sampleError.message}${colors.nc}`);
					tableData.error_details.push(`Sample data error: ${sampleError.message}`);
				}
			}

			// Get view definition for views
			if (tableInfo.table_type === 'VIEW') {
				try {
					if (permissionMode === "jobUser") {
						const viewQuery = `
							SELECT view_definition 
							FROM \`${config.projectId}.${config.datasetId}.INFORMATION_SCHEMA.VIEWS\`
							WHERE table_name = @tableName
						`;
						const [viewRows] = await bigquery.query({
							query: viewQuery,
							params: { tableName: tableName }
						});
						if (viewRows.length > 0) {
							tableData.view_definition = viewRows[0].view_definition;
						}
					} else {
						const metadata = await getTableMetadataViaREST(config.projectId, config.datasetId, tableName);
						if (metadata.view && metadata.view.query) {
							tableData.view_definition = metadata.view.query;
						}
					}
				} catch (viewError) {
					console.log(`   ${colors.yellow}⚠ Could not get view definition: ${viewError.message}${colors.nc}`);
					tableData.error_details.push(`View definition error: ${viewError.message}`);
				}
			}

			// Update counters
			if (tableInfo.table_type === 'TABLE') {
				extractionSummary.total_tables++;
			} else {
				extractionSummary.total_views++;
			}
			extractionSummary.total_rows_accessible += tableData.row_count || 0;

			console.log(`   ${colors.green}✓ Schema: ${tableData.schema.length} fields, Samples: ${tableData.sample_data.length} rows${colors.nc}`);

		} catch (error) {
			tableData.has_permission_error = true;
			tableData.error_details.push(error.message);
			extractionSummary.failed_objects++;
			console.log(`   ${colors.red}✗ Error: ${error.message}${colors.nc}`);
		}

		// Write individual files
		await fs.writeFile(
			path.join(config.outputDir, "schemas", `${tableName}_schema.csv`),
			[
				"column_name,ordinal_position,is_nullable,data_type,is_partitioning_column,clustering_ordinal_position,nested_field_path,nested_type",
				...tableData.schema.map(col =>
					[col.column_name, col.ordinal_position, col.is_nullable, col.data_type, col.is_partitioning_column, col.clustering_ordinal_position, col.nested_field_path, col.nested_type].map(csvEscape).join(",")
				)
			].join("\n")
		);

		if (tableData.sample_data.length > 0) {
			await fs.writeFile(
				path.join(config.outputDir, "samples", `${tableName}_sample.json`),
				JSON.stringify(tableData.sample_data, null, 2)
			);
		}

		allTables.push(tableData);
	}

	// Build schema catalog CSV
	const schemaCatalogRows = ["table_name,column_name,ordinal_position,is_nullable,data_type,is_partitioning_column,clustering_ordinal_position,nested_field_path,nested_type"];
	allTables.forEach(table => {
		table.schema.forEach(col => {
			schemaCatalogRows.push(
				[table.table_name, col.column_name, col.ordinal_position, col.is_nullable, col.data_type, col.is_partitioning_column, col.clustering_ordinal_position, col.nested_field_path, col.nested_type].map(csvEscape).join(",")
			);
		});
	});

	// Write consolidated outputs
	await fs.writeFile(path.join(config.outputDir, "reports", "all_schemas_catalog.csv"), schemaCatalogRows.join("\n"));

	// Write summary CSV
	const summaryRows = [allTablesSummaryCsv.join(",")];
	allTables.forEach(table => {
		summaryRows.push([
			table.table_name,
			table.table_type,
			table.row_count || 0,
			table.schema.length,
			Math.round((table.size_bytes || 0) / 1024 / 1024 * 100) / 100, // MB
			0, // partitions - would need additional query
			table.creation_time || "",
			table.has_permission_error,
			table.error_details.join("; ")
		].map(csvEscape).join(","));
	});
	await fs.writeFile(path.join(config.outputDir, "reports", "all_tables_summary.csv"), summaryRows.join("\n"));

	// Create raw dataset JSON for audit.js processing
	const rawDataset = {
		extraction_metadata: {
			generated_at: new Date().toISOString(),
			project_id: config.projectId,
			dataset_id: config.datasetId,
			region: config.location,
			permission_mode: permissionMode,
			sample_limit: config.sampleLimit,
			table_filter: config.tableFilter
		},
		tables: allTables,
		summary: {
			...extractionSummary,
			total_objects: allTables.length
		}
	};

	// Write raw dataset for audit.js
	await fs.writeFile(path.join(config.outputDir, "reports", "dataset_raw.json"), JSON.stringify(rawDataset, null, 2));

	console.log(`\n${colors.green}✔ Data extraction complete!${colors.nc}`);
	console.log("==========================================");
	console.log(`${colors.green}▸ Extracted:${colors.nc}        ${allTables.length} objects (${extractionSummary.total_tables} tables, ${extractionSummary.total_views} views)`);
	console.log(`${colors.green}▸ Failed:${colors.nc}           ${extractionSummary.failed_objects} objects`);
	console.log(`${colors.green}▸ Total Rows:${colors.nc}       ${extractionSummary.total_rows_accessible.toLocaleString()}`);
	console.log("==========================================");
	console.log(`Raw dataset: ${colors.cyan}${path.join(config.outputDir, "reports", "dataset_raw.json")}${colors.nc}`);
	console.log(`\n${colors.yellow}Next steps:${colors.nc}`);
	console.log(`${colors.cyan}node audit.js${colors.nc} - Run analytics and scoring analysis`);
	console.log(`${colors.cyan}node rebuild.js${colors.nc} - Generate HTML report (after audit.js)`);
}

// Run extraction if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runDataExtraction().catch(console.error);
}

export { runDataExtraction };