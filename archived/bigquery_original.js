#!/usr/bin/env node

import { BigQuery } from "@google-cloud/bigquery";
import { promises as fs } from "fs";
import generateHtmlReport from "./buildReport.js";

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

const EXCLUDE_AS_JOIN_KEYS = [
	"event",
	"event_name",
	// "event_id",
	// "insert_id",
	"time",
	"timestamp",
	"created_at",
	"updated_at",
	"event_time",
	"_table_suffix",
	"_partitiontime",
	"_partitiondate",
	// "distinct_id",
	// "user_id",
	// "email",
	// "client_id",
	// "visit_id",
	// "session_id",
	"event_definition_id"
];

console.log(`\n\nRunning BigQuery Audit with configuration:\n
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

// Analytics compatibility analysis
function analyzeAnalyticsCompatibility(tables) {
	const insights = {
		mixpanel_ready: [],
		event_tables: [],
		user_tables: [],
		data_quality: [],
		field_patterns: {
			timestamp_fields: new Set(),
			user_id_fields: new Set(),
			event_id_fields: new Set(),
			session_fields: new Set()
		}
	};

	// Enhanced field pattern detection - prioritize actual data types over field names
	const validTimestampTypes = new Set(['TIMESTAMP', 'DATETIME', 'DATE', 'TIME']);
	// Looks for whole words `timestamp`, `time`, `date`, `ts`, or suffixes `_at`, `_dt`. More precise than `.*time.*`.
	const timestampFieldNamePatterns = /(^|_)timestamp($|_)|(^|_)time($|_)|(^|_)date($|_)|(^|_)ts($|_)|_at$|_dt$/i;
	// Modular pattern for user synonyms, handling separators `_`, `.`, or none, and `id` or `guid`.
	const userIdPatterns = /^(?:user|client|customer|device|profile|account|member|person|identity|distinct|anonymous|anon|actor)(?:_|\.)?(?:id|guid)$/i;
	// Combines specific patterns (`event_id`) with safer generic patterns (`\bid\b`) using word boundaries.
	const eventIdPatterns = /^(?:event|insert|message|unique|record|row)_?id|\buuid\b|\bid\b$/i;
	// Concise pattern for session/visit IDs with different separators and identifier types.
	const sessionPatterns = /^(?:session|visit)(?:_|\.)?(?:id|uuid)$/i;
	// Flexible pattern for event names, actions, or activities, allowing suffixes like `_name` or `_type`.
	const eventNamePatterns = /^(?:event|action|activity)(?:_?(?:name|type)|\.(?:name|type))?$/i;
	// Simple, robust pattern using a word boundary to find `event` or `events` anywhere in a table name.
	const eventTablePatterns = /\bevents?\b/i;

	tables.forEach(table => {
		const analysis = {
			table_name: table.table_name,
			table_type: table.table_type,
			mixpanel_score: 0,
			analytics_features: {
				has_timestamp: false,
				has_user_id: false,
				has_event_id: false,
				has_session_id: false,
				has_event_name: false,
				timestamp_nullable: true,
				user_id_nullable: true,
				event_id_nullable: true
			},
			data_quality: {
				null_rate_estimate: 0,
				unique_fields: [],
				potential_pii: []
			},
			field_analysis: {},
			schema_complexity: {
				total_fields: 0,
				nested_fields: 0,
				repeated_fields: 0,
				struct_fields: 0,
				complex_types: [],
				mixpanel_incompatible_fields: []
			}
		};

		// Analyze schema fields with enhanced detection
		(table.schema || []).forEach(field => {
			const fieldName = field.column_name.toLowerCase();
			const fieldType = field.nested_type || '';
			const fieldPath = field.nested_field_path || field.column_name;
			const isNullable = field.is_nullable === 'YES';
			const baseType = fieldType.split('(')[0].toUpperCase(); // Remove precision info like NUMERIC(10,2)

			analysis.schema_complexity.total_fields++;

			// Enhanced timestamp detection - prioritize actual timestamp types
			const isActualTimestampType = validTimestampTypes.has(baseType);
			const hasTimestampName = timestampFieldNamePatterns.test(fieldName);

			if (isActualTimestampType || (hasTimestampName && baseType.includes('INT64'))) {
				insights.field_patterns.timestamp_fields.add(field.column_name);
				analysis.analytics_features.has_timestamp = true;
				analysis.analytics_features.timestamp_nullable = isNullable;
				// Higher score for actual timestamp types
				if (isActualTimestampType) {
					analysis.mixpanel_score += isNullable ? 3 : 5;
				} else {
					analysis.mixpanel_score += isNullable ? 1 : 2;
				}
			}

			// Enhanced complexity analysis based on Mixpanel best practices
			const isNested = fieldPath && fieldPath.includes('.') && fieldPath !== field.column_name;
			const isRepeated = fieldType.includes('REPEATED') || fieldType.startsWith('ARRAY');
			const isStruct = baseType === 'STRUCT' || baseType === 'RECORD';
			const isJson = baseType === 'JSON';
			const isArrayOfStruct = fieldType.includes('ARRAY<STRUCT') || fieldType.includes('REPEATED STRUCT');
			const nestingDepth = fieldPath ? (fieldPath.match(/\./g) || []).length : 0;

			// Nested field analysis - deeply nested structures are problematic
			if (isNested) {
				analysis.schema_complexity.nested_fields++;
				const complexityType = nestingDepth > 2 ? 'DEEPLY_NESTED' : 'NESTED';
				analysis.schema_complexity.complex_types.push({
					field: field.column_name,
					type: complexityType,
					full_type: fieldType,
					path: fieldPath,
					nesting_depth: nestingDepth
				});

				// Heavy penalty for deeply nested structures (3+ levels)
				if (nestingDepth > 2) {
					analysis.mixpanel_score -= 3;
					analysis.schema_complexity.mixpanel_incompatible_fields.push(field.column_name + ' (DEEPLY NESTED)');
				} else if (nestingDepth > 1) {
					analysis.mixpanel_score -= 1;
					analysis.schema_complexity.mixpanel_incompatible_fields.push(field.column_name + ' (NESTED)');
				}
			}

			// Array/Repeated field analysis - distinguish acceptable vs problematic
			if (isRepeated) {
				analysis.schema_complexity.repeated_fields++;

				if (isArrayOfStruct && nestingDepth <= 1) {
					// ARRAY<STRUCT> for shopping carts etc. - acceptable with minimal penalty
					analysis.schema_complexity.complex_types.push({
						field: field.column_name,
						type: 'ARRAY_OF_STRUCT',
						full_type: fieldType,
						path: fieldPath,
						mixpanel_acceptable: true
					});
					analysis.mixpanel_score -= 0.5; // Light penalty
				} else {
					// Other repeated structures - moderate penalty
					analysis.schema_complexity.complex_types.push({
						field: field.column_name,
						type: 'REPEATED',
						full_type: fieldType,
						path: fieldPath
					});
					analysis.mixpanel_score -= 1;
					analysis.schema_complexity.mixpanel_incompatible_fields.push(field.column_name + ' (REPEATED)');
				}
			}

			// STRUCT field analysis - penalize based on complexity
			if (isStruct) {
				analysis.schema_complexity.struct_fields++;
				analysis.schema_complexity.complex_types.push({
					field: field.column_name,
					type: 'STRUCT',
					full_type: fieldType,
					path: fieldPath
				});
				analysis.mixpanel_score -= 1;
				analysis.schema_complexity.mixpanel_incompatible_fields.push(field.column_name + ' (STRUCT)');
			}

			// JSON field analysis - single JSON objects are acceptable
			if (isJson && !isNested) {
				analysis.schema_complexity.complex_types.push({
					field: field.column_name,
					type: 'JSON',
					full_type: fieldType,
					path: fieldPath,
					mixpanel_acceptable: true
				});
				// No penalty for simple JSON fields - they're acceptable for Mixpanel
			}

			if (userIdPatterns.test(fieldName)) {
				insights.field_patterns.user_id_fields.add(field.column_name);
				analysis.analytics_features.has_user_id = true;
				analysis.analytics_features.user_id_nullable = isNullable;
				analysis.mixpanel_score += isNullable ? 1 : 3;
			}

			if (eventIdPatterns.test(fieldName)) {
				insights.field_patterns.event_id_fields.add(field.column_name);
				analysis.analytics_features.has_event_id = true;
				analysis.analytics_features.event_id_nullable = isNullable;
				analysis.mixpanel_score += isNullable ? 1 : 2;
			}

			if (sessionPatterns.test(fieldName)) {
				insights.field_patterns.session_fields.add(field.column_name);
				analysis.analytics_features.has_session_id = true;
				analysis.mixpanel_score += 1;
			}

			// Specific Mixpanel field requirements (based on Mixpanel best practices article)
			if (fieldName === 'event' && baseType === 'STRING') {
				analysis.analytics_features.has_event_field = true;
				analysis.mixpanel_score += 3; // Critical field for event tables
			}

			if (fieldName === 'distinct_id' && (baseType === 'STRING' || baseType === 'INT64')) {
				analysis.analytics_features.has_distinct_id = true;
				analysis.mixpanel_score += 3; // Critical user identifier
			}

			if (fieldName === 'device_id' && (baseType === 'STRING' || baseType === 'INT64')) {
				analysis.analytics_features.has_device_id = true;
				analysis.mixpanel_score += 2; // Important for anonymous tracking
			}

			if (fieldName === 'insert_id' && (baseType === 'STRING' || baseType === 'INT64')) {
				analysis.analytics_features.has_insert_id = true;
				analysis.mixpanel_score += 2; // Important for de-duplication
			}

			if (eventNamePatterns.test(fieldName)) {
				analysis.analytics_features.has_event_name = true;
				analysis.mixpanel_score += 1;
			}

			// Data quality analysis
			if (!isNullable) {
				analysis.data_quality.unique_fields.push(field.column_name);
			}

			// PII detection
			if (/email|phone|address|ssn|social|first|last/i.test(fieldName)) {
				analysis.data_quality.potential_pii.push(field.column_name);
			}

			// Store field analysis
			analysis.field_analysis[field.column_name] = {
				type: fieldType,
				nullable: isNullable,
				is_join_key: field.is_potential_join_key || false
			};
		});

		// Sample data analysis for data quality, PII detection, and freshness
		if (table.sample_data && table.sample_data.length > 0) {
			const sampleSize = table.sample_data.length;

			// PII detection patterns
			const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			const ssnPattern = /^\d{3}-?\d{2}-?\d{4}$/;
			const creditCardPattern = /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/;
			const phonePattern = /^[\+]?[1-9][\d]{0,15}$/;

			Object.keys(table.sample_data[0] || {}).forEach(fieldName => {
				const values = table.sample_data.map(row => row[fieldName]).filter(v => v !== null && v !== undefined && v !== '');

				const nullCount = table.sample_data.filter(row =>
					row[fieldName] === null || row[fieldName] === undefined || row[fieldName] === ''
				).length;
				const nullRate = (nullCount / sampleSize) * 100;

				if (analysis.field_analysis[fieldName]) {
					analysis.field_analysis[fieldName].null_rate_sample = Math.round(nullRate);
				}

				// Enhanced PII detection on actual values
				if (values.length > 0) {
					const stringValues = values.filter(v => typeof v === 'string');
					if (stringValues.length > 0) {
						const emailCount = stringValues.filter(v => emailPattern.test(v)).length;
						const ssnCount = stringValues.filter(v => ssnPattern.test(v)).length;
						const creditCardCount = stringValues.filter(v => creditCardPattern.test(v)).length;
						const phoneCount = stringValues.filter(v => phonePattern.test(v.replace(/[\s\-\(\)]/g, ''))).length;

						// If >30% of values match PII patterns, flag as PII
						const threshold = Math.max(1, Math.floor(stringValues.length * 0.3));

						if (emailCount >= threshold) {
							analysis.data_quality.potential_pii.push(fieldName + ' (emails)');
						}
						if (ssnCount >= threshold) {
							analysis.data_quality.potential_pii.push(fieldName + ' (SSNs)');
						}
						if (creditCardCount >= threshold) {
							analysis.data_quality.potential_pii.push(fieldName + ' (credit cards)');
						}
						if (phoneCount >= threshold) {
							analysis.data_quality.potential_pii.push(fieldName + ' (phone numbers)');
						}
					}
				}
			});

			// Data freshness analysis for timestamp fields - use enhanced detection
			const timestampField = analysis.analytics_features.has_timestamp ?
				(table.schema || []).find(f => {
					const fieldType = (f.nested_type || '').split('(')[0].toUpperCase();
					const fieldName = f.column_name.toLowerCase();
					return validTimestampTypes.has(fieldType) || timestampFieldNamePatterns.test(fieldName);
				}) : null;

			if (timestampField) {
				const timestamps = table.sample_data
					.map(row => row[timestampField.column_name])
					.filter(ts => ts && ts !== null && ts !== undefined)
					.map(ts => {
						try {
							return new Date(ts).getTime();
						} catch (e) {
							return null;
						}
					})
					.filter(ts => ts !== null && !isNaN(ts));

				if (timestamps.length > 0) {
					const now = Date.now();
					const maxTimestamp = Math.max(...timestamps);
					const minTimestamp = Math.min(...timestamps);
					const daysSinceNewest = Math.floor((now - maxTimestamp) / (1000 * 60 * 60 * 24));
					const daysSinceOldest = Math.floor((now - minTimestamp) / (1000 * 60 * 60 * 24));

					analysis.data_freshness = {
						timestamp_field: timestampField.column_name,
						newest_record_days_ago: daysSinceNewest,
						oldest_record_days_ago: daysSinceOldest,
						data_span_days: daysSinceOldest - daysSinceNewest,
						freshness_score: daysSinceNewest <= 1 ? 'fresh' : daysSinceNewest <= 7 ? 'recent' : daysSinceNewest <= 30 ? 'stale' : 'old'
					};
				}
			}
		}

		// Enhanced table categorization with event table patterns
		analysis.table_category = 'unknown';
		const tableName = table.table_name.toLowerCase();
		const isEventTableByName = eventTablePatterns.test(table.table_name);

		// Event table detection - prioritize table name patterns
		if (isEventTableByName ||
			(analysis.analytics_features.has_timestamp && analysis.analytics_features.has_user_id) ||
			(analysis.analytics_features.has_timestamp &&
				(analysis.analytics_features.has_event_name || analysis.analytics_features.has_event_id))) {

			analysis.table_category = 'event';
			insights.event_tables.push(analysis);

			// Higher Mixpanel score for properly structured event tables
			if (analysis.analytics_features.has_timestamp && analysis.analytics_features.has_user_id) {
				analysis.mixpanel_score += 2;
			}
		}
		// Profile table detection
		else if (analysis.analytics_features.has_user_id && !analysis.analytics_features.has_timestamp) {
			if (tableName.includes('user') ||
				tableName.includes('profile') ||
				tableName.includes('customer') ||
				tableName.includes('member')) {
				analysis.table_category = 'profile';
				insights.user_tables.push(analysis);
			}
		}
		// Tables with timestamp but no user_id might be system events or logs
		else if (analysis.analytics_features.has_timestamp && !analysis.analytics_features.has_user_id) {
			analysis.table_category = 'system_event';
			insights.event_tables.push(analysis);
		}
		// Lookup tables (no timestamp, may have user_id or other join keys)
		else {
			const joinKeyCount = (table.schema || []).filter(f => f.is_potential_join_key).length;
			if (joinKeyCount > 0) {
				analysis.table_category = 'lookup';
			}
		}

		// Penalize Mixpanel score for high schema complexity
		const complexityPenalty = Math.min(3, analysis.schema_complexity.struct_fields + analysis.schema_complexity.repeated_fields);
		analysis.mixpanel_score = Math.max(0, analysis.mixpanel_score - complexityPenalty);

		// Cap Mixpanel score at maximum of 10
		analysis.mixpanel_score = Math.min(10, analysis.mixpanel_score);

		// Mixpanel readiness (for event tables specifically)
		if (analysis.table_category === 'event' && analysis.mixpanel_score >= 4) {
			insights.mixpanel_ready.push(analysis);
		}

		insights.data_quality.push(analysis);
	});

	// Convert Sets to Arrays for JSON serialization
	insights.field_patterns.timestamp_fields = Array.from(insights.field_patterns.timestamp_fields);
	insights.field_patterns.user_id_fields = Array.from(insights.field_patterns.user_id_fields);
	insights.field_patterns.event_id_fields = Array.from(insights.field_patterns.event_id_fields);
	insights.field_patterns.session_fields = Array.from(insights.field_patterns.session_fields);

	return insights;
}

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
			if (match[1] && match[1].toLowerCase() !== "information_schema") {
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

// --- Main Audit Logic ---
async function testBigQueryAuth() {
	console.log(`${colors.yellow}Testing BigQuery authentication and connectivity...${colors.nc}`);
	try {
		const datasets = await bigquery.getDatasets();
		console.log(`${colors.green}✓ BigQuery authentication successful.${colors.nc}`);

		// Test if we have query permissions (jobUser role)
		try {
			await bigquery.query({
				query: "SELECT 1 as test",
				location: config.location,
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

	// Primitive values - return as is
	return value;
}

// REST API fallback for sample data when query access is denied
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
				// Check for HTTP error status codes
				if (res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
					return;
				}

				let data = "";
				res.on("data", chunk => (data += chunk));
				res.on("end", () => {
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
						reject(new Error(`Failed to parse response: ${parseError.message}`));
					}
				});
			});

			req.on("error", error => {
				reject(new Error(`Request failed: ${error.message}`));
			});

			req.on("timeout", () => {
				req.destroy();
				reject(new Error("Request timed out after 30 seconds"));
			});

			req.setTimeout(30000);
		});
	} catch (error) {
		throw new Error(`Authentication failed: ${error.message}`);
	}
}

// REST API function to get table list when query permissions are not available
async function getTablesViaREST(projectId, datasetId) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		let allTables = [];
		let nextPageToken = null;

		do {
			const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`);
			url.searchParams.set('maxResults', '1000'); // Increase from default 50 to 1000
			if (nextPageToken) {
				url.searchParams.set('pageToken', nextPageToken);
			}

			const response = await new Promise((resolve, reject) => {
				const options = {
					headers: {
						Authorization: `Bearer ${accessToken.token}`,
						"Content-Type": "application/json"
					},
					timeout: 30000 // 30 second timeout
				};

				const req = https.get(url.toString(), options, res => {
					// Check for HTTP error status codes
					if (res.statusCode < 200 || res.statusCode >= 300) {
						reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
						return;
					}

					let data = "";
					res.on("data", chunk => (data += chunk));
					res.on("end", () => {
						try {
							const response = JSON.parse(data);
							if (response.error) {
								reject(new Error(`BigQuery API Error: ${response.error.message}`));
								return;
							}
							resolve(response);
						} catch (parseError) {
							reject(new Error(`Failed to parse response: ${parseError.message}`));
						}
					});
				});

				req.on("error", error => {
					reject(new Error(`Request failed: ${error.message}`));
				});

				req.on("timeout", () => {
					req.destroy();
					reject(new Error("Request timed out after 30 seconds"));
				});

				req.setTimeout(30000);
			});

			// Process this page's tables
			if (response.tables) {
				const tables = response.tables.map(table => ({
					table_name: table.tableReference.tableId,
					table_type: table.type === "VIEW" ? "VIEW" : "BASE TABLE",
					creation_time: new Date(parseInt(table.creationTime)).toISOString().replace("T", " ").substring(0, 19),
					ddl: null // Not available via REST API
				}));
				allTables.push(...tables);
			}

			// Check for next page
			nextPageToken = response.nextPageToken;
		} while (nextPageToken);

		return allTables;
	} catch (error) {
		throw new Error(`Authentication failed: ${error.message}`);
	}
}

// REST API function to get table metadata (schema + size) when query permissions are not available
async function getTableMetadataViaREST(projectId, datasetId, tableName) {
	try {
		const authClient = await auth.getClient();
		const accessToken = await authClient.getAccessToken();

		const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableName}`;

		return new Promise((resolve, reject) => {
			const options = {
				headers: {
					Authorization: `Bearer ${accessToken.token}`,
					"Content-Type": "application/json"
				},
				timeout: 30000 // 30 second timeout
			};

			const req = https.get(url, options, res => {
				// Check for HTTP error status codes
				if (res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
					return;
				}

				let data = "";
				res.on("data", chunk => (data += chunk));
				res.on("end", () => {
					try {
						const response = JSON.parse(data);
						if (response.error) {
							reject(new Error(`BigQuery API Error: ${response.error.message}`));
							return;
						}

						const result = {
							schema: [],
							size_mb: 0,
							num_rows: 0
						};

						if (response.schema && response.schema.fields) {
							// Convert REST API schema format to our expected format
							const schema = [];

							function processFields(fields, parentPath = "") {
								fields.forEach(field => {
									const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;
									schema.push({
										column_name: field.name,
										nested_field_path: fieldPath,
										nested_type: field.type,
										is_nullable: field.mode === "NULLABLE" ? "YES" : "NO",
										is_partitioning_column: "NO", // Not available via REST API
										clustering_ordinal_position: null
									});

									// Handle nested fields
									if (field.fields) {
										processFields(field.fields, fieldPath);
									}
								});
							}

							processFields(response.schema.fields);
							result.schema = schema;
						}

						// Extract size information from REST API response
						if (response.numBytes) {
							result.size_mb = Math.round((parseInt(response.numBytes) / 1024 / 1024) * 100) / 100;
						}
						if (response.numRows) {
							result.num_rows = parseInt(response.numRows);
						}

						resolve(result);
					} catch (parseError) {
						reject(new Error(`Failed to parse response: ${parseError.message}`));
					}
				});
			});

			req.on("error", error => {
				reject(new Error(`Request failed: ${error.message}`));
			});

			req.on("timeout", () => {
				req.destroy();
				reject(new Error("Request timed out after 30 seconds"));
			});

			req.setTimeout(30000);
		});
	} catch (error) {
		throw new Error(`Authentication failed: ${error.message}`);
	}
}

// Backward compatibility wrapper for schema-only access
async function getTableSchemaViaREST(projectId, datasetId, tableName) {
	const metadata = await getTableMetadataViaREST(projectId, datasetId, tableName);
	return metadata.schema;
}

async function runAudit() {
	const permissionMode = await testBigQueryAuth();
	console.log(`${colors.cyan}=== BigQuery Dataset Audit Initializing ===${colors.nc}`);
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
	let auditSummary = {
		total_tables: 0,
		total_views: 0,
		failed_objects: 0,
		total_rows_accessible: 0
	};

	// CSV Headers - updated to include join key detection
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
	const allSchemasCatalogCsv = [
		"table_name",
		"column_name",
		"nested_field_path",
		"nested_type",
		"is_nullable",
		"is_partitioning_column",
		"clustering_ordinal_position",
		"is_potential_join_key"
	];
	await fs.writeFile(path.join(config.outputDir, "reports", "all_tables_summary.csv"), allTablesSummaryCsv.join(",") + "\n");
	await fs.writeFile(path.join(config.outputDir, "reports", "all_schemas_catalog.csv"), allSchemasCatalogCsv.join(",") + "\n");

	let tables;
	try {
		if (permissionMode === "jobUser") {
			console.log(`${colors.yellow}Fetching table list from INFORMATION_SCHEMA.TABLES...${colors.nc}`);

			// Check if any patterns contain glob characters
			const hasGlobPatterns = config.tableFilter && config.tableFilter.some(pattern =>
				pattern.includes('*') || pattern.includes('?')
			);

			let tablesQuery = `
	            SELECT 
	                table_name, 
	                table_type, 
	                FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', creation_time, 'UTC') as creation_time, 
	                ddl
	            FROM \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.TABLES\`
	            WHERE table_schema = '${config.datasetId}'`;

			// Add table filtering if specified and no glob patterns
			if (config.tableFilter && config.tableFilter.length > 0 && !hasGlobPatterns) {
				const tableList = config.tableFilter.map(t => `'${t}'`).join(",");
				tablesQuery += ` AND table_name IN (${tableList})`;
			}

			tablesQuery += ` ORDER BY table_type, table_name`;

			const [queryResults] = await bigquery.query({ query: tablesQuery, location: config.location });
			let allTables = queryResults;

			// Apply glob pattern filtering if needed
			if (config.tableFilter && config.tableFilter.length > 0 && hasGlobPatterns) {
				tables = allTables.filter(table => {
					return config.tableFilter.some(pattern => {
						// Check if pattern contains glob characters
						if (pattern.includes('*') || pattern.includes('?')) {
							return matchesGlob(table.table_name, pattern);
						} else {
							// Exact match for non-glob patterns
							return table.table_name === pattern;
						}
					});
				});
			} else {
				tables = allTables;
			}
		} else {
			// dataViewer mode - use REST API
			console.log(`${colors.yellow}Fetching table list via REST API (dataViewer mode)...${colors.nc}`);
			const allTables = await getTablesViaREST(config.projectId, config.datasetId);

			// Apply table filtering if specified (supports glob patterns)
			if (config.tableFilter && config.tableFilter.length > 0) {
				tables = allTables.filter(table => {
					return config.tableFilter.some(pattern => {
						// Check if pattern contains glob characters
						if (pattern.includes('*') || pattern.includes('?')) {
							return matchesGlob(table.table_name, pattern);
						} else {
							// Exact match for non-glob patterns
							return table.table_name === pattern;
						}
					});
				});
			} else {
				tables = allTables;
			}

			// Sort tables
			tables.sort((a, b) => {
				if (a.table_type !== b.table_type) {
					return a.table_type.localeCompare(b.table_type);
				}
				return a.table_name.localeCompare(b.table_name);
			});
		}

		if (config.tableFilter && config.tableFilter.length > 0) {
			console.log(`${colors.green}✓ Found ${tables.length} objects to audit (filtered from ${config.tableFilter.length} requested tables).\n`);
		} else {
			console.log(`${colors.green}✓ Found ${tables.length} objects to audit.\n`);
		}

		// First pass: collect all field names across tables for join key detection
		console.log(`${colors.yellow}Analyzing schemas for join key detection...${colors.nc}`);
		const allFieldNames = new Map(); // field_name -> Set of table names that have this field

		// Common event fields that should be excluded from join key detection
		const excludedFieldNames = new Set(EXCLUDE_AS_JOIN_KEYS);

		// Valid join key data types (BigQuery types)
		const validJoinKeyTypes = new Set(["STRING", "INT64", "INTEGER", "BIGINT", "SMALLINT", "TINYINT"]);

		for (const table of tables) {
			try {
				let schema;
				if (permissionMode === "jobUser") {
					const schemaQuery = `
	                    SELECT column_name, field_path, data_type
	                    FROM \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.COLUMN_FIELD_PATHS\`
	                    WHERE table_name = '${table.table_name}' AND table_schema = '${config.datasetId}'`;
					const [queryResult] = await bigquery.query({ query: schemaQuery, location: config.location });
					schema = queryResult;
				} else {
					// dataViewer mode - use REST API
					schema = await getTableSchemaViaREST(config.projectId, config.datasetId, table.table_name);
				}

				for (const field of schema) {
					const fieldName = field.column_name;
					const fieldPath = field.field_path || field.nested_field_path || fieldName;
					const dataType = field.data_type || field.nested_type || "";

					// Skip if field name is in exclusion list
					if (excludedFieldNames.has(fieldName.toLowerCase())) {
						continue;
					}

					// Skip if field is nested (contains dots in field path, indicating it's inside a struct/array)
					if (fieldPath && fieldPath !== fieldName && fieldPath.includes(".")) {
						continue;
					}

					// Skip if data type is not a valid join key type
					if (!validJoinKeyTypes.has(dataType.toUpperCase())) {
						continue;
					}

					if (!allFieldNames.has(fieldName)) {
						allFieldNames.set(fieldName, new Set());
					}
					allFieldNames.get(fieldName).add(table.table_name);
				}
			} catch (error) {
				// Skip if schema access fails, we'll handle this in the main loop
				console.log(`${colors.yellow}  └ ⚠ Skipping schema analysis for '${table.table_name}' due to permissions${colors.nc}`);
			}
		}

		// Identify potential join keys (fields that appear in multiple tables)
		const potentialJoinKeys = new Set();
		for (const [fieldName, tableSet] of allFieldNames.entries()) {
			if (tableSet.size > 1) {
				potentialJoinKeys.add(fieldName);
			}
		}

		console.log(`${colors.green}✓ Found ${potentialJoinKeys.size} potential join keys across ${tables.length} tables.\n`);

		let currentObject = 0;
		for (const table of tables) {
			currentObject++;
			console.log(`${colors.magenta}Processing [${currentObject}/${tables.length}]: ${table.table_type} '${table.table_name}'${colors.nc}`);

			const tableData = {
				table_name: table.table_name,
				table_type: table.table_type,
				creation_time: table.creation_time,
				size_mb: 0,
				num_rows_metadata: 0,
				has_permission_error: false,
				error_details: []
			};

			// 0.5. Get table size information (only for BASE TABLE types)
			if (table.table_type === "BASE TABLE") {
				try {
					if (permissionMode === "jobUser") {
						// Use SQL query for size information
						const sizeQuery = `
							SELECT 
								ROUND(size_bytes / 1024 / 1024, 2) as size_mb,
								row_count
							FROM \`${config.projectId}.${config.datasetId}.__TABLES__\`
							WHERE table_id = '${table.table_name}'`;
						const [sizeResult] = await bigquery.query({ query: sizeQuery, location: config.location });
						if (sizeResult && sizeResult.length > 0) {
							tableData.size_mb = sizeResult[0].size_mb || 0;
							tableData.num_rows_metadata = sizeResult[0].row_count || 0;
						}
					} else {
						// dataViewer mode - use REST API for size information
						const metadata = await getTableMetadataViaREST(config.projectId, config.datasetId, table.table_name);
						tableData.size_mb = metadata.size_mb || 0;
						tableData.num_rows_metadata = metadata.num_rows || 0;
					}
				} catch (e) {
					// Size information is not critical, just log and continue
					console.log(`${colors.yellow}  └ ⚠ Could not get size info for '${table.table_name}'${colors.nc}`);
				}
			}

			// 1. Get Schema (method depends on permission mode)
			let column_count = 0;
			try {
				let schema;
				if (permissionMode === "jobUser") {
					const schemaQuery = `
	                    SELECT 
	                        cfp.column_name, 
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
	                    WHERE cfp.table_name = '${table.table_name}' AND cfp.table_schema = '${config.datasetId}'
	                    ORDER BY cfp.field_path`;
					const [queryResult] = await bigquery.query({ query: schemaQuery, location: config.location });
					schema = queryResult;
				} else {
					// dataViewer mode - use REST API
					schema = await getTableSchemaViaREST(config.projectId, config.datasetId, table.table_name);
				}

				// Add join key detection to schema
				const schemaWithJoinKeys = schema.map(col => ({
					...col,
					is_potential_join_key: potentialJoinKeys.has(col.column_name)
				}));

				tableData.schema = schemaWithJoinKeys;
				column_count = schema.length;

				const schemaCsvHeader = [
					"column_name",
					"nested_field_path",
					"nested_type",
					"is_nullable",
					"is_partitioning_column",
					"clustering_ordinal_position",
					"is_potential_join_key"
				];
				const schemaCsvRowsForTable = schemaWithJoinKeys.map(col =>
					[
						csvEscape(col.column_name),
						csvEscape(col.nested_field_path),
						csvEscape(col.nested_type),
						csvEscape(col.is_nullable),
						csvEscape(col.is_partitioning_column),
						csvEscape(col.clustering_ordinal_position),
						csvEscape(col.is_potential_join_key)
					].join(",")
				);
				await fs.writeFile(
					path.join(config.outputDir, "schemas", `${table.table_name}.csv`),
					schemaCsvHeader.join(",") + "\n" + schemaCsvRowsForTable.join("\n") + "\n"
				);

				// Append to aggregated schema catalog
				const schemaCsvRowsForCatalog = schemaWithJoinKeys.map(col =>
					[
						csvEscape(table.table_name),
						csvEscape(col.column_name),
						csvEscape(col.nested_field_path),
						csvEscape(col.nested_type),
						csvEscape(col.is_nullable),
						csvEscape(col.is_partitioning_column),
						csvEscape(col.clustering_ordinal_position),
						csvEscape(col.is_potential_join_key)
					].join(",")
				);
				await fs.appendFile(path.join(config.outputDir, "reports", "all_schemas_catalog.csv"), schemaCsvRowsForCatalog.join("\n") + "\n");
			} catch (e) {
				tableData.has_permission_error = true;
				tableData.error_details.push("Schema");
				tableData.schema = [];
				tableData.schema_error = jsonEscape(e.message);
				console.log(`${colors.yellow}  └ ⚠ Schema access failed. ${e.message}${colors.nc}`);
			}

			// 1.5. Get Partition and Clustering Information (only in jobUser mode)
			if (permissionMode === "jobUser") {
				try {
					const partitionQuery = `
						SELECT 
							partition_id,
							total_rows,
							total_logical_bytes,
							last_modified_time
						FROM \`${config.projectId}.${formattedRegion}.INFORMATION_SCHEMA.PARTITIONS_SUMMARY\`
						WHERE table_name = '${table.table_name}' AND table_schema = '${config.datasetId}'
						ORDER BY partition_id
						LIMIT 10`; // Limit to first 10 partitions for performance
					const [partitions] = await bigquery.query({ query: partitionQuery, location: config.location });
					tableData.partition_info = partitions;

					if (partitions && partitions.length > 0) {
						console.log(`${colors.green}  └ ✓ Found ${partitions.length} partitions${colors.nc}`);
					}
				} catch (e) {
					// This is not critical, tables might not be partitioned
					tableData.partition_info = [];
				}
			} else {
				// Skip partition info in dataViewer mode
				tableData.partition_info = [];
			}

			// 2. Get Row Count (only in jobUser mode)
			let row_count = 0;
			if (permissionMode === "jobUser") {
				try {
					const countQuery = `SELECT COUNT(*) as count FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\``;
					const [countResult] = await bigquery.query({ query: countQuery, location: config.location });
					row_count = countResult[0].count;
					tableData.row_count = row_count;
					auditSummary.total_rows_accessible += Number(row_count);
				} catch (e) {
					tableData.has_permission_error = true;
					tableData.error_details.push("Row Count");
					tableData.row_count = null;
					tableData.row_count_error = jsonEscape(e.message);
					console.log(`${colors.yellow}  └ ⚠ Row count failed. ${e.message}${colors.nc}`);
				}
			} else {
				// In dataViewer mode, use metadata from size query if available
				tableData.row_count = tableData.num_rows_metadata || null;
				row_count = tableData.row_count || 0;
				if (tableData.row_count) {
					auditSummary.total_rows_accessible += Number(tableData.row_count);
				}
			}

			// 3. Get Sample Data
			if (permissionMode === "jobUser") {
				// Use query-based approach with partition optimization
				try {
					let sampleQuery;
					let partitionInfo = "";

					// Check if table has partition info and use it for efficient sampling
					if (tableData.partition_info && tableData.partition_info.length > 0) {
						// Find partitions with data (prefer recent partitions)
						const partitionsWithData = tableData.partition_info
							.filter(p => p.total_rows > 0 && p.partition_id !== "__NULL__" && p.partition_id !== "__UNPARTITIONED__")
							.sort((a, b) => new Date(b.last_modified_time) - new Date(a.last_modified_time));

						if (partitionsWithData.length > 0) {
							// Use partition-specific query to avoid full table scan
							const partitionColumn = (tableData.schema || []).find(col => col.is_partitioning_column === "YES");
							if (partitionColumn && partitionColumn.column_name) {
								// Take up to 3 recent partitions to get diverse sample data
								const selectedPartitions = partitionsWithData.slice(0, 3);
								const partitionConditions = selectedPartitions.map(p => {
									// Handle different partition types
									if (p.partition_id.match(/^\d{8}$/)) {
										// Date partition (YYYYMMDD format)
										return `DATE(${partitionColumn.column_name}) = DATE('${p.partition_id.replace(
											/(\\d{4})(\\d{2})(\\d{2})/,
											"$1-$2-$3"
										)}')`;
									} else if (p.partition_id.match(/^\d{10}$/)) {
										// Datetime/timestamp partition
										return `DATE(${partitionColumn.column_name}) = DATE('${p.partition_id.substring(
											0,
											4
										)}-${p.partition_id.substring(4, 6)}-${p.partition_id.substring(6, 8)}')`;
									} else {
										// Direct partition value (integer partitioning, etc.)
										return `${partitionColumn.column_name} = '${p.partition_id}'`;
									}
								});

								sampleQuery = `
									SELECT * FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\`
									WHERE (${partitionConditions.join(" OR ")})
									LIMIT ${config.sampleLimit}`;
								partitionInfo = ` from ${selectedPartitions.length} partition(s)`;
							} else {
								// Fallback: use TABLESAMPLE for large partitioned tables
								sampleQuery = `
									SELECT * FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\` TABLESAMPLE SYSTEM (1 PERCENT)
									LIMIT ${config.sampleLimit}`;
								partitionInfo = ` using table sampling`;
							}
						} else {
							// No partitions with data, use regular query
							sampleQuery = `SELECT * FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\` LIMIT ${config.sampleLimit}`;
						}
					} else {
						// Non-partitioned table or no partition info available - use TABLESAMPLE for efficiency if table is large
						const rowCount = tableData.row_count || tableData.num_rows_metadata || 0;
						if (rowCount > 1000000) {
							// 1M+ rows, use sampling
							sampleQuery = `
								SELECT * FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\` TABLESAMPLE SYSTEM (0.1 PERCENT)
								LIMIT ${config.sampleLimit}`;
							partitionInfo = ` using table sampling (large table)`;
						} else {
							sampleQuery = `SELECT * FROM \`${config.projectId}.${config.datasetId}.${table.table_name}\` LIMIT ${config.sampleLimit}`;
						}
					}

					const [sampleData] = await bigquery.query({ query: sampleQuery, location: config.location });
					tableData.sample_data = sampleData;
					await fs.writeFile(path.join(config.outputDir, "samples", `${table.table_name}.json`), JSON.stringify(sampleData, null, 2));
					console.log(`${colors.green}  └ ✓ Sample data retrieved via query${partitionInfo} (${sampleData.length} rows)${colors.nc}`);
				} catch (e) {
					console.log(`${colors.yellow}  └ ⚠ Query failed for sample data, trying REST API fallback...${colors.nc}`);
					try {
						// Try REST API fallback for sample data
						const sampleDataRest = await getSampleDataViaREST(config.projectId, config.datasetId, table.table_name, tableData.schema, config.sampleLimit);
						tableData.sample_data = sampleDataRest;
						await fs.writeFile(
							path.join(config.outputDir, "samples", `${table.table_name}.json`),
							JSON.stringify(sampleDataRest, null, 2)
						);
						console.log(`${colors.green}  └ ✓ Sample data retrieved via REST API (${sampleDataRest.length} rows)${colors.nc}`);
					} catch (restError) {
						tableData.has_permission_error = true;
						tableData.error_details.push("Sample Data");
						tableData.sample_data = [];
						tableData.sample_data_error = jsonEscape(e.message + "; REST fallback: " + restError.message);
						console.log(`${colors.yellow}  └ ⚠ Both query and REST API failed for sample data. ${restError.message}${colors.nc}`);
					}
				}
			} else {
				// dataViewer mode - use REST API directly
				try {
					const sampleDataRest = await getSampleDataViaREST(config.projectId, config.datasetId, table.table_name, tableData.schema, config.sampleLimit);
					tableData.sample_data = sampleDataRest;
					await fs.writeFile(path.join(config.outputDir, "samples", `${table.table_name}.json`), JSON.stringify(sampleDataRest, null, 2));
					console.log(`${colors.green}  └ ✓ Sample data retrieved via REST API (${sampleDataRest.length} rows)${colors.nc}`);
				} catch (restError) {
					tableData.has_permission_error = true;
					tableData.error_details.push("Sample Data");
					tableData.sample_data = [];
					tableData.sample_data_error = jsonEscape(restError.message);
					console.log(`${colors.yellow}  └ ⚠ REST API failed for sample data. ${restError.message}${colors.nc}`);
				}
			}

			// 4. Get View Definition and Dependencies
			if (table.table_type === "VIEW") {
				tableData.view_definition = jsonEscape(table.ddl);
				tableData.dependencies = parseViewDependencies(table.ddl, config.datasetId);
				auditSummary.total_views++;
				console.log(`${colors.green}  └ ✓ Found ${tableData.dependencies.length} table dependencies${colors.nc}`);
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
				tableData.size_mb || 0,
				(tableData.partition_info && tableData.partition_info.length) || 0,
				csvEscape(tableData.creation_time),
				tableData.has_permission_error,
				csvEscape(tableData.error_details.join("; "))
			].join(",");
			await fs.appendFile(path.join(config.outputDir, "reports", "all_tables_summary.csv"), summaryRow + "\n");
		}

		// Build enhanced ERD/lineage graph
		console.log(`\n${colors.yellow}Building ERD and data lineage graph...${colors.nc}`);
		const lineageGraph = {
			nodes: allTables.map(table => ({
				id: table.table_name,
				type: table.table_type,
				row_count: table.row_count || 0,
				size_mb: table.size_mb || 0,
				join_keys: (table.schema || []).filter(col => col.is_potential_join_key).map(col => col.column_name)
			})),
			edges: []
		};

		// Add edges based on view dependencies
		allTables.forEach(table => {
			if (table.table_type === "VIEW" && table.dependencies) {
				table.dependencies.forEach(dependency => {
					// Only add edge if the dependency exists in our dataset
					if (allTables.some(t => t.table_name === dependency)) {
						lineageGraph.edges.push({
							source: dependency,
							target: table.table_name,
							type: "view_dependency",
							label: "feeds into"
						});
					}
				});
			}
		});

		// Add edges based on shared join keys (potential relationships)
		const joinKeyRelationships = new Map();

		// Build map of join keys to tables
		allTables.forEach(table => {
			(table.schema || []).forEach(col => {
				if (col.is_potential_join_key) {
					if (!joinKeyRelationships.has(col.column_name)) {
						joinKeyRelationships.set(col.column_name, []);
					}
					joinKeyRelationships.get(col.column_name).push(table.table_name);
				}
			});
		});

		// Create edges between tables that share join keys
		joinKeyRelationships.forEach((tables, joinKey) => {
			if (tables.length > 1) {
				// Create relationships between all pairs of tables sharing this key
				for (let i = 0; i < tables.length; i++) {
					for (let j = i + 1; j < tables.length; j++) {
						// Avoid duplicate edges with view dependencies
						const hasViewDep = lineageGraph.edges.some(
							edge =>
								(edge.source === tables[i] && edge.target === tables[j]) || (edge.source === tables[j] && edge.target === tables[i])
						);

						if (!hasViewDep) {
							lineageGraph.edges.push({
								source: tables[i],
								target: tables[j],
								type: "join_key",
								label: joinKey,
								bidirectional: true
							});
						}
					}
				}
			}
		});

		console.log(
			`${colors.green}✓ Built ERD with ${lineageGraph.nodes.length} nodes and ${lineageGraph.edges.length} relationships (${lineageGraph.edges.filter(e => e.type === "view_dependency").length
			} view dependencies, ${lineageGraph.edges.filter(e => e.type === "join_key").length} join key relationships).${colors.nc}`
		);

		// Analytics compatibility analysis
		console.log(`\n${colors.yellow}Analyzing tables for analytics compatibility (Mixpanel, event tracking, etc.)...${colors.nc}`);
		const analyticsInsights = analyzeAnalyticsCompatibility(allTables);
		console.log(`${colors.green}✓ Analytics analysis complete: ${analyticsInsights.mixpanel_ready.length} Mixpanel-ready tables found.${colors.nc}`);

		// Finalize JSON
		const finalJson = {
			audit_metadata: {
				generated_at: new Date().toISOString(),
				project_id: config.projectId,
				dataset_id: config.datasetId,
				region: config.location
			},
			tables: allTables,
			lineage: lineageGraph,
			analytics: analyticsInsights,
			summary: { ...auditSummary, total_objects: tables.length }
		};

		console.log(`\n${colors.green}✓ Final JSON structure ready with ${finalJson.tables.length} tables.${colors.nc}`);
		await fs.writeFile(path.join(config.outputDir, "reports", "dataset_audit.json"), JSON.stringify(finalJson, null, 2));

		// Finalize audit summary CSV
		const auditSummaryCsv = [
			"metric,value",
			`total_tables,${auditSummary.total_tables}`,
			`total_views,${auditSummary.total_views}`,
			`total_objects,${tables.length}`,
			`failed_objects,${auditSummary.failed_objects}`,
			`total_rows_accessible,${auditSummary.total_rows_accessible}`
		].join("\n");
		await fs.writeFile(path.join(config.outputDir, "reports", "audit_summary.csv"), auditSummaryCsv + "\n");

		// Generate HTML Report
		console.log(`\n${colors.yellow}Generating Mixpanel-themed HTML report...${colors.nc}`);
		const htmlReport = generateHtmlReport(finalJson);
		await fs.writeFile(path.join(config.outputDir, "reports", "index.html"), htmlReport);

		console.log(`\n${colors.green}✔ Audit complete!${colors.nc}`);
		console.log("==========================================");
		console.log(`All outputs are located in: ${colors.cyan}${config.outputDir}${colors.nc}`);
		console.log(`  - Interactive Report: ${colors.cyan}${path.join(config.outputDir, "reports", "index.html")}${colors.nc}`);
		console.log(`  - Full JSON Output: ${colors.cyan}${path.join(config.outputDir, "reports", "dataset_audit.json")}${colors.nc}`);
		console.log(`  - Tables Summary:   ${colors.cyan}${path.join(config.outputDir, "reports", "all_tables_summary.csv")}${colors.nc}`);
		console.log(`  - Schema Catalog:   ${colors.cyan}${path.join(config.outputDir, "reports", "all_schemas_catalog.csv")}${colors.nc}`);
		console.log("==========================================");
	} catch (error) {
		console.error(
			`\n${colors.red}Fatal Error: Could not fetch table list from INFORMATION_SCHEMA. Check permissions or dataset existence.${colors.nc}`
		);
		console.error(error.message);
		console.error(`\n${colors.yellow}Try running these commands to set up proper permissions:${colors.nc}`);
		console.error(`${colors.cyan}gcloud projects add-iam-policy-binding ${config.projectId} \\${colors.nc}`);
		console.error(`${colors.cyan}  --member='user:your_name@yourdomain.com' \\${colors.nc}`);
		console.error(`${colors.cyan}  --role='roles/bigquery.jobUser'${colors.nc}`);
		console.error(`\n${colors.cyan}gcloud projects add-iam-policy-binding ${config.projectId} \\${colors.nc}`);
		console.error(`${colors.cyan}  --member='user:your_name@yourdomain.com' \\${colors.nc}`);
		console.error(`${colors.cyan}  --role='roles/bigquery.dataViewer'${colors.nc}`);
		process.exit(1);
	}
}


// --- New Function for Advanced Data Quality ---
// todo: implement this in the main flow
async function getAdvancedDataQualityMetrics(projectId, datasetId, tableName, schema) {
	if (!schema || schema.length === 0) return {};

	// Select non-nested, non-repeated columns for analysis
	const columnsToAnalyze = schema
		.filter(field => !field.nested_field_path.includes('.') && field.nested_type !== 'STRUCT' && field.nested_type !== 'RECORD' && !field.nested_type.startsWith('ARRAY'))
		.map(field => field.column_name);

	if (columnsToAnalyze.length === 0) return {};

	const qualityMetrics = {};

	// Build a single query to get all metrics at once for efficiency
	const subqueries = columnsToAnalyze.map(col => `APPROX_COUNT_DISTINCT(\`${col}\`) AS ${col}_distinct_count`);
	const query = `SELECT ${subqueries.join(', ')} FROM \`${projectId}.${datasetId}.${tableName}\``;

	try {
		const [results] = await bigquery.query({ query, location: config.location });
		if (results.length > 0) {
			const counts = results[0];
			for (const col of columnsToAnalyze) {
				qualityMetrics[col] = {
					approx_distinct_count: counts[`${col}_distinct_count`]
				};
			}
		}
		return qualityMetrics;
	} catch (e) {
		console.log(`${colors.yellow}  └ ⚠ Could not run advanced data quality query for '${tableName}'. ${e.message}${colors.nc}`);
		return {}; // Return empty object on failure
	}
}


async function getSecurityPolicies(projectId, datasetId, tableName) {
	const policies = {
		row_access_policies: [],
		data_masking_policies: []
	};

	try {
		// Query for Row Access Policies
		const rlsQuery = `
            SELECT policy_name, filter_expression 
            FROM \`${projectId}.${formatRegion(config.location)}.INFORMATION_SCHEMA.ROW_ACCESS_POLICIES\`
            WHERE table_name = '${tableName}' AND table_schema = '${datasetId}'`;
		const [rlsResults] = await bigquery.query({ query: rlsQuery, location: config.location });
		policies.row_access_policies = rlsResults;

		// Query for Data Masking on columns of this table
		const maskingQuery = `
            SELECT c.column_name, c.rounding_mode, c.masking_expression
            FROM \`${projectId}.${formatRegion(config.location)}.INFORMATION_SCHEMA.COLUMN_FIELD_PATHS\` cfp
            JOIN \`${projectId}.${formatRegion(config.location)}.INFORMATION_SCHEMA.COLUMNS\` c
                ON cfp.table_name = c.table_name AND cfp.table_schema = c.table_schema AND cfp.column_name = c.column_name
            WHERE c.table_name = '${tableName}' AND c.table_schema = '${datasetId}' AND c.masking_expression IS NOT NULL`;
		const [maskingResults] = await bigquery.query({ query: maskingQuery, location: config.location });
		policies.data_masking_policies = maskingResults;

		return policies;
	} catch (e) {
		console.log(`${colors.yellow}  └ ⚠ Could not fetch security policies for '${tableName}'. ${e.message}${colors.nc}`);
		return policies;
	}
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	runAudit().then(() => {
		process.exit(0);
	}).catch(error => {
		console.error(`${colors.red}❌ Audit failed: ${error.message}${colors.nc}`);
		process.exit(1);
	});
}

