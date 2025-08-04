import { BigQuery } from "@google-cloud/bigquery";
import { promises as fs } from "fs";
import generateHtmlReport from "../buildReport.js";
import path from "path";
import https from "https";
import { GoogleAuth } from "google-auth-library";

let { NODE_ENV = "production" } = process.env;

const EXCLUDE_AS_JOIN_KEYS = [
	"event",
	"event_name",
	"event_id",
	"insert_id",
	"time",
	"timestamp",
	"created_at",
	"updated_at",
	"event_time",
	"_table_suffix",
	"_partitiontime",
	"_partitiondate",
	"distinct_id",
	"user_id",
	"email",
	"client_id",
	"visit_id",
	"session_id",
	"event_definition_id"
];

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

// Analytics compatibility analysis
function analyzeAnalyticsCompatibility(tables) {
	const insights = {
		mixpanel_ready: [],
		event_tables: [],
		user_tables: [],
		session_tables: [],
		behavioral_tables: [],
		commerce_tables: [],
		attribution_tables: [],
		cohort_tables: [],
		device_tables: []
	};

	tables.forEach(table => {
		const tableName = table.table_name.toLowerCase();
		const fieldNames = table.schema ? table.schema.map(field => field.column_name.toLowerCase()) : [];

		// Check for Mixpanel readiness based on required fields
		const hasEventId = fieldNames.includes('event_id') || fieldNames.includes('event') || fieldNames.includes('event_name');
		const hasUserId = fieldNames.includes('user_id') || fieldNames.includes('distinct_id') || fieldNames.includes('email');
		const hasTimestamp = fieldNames.some(field => field.includes('time') || field.includes('date'));

		if (hasEventId && hasUserId && hasTimestamp) {
			insights.mixpanel_ready.push(table.table_name);
		}

		// Categorize tables by analytics use case
		if (tableName.includes('event') || tableName.includes('track') || tableName.includes('log')) {
			insights.event_tables.push(table.table_name);
		}
		if (tableName.includes('user') || tableName.includes('profile') || tableName.includes('customer')) {
			insights.user_tables.push(table.table_name);
		}
		if (tableName.includes('session') || tableName.includes('visit')) {
			insights.session_tables.push(table.table_name);
		}
		if (tableName.includes('behavior') || tableName.includes('funnel') || tableName.includes('journey')) {
			insights.behavioral_tables.push(table.table_name);
		}
		if (tableName.includes('order') || tableName.includes('purchase') || tableName.includes('transaction') || tableName.includes('revenue')) {
			insights.commerce_tables.push(table.table_name);
		}
		if (tableName.includes('attribution') || tableName.includes('campaign') || tableName.includes('utm') || tableName.includes('source')) {
			insights.attribution_tables.push(table.table_name);
		}
		if (tableName.includes('cohort') || tableName.includes('retention')) {
			insights.cohort_tables.push(table.table_name);
		}
		if (tableName.includes('device') || tableName.includes('browser') || tableName.includes('platform')) {
			insights.device_tables.push(table.table_name);
		}
	});

	return insights;
}

// Data quality analysis
function analyzeDataQuality(tables) {
	const analysis = [];
	
	tables.forEach(table => {
		const quality = {
			table_name: table.table_name,
			row_count: table.row_count || 0,
			has_recent_data: false,
			has_permissions_error: table.has_permission_error || false,
			schema_complexity: table.schema ? table.schema.length : 0,
			has_partitioning: false,
			has_clustering: false,
			potential_pii_fields: [],
			timestamp_fields: [],
			null_percentage_estimate: 'Unknown'
		};

		if (table.schema) {
			// Check for partitioning and clustering
			quality.has_partitioning = table.schema.some(field => field.is_partitioning_column);
			quality.has_clustering = table.schema.some(field => field.clustering_ordinal_position);

			// Identify potential PII and timestamp fields
			table.schema.forEach(field => {
				const fieldName = field.column_name.toLowerCase();
				
				// PII detection
				if (fieldName.includes('email') || fieldName.includes('phone') || 
					fieldName.includes('address') || fieldName.includes('ssn') ||
					fieldName.includes('credit_card') || fieldName.includes('passport')) {
					quality.potential_pii_fields.push(field.column_name);
				}

				// Timestamp detection
				if (field.nested_type && (field.nested_type.includes('TIMESTAMP') || 
					field.nested_type.includes('DATETIME') || field.nested_type.includes('DATE'))) {
					quality.timestamp_fields.push(field.column_name);
				}
			});
		}

		// Check data freshness based on creation time or sample data
		if (table.creation_time) {
			const creationDate = new Date(table.creation_time);
			const daysSinceCreation = (new Date() - creationDate) / (1000 * 60 * 60 * 24);
			quality.has_recent_data = daysSinceCreation <= 30; // Recent if created in last 30 days
		}

		analysis.push(quality);
	});

	return analysis;
}

// Field pattern analysis
function analyzeFieldPatterns(tables) {
	const fieldCounts = new Map();
	const fieldTypes = new Map();
	
	tables.forEach(table => {
		if (table.schema) {
			table.schema.forEach(field => {
				const fieldName = field.column_name;
				fieldCounts.set(fieldName, (fieldCounts.get(fieldName) || 0) + 1);
				
				if (!fieldTypes.has(fieldName)) {
					fieldTypes.set(fieldName, new Set());
				}
				fieldTypes.get(fieldName).add(field.nested_type || 'UNKNOWN');
			});
		}
	});

	// Convert to sorted arrays for analysis
	const commonFields = Array.from(fieldCounts.entries())
		.filter(([field, count]) => count > 1)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20);

	const fieldTypeSummary = Array.from(fieldTypes.entries())
		.map(([field, types]) => ({
			field_name: field,
			table_count: fieldCounts.get(field),
			data_types: Array.from(types),
			is_potential_join_key: !EXCLUDE_AS_JOIN_KEYS.includes(field.toLowerCase()) && fieldCounts.get(field) > 1
		}))
		.filter(item => item.table_count > 1)
		.sort((a, b) => b.table_count - a.table_count);

	return {
		common_fields: commonFields,
		field_type_analysis: fieldTypeSummary
	};
}

// Generate lineage for visualization
function generateLineage(tables, fieldPatterns) {
	const nodes = tables.map(table => ({
		id: table.table_name,
		type: table.table_type,
		row_count: table.row_count || 0,
		schema_size: table.schema ? table.schema.length : 0
	}));

	const edges = [];
	const potentialJoinKeys = fieldPatterns.field_type_analysis
		.filter(field => field.is_potential_join_key)
		.map(field => field.field_name);

	// Create edges based on shared join keys
	for (let i = 0; i < tables.length; i++) {
		for (let j = i + 1; j < tables.length; j++) {
			const table1 = tables[i];
			const table2 = tables[j];
			
			if (!table1.schema || !table2.schema) continue;
			
			const fields1 = table1.schema.map(f => f.column_name);
			const fields2 = table2.schema.map(f => f.column_name);
			
			const sharedJoinKeys = fields1.filter(field => 
				fields2.includes(field) && potentialJoinKeys.includes(field)
			);
			
			if (sharedJoinKeys.length > 0) {
				edges.push({
					source: table1.table_name,
					target: table2.table_name,
					join_keys: sharedJoinKeys,
					strength: sharedJoinKeys.length
				});
			}
		}
	}

	return { nodes, edges };
}

// Test BigQuery permissions
async function testBigQueryPermissions(bigquery, config) {
	const { projectId, datasetId, location, forceMode } = config;

	// Force mode implementation
	if (forceMode) {
		if (forceMode === 'dataViewer' || forceMode === 'jobUser') {
			console.log(`🔒 Forcing ${forceMode} mode via command line parameter`);
			return forceMode;
		}
	}

	try {
		console.log(`${colors.cyan}🔍 Testing BigQuery permissions...${colors.nc}`);
		
		const dataset = bigquery.dataset(datasetId);
		const [exists] = await dataset.exists();
		
		if (!exists) {
			throw new Error(`Dataset ${projectId}.${datasetId} does not exist or you don't have access to it.`);
		}

		// Try to run a simple query to test jobUser permissions
		const testQuery = `
			SELECT table_name, table_type, creation_time
			FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\`
			LIMIT 1
		`;

		try {
			const [job] = await bigquery.createQueryJob({
				query: testQuery,
				location: location,
				dryRun: false
			});
			
			await job.getQueryResults();
			
			console.log(`${colors.green}✅ Full query permissions available (jobUser mode)${colors.nc}`);
			return 'jobUser';
			
		} catch (queryError) {
			console.log(`${colors.yellow}⚠️  Query permissions limited, falling back to REST API (dataViewer mode)${colors.nc}`);
			console.log(`   ${queryError.message}`);
			return 'dataViewer';
		}
		
	} catch (error) {
		console.error(`${colors.red}❌ BigQuery permission test failed:${colors.nc}`);
		console.error(`   ${error.message}`);
		
		console.log(`\n${colors.yellow}📝 Required permissions:${colors.nc}`);
		console.log(`   For dataViewer mode: gcloud projects add-iam-policy-binding ${projectId} --member="user:YOUR_EMAIL" --role="roles/bigquery.dataViewer"`);
		console.log(`   For jobUser mode: gcloud projects add-iam-policy-binding ${projectId} --member="user:YOUR_EMAIL" --role="roles/bigquery.jobUser"`);
		
		throw error;
	}
}

// Clear and create output directory
async function setupOutputDirectory(outputDir) {
	try {
		await fs.rm(outputDir, { recursive: true, force: true });
	} catch (err) {
		// Directory might not exist, that's fine
	}
	
	await fs.mkdir(outputDir, { recursive: true });
	await fs.mkdir(path.join(outputDir, 'schemas'), { recursive: true });
	await fs.mkdir(path.join(outputDir, 'samples'), { recursive: true });
	await fs.mkdir(path.join(outputDir, 'reports'), { recursive: true });
	
	console.log(`${colors.green}📁 Output directory prepared: ${outputDir}${colors.nc}`);
}

// Get table list from BigQuery
async function getTableList(bigquery, config, mode) {
	const { projectId, datasetId, location, tableFilter } = config;
	
	console.log(`${colors.cyan}📋 Getting table list...${colors.nc}`);
	
	if (mode === 'jobUser') {
		// Use query-based approach
		const query = `
			SELECT table_name, table_type, creation_time
			FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\`
			ORDER BY creation_time DESC
		`;
		
		const [job] = await bigquery.createQueryJob({
			query: query,
			location: location
		});
		
		const [rows] = await job.getQueryResults();
		return rows.map(row => ({
			table_name: row.table_name,
			table_type: row.table_type,
			creation_time: row.creation_time ? row.creation_time.value : null
		}));
		
	} else {
		// Use REST API approach for dataViewer mode
		const dataset = bigquery.dataset(datasetId);
		const [tables] = await dataset.getTables({ autoPaginate: true });
		
		return tables.map(table => ({
			table_name: table.id,
			table_type: table.metadata?.type || 'TABLE',
			creation_time: table.metadata?.creationTime ? new Date(parseInt(table.metadata.creationTime)).toISOString() : null
		}));
	}
}

// Process a single table
async function processTable(bigquery, config, tableInfo, mode, auth) {
	const { projectId, datasetId, location, sampleLimit } = config;
	const tableName = tableInfo.table_name;
	
	console.log(`${colors.cyan}  🔍 Processing ${tableName}...${colors.nc}`);
	
	const result = {
		table_name: tableName,
		table_type: tableInfo.table_type,
		creation_time: tableInfo.creation_time,
		has_permission_error: false,
		error_details: [],
		schema: [],
		row_count: 0,
		sample_data: [],
		view_definition: null
	};
	
	try {
		// Get schema
		if (mode === 'jobUser') {
			// Query-based schema retrieval
			const schemaQuery = `
				SELECT 
					column_name,
					field_path as nested_field_path,
					data_type as nested_type,
					is_nullable,
					is_partitioning_column,
					clustering_ordinal_position
				FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMN_FIELD_PATHS\`
				WHERE table_name = '${tableName}'
				ORDER BY ordinal_position, field_path
			`;
			
			try {
				const [job] = await bigquery.createQueryJob({
					query: schemaQuery,
					location: location
				});
				
				const [schemaRows] = await job.getQueryResults();
				result.schema = schemaRows.map(row => ({
					column_name: row.column_name,
					nested_field_path: row.nested_field_path,
					nested_type: row.nested_type,
					is_nullable: row.is_nullable,
					is_partitioning_column: row.is_partitioning_column || false,
					clustering_ordinal_position: row.clustering_ordinal_position,
					is_potential_join_key: false // Will be set later
				}));
			} catch (schemaError) {
				result.error_details.push(`Schema query failed: ${schemaError.message}`);
			}
			
		} else {
			// REST API schema retrieval
			try {
				const table = bigquery.dataset(datasetId).table(tableName);
				const [metadata] = await table.getMetadata();
				
				if (metadata.schema && metadata.schema.fields) {
					result.schema = flattenSchema(metadata.schema.fields).map(field => ({
						column_name: field.name,
						nested_field_path: field.path,
						nested_type: field.type,
						is_nullable: field.mode !== 'REQUIRED',
						is_partitioning_column: false,
						clustering_ordinal_position: null,
						is_potential_join_key: false
					}));
				}
			} catch (metadataError) {
				result.error_details.push(`Metadata retrieval failed: ${metadataError.message}`);
			}
		}
		
		// Get row count
		try {
			if (mode === 'jobUser') {
				const countQuery = `SELECT COUNT(*) as row_count FROM \`${projectId}.${datasetId}.${tableName}\``;
				const [job] = await bigquery.createQueryJob({
					query: countQuery,
					location: location
				});
				const [countRows] = await job.getQueryResults();
				result.row_count = parseInt(countRows[0].row_count);
			} else {
				// Use legacy tables metadata for row count
				const table = bigquery.dataset(datasetId).table(tableName);
				const [metadata] = await table.getMetadata();
				result.row_count = parseInt(metadata.numRows || 0);
			}
		} catch (countError) {
			result.error_details.push(`Row count failed: ${countError.message}`);
		}
		
		// Get sample data
		try {
			if (mode === 'jobUser') {
				const sampleQuery = `SELECT * FROM \`${projectId}.${datasetId}.${tableName}\` LIMIT ${sampleLimit}`;
				const [job] = await bigquery.createQueryJob({
					query: sampleQuery,
					location: location
				});
				const [sampleRows] = await job.getQueryResults();
				result.sample_data = sampleRows.map(row => row);
			} else {
				// REST API sample data retrieval
				result.sample_data = await getSampleDataViaRest(auth, projectId, datasetId, tableName, sampleLimit);
			}
		} catch (sampleError) {
			result.error_details.push(`Sample data failed: ${sampleError.message}`);
		}
		
		// Get view definition if it's a view
		if (tableInfo.table_type === 'VIEW') {
			try {
				const table = bigquery.dataset(datasetId).table(tableName);
				const [metadata] = await table.getMetadata();
				result.view_definition = metadata.view?.query || null;
			} catch (viewError) {
				result.error_details.push(`View definition failed: ${viewError.message}`);
			}
		}
		
	} catch (error) {
		result.has_permission_error = true;
		result.error_details.push(`General processing error: ${error.message}`);
		console.log(`${colors.yellow}    ⚠️  ${tableName}: ${error.message}${colors.nc}`);
	}
	
	return result;
}

// Flatten nested schema fields
function flattenSchema(fields, prefix = '') {
	const flattened = [];
	
	fields.forEach(field => {
		const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;
		
		flattened.push({
			name: field.name,
			path: fieldPath,
			type: field.type,
			mode: field.mode
		});
		
		if (field.fields) {
			flattened.push(...flattenSchema(field.fields, fieldPath));
		}
	});
	
	return flattened;
}

// Get sample data via REST API
async function getSampleDataViaRest(auth, projectId, datasetId, tableName, sampleLimit) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();
		
		const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableName}/data?maxResults=${sampleLimit}`;
		
		return new Promise((resolve, reject) => {
			const options = {
				headers: {
					'Authorization': `Bearer ${accessToken.token}`,
					'Content-Type': 'application/json'
				}
			};
			
			https.get(url, options, (res) => {
				let data = '';
				
				res.on('data', (chunk) => {
					data += chunk;
				});
				
				res.on('end', () => {
					try {
						const parsed = JSON.parse(data);
						if (parsed.rows) {
							const sampleData = parsed.rows.map(row => {
								const rowData = {};
								if (parsed.schema && parsed.schema.fields) {
									parsed.schema.fields.forEach((field, index) => {
										if (row.f && row.f[index]) {
											rowData[field.name] = row.f[index].v;
										}
									});
								}
								return rowData;
							});
							resolve(sampleData);
						} else {
							resolve([]);
						}
					} catch (parseError) {
						resolve([]);
					}
				});
			}).on('error', (error) => {
				resolve([]);
			});
		});
	} catch (error) {
		return [];
	}
}

// Mark join keys in schemas
function markJoinKeys(tables, fieldPatterns) {
	const joinKeyFields = new Set(
		fieldPatterns.field_type_analysis
			.filter(field => field.is_potential_join_key)
			.map(field => field.field_name)
	);
	
	tables.forEach(table => {
		if (table.schema) {
			table.schema.forEach(field => {
				field.is_potential_join_key = joinKeyFields.has(field.column_name);
			});
		}
	});
}

// Export individual files
async function exportIndividualFiles(tables, outputDir) {
	console.log(`${colors.cyan}📄 Exporting individual files...${colors.nc}`);
	
	for (const table of tables) {
		// Export schema
		if (table.schema && table.schema.length > 0) {
			const schemaCSV = [
				'column_name,nested_field_path,nested_type,is_nullable,is_partitioning_column,clustering_ordinal_position,is_potential_join_key',
				...table.schema.map(field => 
					`"${field.column_name}","${field.nested_field_path || field.column_name}","${field.nested_type}","${field.is_nullable}","${field.is_partitioning_column}","${field.clustering_ordinal_position || ''}","${field.is_potential_join_key}"`
				)
			].join('\n');
			
			await fs.writeFile(
				path.join(outputDir, 'schemas', `${table.table_name}.csv`),
				schemaCSV
			);
		}
		
		// Export sample data
		if (table.sample_data && table.sample_data.length > 0) {
			await fs.writeFile(
				path.join(outputDir, 'samples', `${table.table_name}.json`),
				JSON.stringify(table.sample_data, null, 2)
			);
		}
	}
}

// Export consolidated reports
async function exportConsolidatedReports(auditData, outputDir) {
	console.log(`${colors.cyan}📊 Generating consolidated reports...${colors.nc}`);
	
	const { tables, analytics, metadata } = auditData;
	
	// Main audit JSON
	await fs.writeFile(
		path.join(outputDir, 'reports', 'dataset_audit.json'),
		JSON.stringify(auditData, null, 2)
	);
	
	// All tables summary CSV
	const summaryCSV = [
		'table_name,table_type,creation_time,row_count,schema_fields,has_permission_error',
		...tables.map(table => 
			`"${table.table_name}","${table.table_type}","${table.creation_time || ''}","${table.row_count}","${table.schema ? table.schema.length : 0}","${table.has_permission_error}"`
		)
	].join('\n');
	
	await fs.writeFile(
		path.join(outputDir, 'reports', 'all_tables_summary.csv'),
		summaryCSV
	);
	
	// All schemas catalog CSV
	const allSchemas = [];
	tables.forEach(table => {
		if (table.schema) {
			table.schema.forEach(field => {
				allSchemas.push({
					table_name: table.table_name,
					table_type: table.table_type,
					...field
				});
			});
		}
	});
	
	const catalogCSV = [
		'table_name,table_type,column_name,nested_field_path,nested_type,is_nullable,is_partitioning_column,clustering_ordinal_position,is_potential_join_key',
		...allSchemas.map(field => 
			`"${field.table_name}","${field.table_type}","${field.column_name}","${field.nested_field_path || field.column_name}","${field.nested_type}","${field.is_nullable}","${field.is_partitioning_column}","${field.clustering_ordinal_position || ''}","${field.is_potential_join_key}"`
		)
	].join('\n');
	
	await fs.writeFile(
		path.join(outputDir, 'reports', 'all_schemas_catalog.csv'),
		catalogCSV
	);
	
	// Audit summary CSV
	const summary = {
		project_id: metadata.projectId,
		dataset_id: metadata.datasetId,
		location: metadata.location,
		audit_timestamp: metadata.auditTimestamp,
		mode: metadata.mode,
		total_tables: tables.length,
		total_views: tables.filter(t => t.table_type === 'VIEW').length,
		total_rows: tables.reduce((sum, t) => sum + (t.row_count || 0), 0),
		tables_with_errors: tables.filter(t => t.has_permission_error).length,
		mixpanel_ready_tables: analytics.mixpanel_ready?.length || 0,
		common_join_keys: analytics.field_patterns.field_type_analysis?.filter(f => f.is_potential_join_key).length || 0
	};
	
	const summaryLines = [
		'metric,value',
		...Object.entries(summary).map(([key, value]) => `"${key}","${value}"`)
	].join('\n');
	
	await fs.writeFile(
		path.join(outputDir, 'reports', 'audit_summary.csv'),
		summaryLines
	);
	
	// HTML Report
	const htmlReport = generateHtmlReport(auditData);
	await fs.writeFile(
		path.join(outputDir, 'reports', 'audit_report.html'),
		htmlReport
	);
}

// Main audit function
export async function runAudit(config) {
	const startTime = Date.now();
	
	try {
		// Initialize BigQuery client
		const bigquery = new BigQuery({
			projectId: config.projectId,
			location: config.location
		});
		
		// Initialize auth for REST API fallback
		const auth = new GoogleAuth({
			scopes: ["https://www.googleapis.com/auth/bigquery"]
		});
		
		// Test permissions and determine mode
		const mode = await testBigQueryPermissions(bigquery, config);
		
		// Setup output directory
		await setupOutputDirectory(config.outputDir);
		
		// Get table list
		let allTables = await getTableList(bigquery, config, mode);
		
		// Apply table filter if specified
		if (config.tableFilter) {
			const originalCount = allTables.length;
			allTables = allTables.filter(table => 
				config.tableFilter.some(pattern => matchesGlob(table.table_name, pattern))
			);
			console.log(`${colors.yellow}🔍 Filtered ${originalCount} tables to ${allTables.length} based on filter criteria${colors.nc}`);
		}
		
		console.log(`${colors.green}📋 Found ${allTables.length} tables to audit${colors.nc}`);
		
		// Process all tables
		const tables = [];
		for (const tableInfo of allTables) {
			const result = await processTable(bigquery, config, tableInfo, mode, auth);
			tables.push(result);
		}
		
		// Analyze patterns and compatibility
		console.log(`${colors.cyan}🔍 Analyzing field patterns and join keys...${colors.nc}`);
		const fieldPatterns = analyzeFieldPatterns(tables);
		
		// Mark join keys in schemas
		markJoinKeys(tables, fieldPatterns);
		
		// Generate analytics
		console.log(`${colors.cyan}📊 Generating analytics insights...${colors.nc}`);
		const analytics = {
			mixpanel_ready: analyzeAnalyticsCompatibility(tables).mixpanel_ready,
			event_tables: analyzeAnalyticsCompatibility(tables).event_tables,
			user_tables: analyzeAnalyticsCompatibility(tables).user_tables,
			data_quality: analyzeDataQuality(tables),
			field_patterns: fieldPatterns
		};
		
		// Generate lineage
		const lineage = generateLineage(tables, fieldPatterns);
		
		// Prepare final audit data
		const auditData = {
			metadata: {
				projectId: config.projectId,
				datasetId: config.datasetId,
				location: config.location,
				auditTimestamp: new Date().toISOString(),
				mode: mode,
				tableFilter: config.tableFilter,
				sampleLimit: config.sampleLimit,
				executionTimeMs: Date.now() - startTime
			},
			tables,
			analytics,
			lineage
		};
		
		// Export all files
		await exportIndividualFiles(tables, config.outputDir);
		await exportConsolidatedReports(auditData, config.outputDir);
		
		const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
		console.log(`\n${colors.green}✅ Audit completed successfully in ${executionTime}s${colors.nc}`);
		console.log(`${colors.cyan}📁 Results saved to: ${config.outputDir}${colors.nc}`);
		console.log(`${colors.cyan}🌐 View HTML report: ${path.join(config.outputDir, 'reports', 'audit_report.html')}${colors.nc}`);
		
	} catch (error) {
		console.error(`\n${colors.red}❌ Audit failed: ${error.message}${colors.nc}`);
		if (error.stack && NODE_ENV === 'development') {
			console.error(error.stack);
		}
		throw error;
	}
}