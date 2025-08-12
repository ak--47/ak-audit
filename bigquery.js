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

// Helper function to recursively unwrap BigQuery REST API field values
function unwrapBigQueryValue(value) {
	if (value === null || value === undefined) {
		return null;
	}

	// Handle arrays (REPEATED fields)
	if (Array.isArray(value)) {
		return value.map(item => {
			if (item && typeof item === 'object' && 'v' in item) {
				return unwrapBigQueryValue(item.v);
			}
			return unwrapBigQueryValue(item);
		});
	}

	// Handle objects that might be wrapped values
	if (typeof value === 'object' && value !== null) {
		// If it has a 'v' property, unwrap it
		if ('v' in value) {
			return unwrapBigQueryValue(value.v);
		}

		// Handle STRUCT fields (objects with 'f' property containing field array)
		if ('f' in value && Array.isArray(value.f)) {
			const struct = {};
			// This would need schema information to properly name fields
			// For now, just unwrap the values
			value.f.forEach((field, index) => {
				struct[`field_${index}`] = unwrapBigQueryValue(field);
			});
			return struct;
		}

		// Regular object - recursively unwrap all properties
		const unwrapped = {};
		for (const [key, val] of Object.entries(value)) {
			unwrapped[key] = unwrapBigQueryValue(val);
		}
		return unwrapped;
	}

	// Handle potential JSON strings for better display in sample data
	if (typeof value === 'string' && value.length > 0) {
		const trimmed = value.trim();
		// Check if string looks like JSON (starts with { or [)
		if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
		    (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
			try {
				// Try to parse as JSON
				const parsed = JSON.parse(trimmed);
				return parsed; // Return parsed object/array for better display
			} catch (e) {
				// If parsing fails, fall back to original string
				return value;
			}
		}
	}

	// Primitive values - return as is
	return value;
}

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
		console.log(`${colors.green}✓ BigQuery authentication successful (dataViewer mode).${colors.nc}\n`);
		return "dataViewer";
	} catch (error) {
		if (NODE_ENV === "dev") debugger;
		console.error(
			`${colors.red}Fatal Error: BigQuery authentication or connectivity failed. Please check your Google Cloud credentials and network access.${colors.nc}`
		);
		console.error(error.message);
		console.error(`\n${colors.yellow}Required permissions:${colors.nc}`);
		console.error(`${colors.cyan}gcloud projects add-iam-policy-binding ${config.projectId} \\${colors.nc}`);
		console.error(`${colors.cyan}  --member='user:your_name@yourdomain.com' \\${colors.nc}`);
		console.error(`${colors.cyan}  --role='roles/bigquery.dataViewer'${colors.nc}`);
		process.exit(1);
	}
}

async function getSampleDataViaREST(projectId, datasetId, tableName, schema, maxResults = 10) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableName}/data?maxResults=${maxResults}`;

		return new Promise((resolve, reject) => {
			const options = {
				headers: {
					Authorization: `Bearer ${accessToken.token}`,
					"Content-Type": "application/json"
				},
				timeout: 30000 // 30 second timeout
			};

			const req = https.get(url, options, res => {
				let data = "";
				res.on("data", chunk => (data += chunk));
				res.on("end", () => {
					// Check for HTTP error status codes
					if (res.statusCode < 200 || res.statusCode >= 300) {
						try {
							const errorResponse = JSON.parse(data);
							reject(new Error(`HTTP ${res.statusCode}: ${errorResponse.error ? errorResponse.error.message : res.statusMessage}`));
						} catch {
							reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
						}
						return;
					}

					try {
						const response = JSON.parse(data);
						if (response.error) {
							reject(new Error(`BigQuery API Error: ${response.error.message}`));
							return;
						}

						if (response.rows && response.rows.length > 0) {
							// Convert BigQuery REST API format to standard row format
							// Use the schema passed as parameter since the data API doesn't include schema
							const rows = response.rows.map(row => {
								const obj = {};
								if (row.f && Array.isArray(row.f)) {
									row.f.forEach((field, index) => {
										if (schema && schema[index]) {
											const fieldName = schema[index].column_name || schema[index].name;

											// Handle null/undefined values
											if (field.v === null || field.v === undefined) {
												obj[fieldName] = null;
											} else {
												// Properly unwrap nested/repeated field values
												obj[fieldName] = unwrapBigQueryValue(field.v);
											}
										}
									});
								}
								return obj;
							});
							resolve(rows);
						} else {
							resolve([]);
						}
					} catch (parseError) {
						reject(new Error(`Failed to parse REST API response: ${parseError.message}`));
					}
				});
			});

			req.on("error", error => {
				reject(new Error(`REST API request failed: ${error.message}`));
			});

			req.on("timeout", () => {
				req.destroy();
				reject(new Error("REST API request timed out after 30 seconds"));
			});

			req.setTimeout(30000);
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


async function runDataExtraction() {
	const permissionMode = await testBigQueryAuth();
	console.log(`${colors.cyan}=== BigQuery Data Extraction Starting ===${colors.nc}`);
	console.log("-------------------------------------------");
	console.log(`${colors.green}▸ Project:${colors.nc}          ${config.projectId}`);
	console.log(`${colors.green}▸ Dataset:${colors.nc}          ${config.datasetId}`);
	console.log(`${colors.green}▸ Region:${colors.nc}           ${config.location}`);
	console.log(`${colors.green}▸ Table Filter:${colors.nc}    ${config.tableFilter ? config.tableFilter.join(", ") : "All tables"}`);
	console.log(`${colors.green}▸ Sample Limit:${colors.nc}     ${config.sampleLimit}`);
	console.log(`${colors.green}▸ Permission Mode:${colors.nc}  DataViewer (REST API only)`);
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
		// Use REST API (dataViewer mode)
		tables = await getTablesViaREST(config.projectId, config.datasetId);

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
			// Get schema information via REST API
			const metadata = await getTableMetadataViaREST(config.projectId, config.datasetId, tableName);
			
			if (metadata.schema && metadata.schema.fields) {
				// Recursively flatten nested fields from REST API response
				const schema = [];
				
				function processFields(fields, parentPath = "") {
					fields.forEach(field => {
						const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;
						schema.push({
							column_name: field.name,
							ordinal_position: schema.length + 1,
							is_nullable: field.mode === "NULLABLE" ? "YES" : "NO",
							data_type: field.type,
							is_partitioning_column: false,
							clustering_ordinal_position: null,
							nested_field_path: fieldPath,
							nested_type: field.type
						});

						// Handle nested fields recursively
						if (field.fields) {
							processFields(field.fields, fieldPath);
						}
					});
				}

				processFields(metadata.schema.fields);
				tableData.schema = schema;
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

			// Get sample data via REST API (works for tables) or query (for views/materialized views)
			if (config.sampleLimit > 0 && tableData.schema.length > 0) {
				try {
					if (tableInfo.table_type === 'VIEW') {
						// For views, try using a simple SELECT query instead of the table data endpoint
						console.log(`   ${colors.cyan}→ Attempting view query for sample data...${colors.nc}`);
						try {
							const query = `SELECT * FROM \`${config.projectId}.${config.datasetId}.${tableName}\` LIMIT ${config.sampleLimit}`;
							const [queryResults] = await bigquery.query({ 
								query: query, 
								location: config.location,
								dryRun: false,
								maximumBytesBilled: 1000000 // 1MB limit for safety
							});
							tableData.sample_data = queryResults;
							console.log(`   ${colors.green}✓ Sample data from view query: ${tableData.sample_data.length} rows${colors.nc}`);
						} catch (queryError) {
							console.log(`   ${colors.yellow}⚠ View query failed: ${queryError.message}${colors.nc}`);
							tableData.error_details.push(`View query failed: ${queryError.message}`);
							tableData.sample_data = [];
						}
					} else {
						// For tables, use the REST API table data endpoint
						try {
							tableData.sample_data = await getSampleDataViaREST(config.projectId, config.datasetId, tableName, tableData.schema, config.sampleLimit);
							console.log(`   ${colors.green}✓ Sample data: ${tableData.sample_data.length} rows${colors.nc}`);
						} catch (restError) {
							// If REST API fails with materialized view error, fallback to query approach
							if (restError.message.includes('Cannot list a table of type MATERIALIZED_VIEW')) {
								console.log(`   ${colors.cyan}→ Detected materialized view, using query approach...${colors.nc}`);
								try {
									const query = `SELECT * FROM \`${config.projectId}.${config.datasetId}.${tableName}\` LIMIT ${config.sampleLimit}`;
									const [queryResults] = await bigquery.query({ 
										query: query, 
										location: config.location,
										dryRun: false,
										maximumBytesBilled: 50000000 // 50MB limit for materialized views
									});
									tableData.sample_data = queryResults;
									console.log(`   ${colors.green}✓ Sample data from materialized view query: ${tableData.sample_data.length} rows${colors.nc}`);
								} catch (queryError) {
									console.log(`   ${colors.yellow}⚠ Materialized view query failed: ${queryError.message}${colors.nc}`);
									tableData.error_details.push(`Materialized view query failed: ${queryError.message}`);
									tableData.sample_data = [];
								}
							} else {
								throw restError; // Re-throw other REST API errors
							}
						}
					}
				} catch (sampleError) {
					console.log(`   ${colors.yellow}⚠ Could not get sample data: ${sampleError.message}${colors.nc}`);
					tableData.error_details.push(`Sample data error: ${sampleError.message}`);
				}
			}

			// Get view definition for views via REST API
			if (tableInfo.table_type === 'VIEW') {
				try {
					if (metadata.view && metadata.view.query) {
						tableData.view_definition = metadata.view.query;
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