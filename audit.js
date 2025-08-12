#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";

// --- Configuration ---
const config = {
    inputFile: process.env.RAW_DATA_FILE || process.argv[2] || "./output/reports/dataset_raw.json",
    outputDir: process.argv[3] || "./output"
};

// --- Colors for Terminal Output ---
const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m", 
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    nc: "\x1b[0m"
};

// --- Field Pattern Detection Constants ---

import {
	EXCLUDE_AS_JOIN_KEYS,
	VALID_TIMESTAMP_TYPES,
	TIMESTAMP_FIELD_PATTERNS,
	USER_ID_PATTERNS,
	EVENT_NAME_PATTERNS,
	SESSION_PATTERNS,
	PII_PATTERNS,
	ANALYTICS_PATTERNS,
	COMMERCE_PATTERNS,
	COMMUNICATION_PATTERNS,
	CONTENT_PATTERNS,
	EVENT_PROPERTY_PATTERNS,
	FOREIGN_KEY_PATTERNS,
	GEOGRAPHIC_PATTERNS,
	NUMERIC_TIMESTAMP_PATTERNS,
	ORGANIZATIONAL_PATTERNS,
	PRIMARY_KEY_PATTERNS,
	SYSTEM_METADATA_PATTERNS
} from './entities.js';


// Enhanced field type detection using comprehensive patterns
function detectFieldType(fieldName, dataType) {
    const detectedTypes = [];
    
    // Check ALL pattern groups for matches (including PII)
    const patternGroups = [
        { patterns: [{ pattern: TIMESTAMP_FIELD_PATTERNS, type: 'timestamp' }], group: 'temporal' },
        { patterns: [{ pattern: NUMERIC_TIMESTAMP_PATTERNS, type: 'numeric_timestamp' }], group: 'temporal' },
        { patterns: [{ pattern: USER_ID_PATTERNS, type: 'user_id' }], group: 'identity' },
        { patterns: [{ pattern: SESSION_PATTERNS, type: 'session' }], group: 'identity' },
        { patterns: [{ pattern: PRIMARY_KEY_PATTERNS, type: 'primary_key' }], group: 'identity' },
        { patterns: [{ pattern: FOREIGN_KEY_PATTERNS, type: 'foreign_key' }], group: 'identity' },
        { patterns: [{ pattern: EVENT_NAME_PATTERNS, type: 'event_name' }], group: 'event' },
        { patterns: [{ pattern: EVENT_PROPERTY_PATTERNS, type: 'event_properties' }], group: 'event' },
        { patterns: GEOGRAPHIC_PATTERNS, group: 'geographic' },
        { patterns: COMMERCE_PATTERNS, group: 'commerce' },
        { patterns: SYSTEM_METADATA_PATTERNS, group: 'system' },
        { patterns: CONTENT_PATTERNS, group: 'content' },
        { patterns: ANALYTICS_PATTERNS, group: 'analytics' },
        { patterns: ORGANIZATIONAL_PATTERNS, group: 'organizational' },
        { patterns: COMMUNICATION_PATTERNS, group: 'communication' },
        // Include PII patterns in the main detection
        { patterns: PII_PATTERNS.map(p => ({ pattern: p.pattern, type: p.type })), group: 'pii' }
    ];
    
    // Test field name against all patterns
    patternGroups.forEach(group => {
        group.patterns.forEach(patternInfo => {
            if (patternInfo.pattern.test(fieldName)) {
                detectedTypes.push({
                    type: patternInfo.type,
                    group: group.group
                });
            }
        });
    });
    
    // Special handling for data type-based detection
    if (VALID_TIMESTAMP_TYPES.has(dataType)) {
        detectedTypes.push({
            type: 'timestamp',
            group: 'temporal',
            by_data_type: true
        });
    }
    
    // Check for boolean types
    if (/boolean|bool|bit/i.test(dataType) || /^(is_|has_|can_|should_|will_|was_)/i.test(fieldName)) {
        detectedTypes.push({
            type: 'boolean_flag',
            group: 'system'
        });
    }
    
    // Check for numeric types that might be IDs
    if (/int|integer|bigint|number|numeric/i.test(dataType) && /_id$/i.test(fieldName)) {
        detectedTypes.push({
            type: 'numeric_id',
            group: 'identity'
        });
    }
    
    // Remove duplicates and filter out unknown types
    const uniqueTypes = [];
    const seen = new Set();
    detectedTypes.forEach(typeInfo => {
        if (typeInfo.type !== 'unknown' && !seen.has(typeInfo.type)) {
            seen.add(typeInfo.type);
            uniqueTypes.push(typeInfo);
        }
    });
    
    return uniqueTypes;
}

// Analytics compatibility analysis based on Mixpanel requirements
function analyzeAnalyticsCompatibility(tables) {
    const insights = {
        event_tables: [],      // Tables with TIMESTAMP + USER_ID (core Mixpanel requirement)
        user_tables: [],       // Tables with USER_ID (but no timestamp required)  
        lookup_tables: [],     // Tables with arbitrary join keys, no timestamp
        complex_fields: [],    // Tables with complex nested structures
        pii_warnings: [],      // Tables with potential PII fields
        data_quality: [],      // All table analyses (required by TypeScript definition and UI)
        field_patterns: {
            timestamp_fields: new Set(),
            user_id_fields: new Set(),
            event_name_fields: new Set(),
            session_fields: new Set(),
            complex_fields: new Set(),
            pii_fields: new Set()
        }
    };


    tables.forEach((table, index) => {
        try {
        const analysis = {
            table_name: table.table_name,
            table_type: table.table_type,
            table_category: 'UNKNOWN',  // Will be: EVENT, USER, LOOKUP, or UNKNOWN
            mixpanel_compatibility: 0,  // 0-10 score
            row_count: table.row_count || 0,
            size_bytes: table.size_bytes || 0,
            creation_time: table.creation_time,
            required_fields: {
                has_timestamp: false,
                has_user_id: false,
                timestamp_fields: [],
                user_id_fields: []
            },
            event_schema_type: null,    // 'MULTI_SCHEMA', 'MONO_SCHEMA', or null
            schema_complexity: {
                total_fields: 0,
                complex_fields: [],     // STRUCT, RECORD, JSON, REPEATED fields
                nested_depth: 0,
                total_subfields: 0
            },
            data_quality: {
                potential_pii: [],
                volume_category: 'UNKNOWN',  // SMALL, MEDIUM, LARGE based on row count
                freshness: null             // Days since last update
            },
            field_details: {}  // Detailed info per field
        };

        // Analyze schema if available
        if (table.schema && table.schema.length > 0) {
            analysis.schema_complexity.total_fields = table.schema.length;
            
            // Process each field individually to preserve nested field structure
            // Don't group by column_name as this loses nested fields like linked_device.language
            table.schema.forEach(field => {
                const fieldPath = field.nested_field_path || field.column_name;
                const fieldName = fieldPath.toLowerCase();
                const fieldType = field.nested_type || field.data_type || '';
                
                // Check for timestamps
                const isTimestampType = VALID_TIMESTAMP_TYPES.has(fieldType);
                const isTimestampName = TIMESTAMP_FIELD_PATTERNS.test(fieldName);
                if (isTimestampType || isTimestampName) {
                    analysis.required_fields.has_timestamp = true;
                    analysis.required_fields.timestamp_fields.push({
                        name: fieldPath,
                        type: fieldType,
                        nullable: field.is_nullable === 'YES',
                        by_type: isTimestampType,
                        by_name: isTimestampName
                    });
                    insights.field_patterns.timestamp_fields.add(fieldName);
                }

                // Check for user IDs  
                if (USER_ID_PATTERNS.test(fieldName)) {
                    analysis.required_fields.has_user_id = true;
                    analysis.required_fields.user_id_fields.push({
                        name: fieldPath,
                        type: fieldType,
                        nullable: field.is_nullable === 'YES'
                    });
                    insights.field_patterns.user_id_fields.add(fieldName);
                }

                // Check for event names (multi-schema indicator)
                if (EVENT_NAME_PATTERNS.test(fieldName)) {
                    insights.field_patterns.event_name_fields.add(fieldName);
                }

                // Check for session fields
                if (SESSION_PATTERNS.test(fieldName)) {
                    insights.field_patterns.session_fields.add(fieldName);
                }

                // Complex field analysis - check if this field is complex or nested
                const isNested = fieldPath.includes('.');
                const isComplexType = ['STRUCT', 'RECORD', 'JSON'].some(type => fieldType.includes(type)) || 
                                     fieldType.includes('REPEATED') || fieldType.includes('ARRAY');
                
                if (isNested || isComplexType) {
                    const complexField = {
                        name: fieldPath,
                        type: fieldType,
                        subfield_count: 1, // Each field is counted individually now
                        subfields: [{
                            path: fieldPath,
                            type: fieldType,
                            depth: fieldPath.split('.').length
                        }],
                        max_nesting_depth: fieldPath.split('.').length
                    };
                    
                    analysis.schema_complexity.complex_fields.push(complexField);
                    analysis.schema_complexity.nested_depth = Math.max(
                        analysis.schema_complexity.nested_depth, 
                        complexField.max_nesting_depth
                    );
                    analysis.schema_complexity.total_subfields += 1;
                    insights.field_patterns.complex_fields.add(fieldName);
                }

                // Enhanced PII detection
                const detectedPII = [];
                PII_PATTERNS.forEach(piiInfo => {
                    if (piiInfo.pattern.test(fieldName)) {
                        detectedPII.push(piiInfo.type);
                    }
                });
                if (detectedPII.length > 0) {
                    analysis.data_quality.potential_pii.push({
                        field: fieldPath,
                        types: detectedPII
                    });
                    detectedPII.forEach(type => insights.field_patterns.pii_fields.add(`${fieldName}:${type}`));
                }

                // Enhanced field type detection
                const detectedFieldTypes = detectFieldType(fieldName, fieldType);
                
                // Store field details using full path as key
                analysis.field_details[fieldPath] = {
                    type: fieldType,
                    nullable: field.is_nullable === 'YES',
                    is_partitioning: field.is_partitioning_column,
                    is_clustering: field.clustering_ordinal_position != null,
                    subfield_count: 1,
                    detected_pii: detectedPII,
                    detected_field_types: detectedFieldTypes
                };
            });
        }

        // Determine table category based on Mixpanel requirements
        const hasTimestamp = analysis.required_fields.has_timestamp;
        const hasUserId = analysis.required_fields.has_user_id;
        const hasEventName = insights.field_patterns.event_name_fields.size > 0;

        if (hasTimestamp && hasUserId) {
            analysis.table_category = 'EVENT';
            // Determine if multi-schema or mono-schema
            analysis.event_schema_type = hasEventName ? 'MULTI_SCHEMA' : 'MONO_SCHEMA';
        } else if (hasUserId && !hasTimestamp) {
            analysis.table_category = 'USER';
        } else if (!hasTimestamp && !hasUserId) {
            // Tables with join keys but no timestamp/user_id are likely lookup tables
            const hasJoinableFields = table.schema?.some(field => field.is_potential_join_key);
            analysis.table_category = hasJoinableFields ? 'LOOKUP' : 'UNKNOWN';
        } else {
            analysis.table_category = 'UNKNOWN';
        }

        // Calculate Mixpanel compatibility score (0-10)
        let score = 0;
        
        if (analysis.table_category === 'EVENT') {
            score = 7; // Start with high score for event tables
            
            // Bonus points for quality
            if (analysis.required_fields.timestamp_fields.some(f => !f.nullable)) score += 1;
            if (analysis.required_fields.user_id_fields.some(f => !f.nullable)) score += 1;
            if (insights.field_patterns.session_fields.size > 0) score += 0.5;
            
            // Penalty for overly complex schemas
            if (analysis.schema_complexity.complex_fields.length > 5) score -= 1;
            if (analysis.schema_complexity.nested_depth > 3) score -= 0.5;
            
            score = Math.max(0, Math.min(10, score));
        } else if (analysis.table_category === 'USER') {
            score = 5; // Moderate score for user tables
            
            // Bonus for non-nullable user_id
            if (analysis.required_fields.user_id_fields.some(f => !f.nullable)) score += 1;
            
            // Penalty for complex schemas
            if (analysis.schema_complexity.complex_fields.length > 3) score -= 0.5;
        } else if (analysis.table_category === 'LOOKUP') {
            score = 3; // Lower score but still useful
        }

        analysis.mixpanel_compatibility = Math.round(score * 10) / 10;

        // Volume categorization
        if (analysis.row_count > 10000000) {
            analysis.data_quality.volume_category = 'LARGE';
        } else if (analysis.row_count > 100000) {
            analysis.data_quality.volume_category = 'MEDIUM';  
        } else if (analysis.row_count > 0) {
            analysis.data_quality.volume_category = 'SMALL';
        }

        // Calculate freshness (days since creation/update)
        if (table.creation_time) {
            const createdDate = new Date(table.creation_time);
            const now = new Date();
            analysis.data_quality.freshness = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        }

        // Categorize into insights
        switch (analysis.table_category) {
            case 'EVENT':
                insights.event_tables.push(analysis);
                break;
            case 'USER':
                insights.user_tables.push(analysis);
                break;
            case 'LOOKUP':
                insights.lookup_tables.push(analysis);
                break;
        }

        if (analysis.schema_complexity.complex_fields.length > 0) {
            insights.complex_fields.push(analysis);
        }

        if (analysis.data_quality.potential_pii.length > 0) {
            insights.pii_warnings.push(analysis);
        }

        // Add to global data_quality array (required by TypeScript definition and UI)
        insights.data_quality.push(analysis);
        
        } catch (error) {
            console.error(`Error processing table ${index} (${table.table_name}):`, error.message);
            console.error(`Error stack:`, error.stack);
            throw error;
        }
    });

    // Convert Sets to Arrays for JSON serialization
    insights.field_patterns.timestamp_fields = Array.from(insights.field_patterns.timestamp_fields || []);
    insights.field_patterns.user_id_fields = Array.from(insights.field_patterns.user_id_fields || []);
    insights.field_patterns.event_name_fields = Array.from(insights.field_patterns.event_name_fields || []);
    insights.field_patterns.session_fields = Array.from(insights.field_patterns.session_fields || []);
    insights.field_patterns.complex_fields = Array.from(insights.field_patterns.complex_fields || []);
    insights.field_patterns.pii_fields = Array.from(insights.field_patterns.pii_fields || []);

    return insights;
}

// Build lineage graph from table relationships
function buildLineageGraph(tables) {
    const lineageGraph = {
        nodes: [],
        edges: []
    };

    console.log(`${colors.yellow}Building table relationship graph...${colors.nc}`);

    // Add nodes for all tables and views
    tables.forEach(table => {
        lineageGraph.nodes.push({
            id: table.table_name,
            type: table.table_type.toLowerCase(),
            row_count: table.row_count || 0,
            size_bytes: table.size_bytes || 0,
            analytics_score: 0 // Will be populated by analytics analysis
        });
    });

    // Detect join keys (fields that appear in multiple tables)
    const fieldOccurrences = new Map();
    
    tables.forEach(table => {
        if (table.schema && table.schema.length) {
            table.schema.forEach(field => {
                const fieldName = field.column_name?.toLowerCase();
                if (fieldName && !EXCLUDE_AS_JOIN_KEYS.includes(fieldName)) {
                    if (!fieldOccurrences.has(fieldName)) {
                        fieldOccurrences.set(fieldName, []);
                    }
                    fieldOccurrences.get(fieldName).push(table.table_name);
                }
            });
        }
    });

    // Mark potential join keys
    const joinKeyRelationships = new Map();
    fieldOccurrences.forEach((tableList, fieldName) => {
        if (tableList.length > 1) {
            // This field appears in multiple tables - mark as potential join key
            tables.forEach(table => {
                if (table.schema && table.schema.length) {
                    table.schema.forEach(field => {
                        if (field.column_name && field.column_name.toLowerCase() === fieldName) {
                            field.is_potential_join_key = true;
                        }
                    });
                }
            });
            joinKeyRelationships.set(fieldName, tableList);
        }
    });

    // Extract view dependencies from view definitions
    tables.filter(t => t.table_type === 'VIEW' && t.view_definition).forEach(view => {
        const viewDef = view.view_definition.toLowerCase();
        
        // Find table references in the view definition
        tables.filter(t => t.table_type === 'TABLE').forEach(table => {
            const tableName = table.table_name.toLowerCase();
            // Look for table references (basic pattern matching)
            if (viewDef.includes(tableName) || viewDef.includes(`\`${tableName}\``)) {
                lineageGraph.edges.push({
                    source: table.table_name,
                    target: view.table_name,
                    type: "view_dependency",
                    label: "depends on"
                });
            }
        });
    });

    // Create edges between tables that share join keys
    joinKeyRelationships.forEach((tableList, joinKey) => {
        if (tableList.length > 1) {
            // Create relationships between all pairs of tables sharing this key
            for (let i = 0; i < tableList.length; i++) {
                for (let j = i + 1; j < tableList.length; j++) {
                    // Avoid duplicate edges with view dependencies
                    const hasViewDep = lineageGraph.edges.some(
                        edge =>
                            (edge.source === tableList[i] && edge.target === tableList[j]) || 
                            (edge.source === tableList[j] && edge.target === tableList[i])
                    );

                    if (!hasViewDep) {
                        lineageGraph.edges.push({
                            source: tableList[i],
                            target: tableList[j],
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
        `${colors.green}✓ Built relationship graph with ${lineageGraph.nodes.length} nodes and ${lineageGraph.edges.length} relationships.${colors.nc}`
    );

    return lineageGraph;
}

async function runAudit() {
    console.log(`\n${colors.cyan}=== Running Data Warehouse Audit Analysis ===${colors.nc}`);
    console.log("---------------------------------------------");
    console.log(`${colors.green}▸ Input File:${colors.nc}       ${config.inputFile}`);
    console.log(`${colors.green}▸ Output Directory:${colors.nc} ${config.outputDir}`);
    console.log("---------------------------------------------\n");

    try {
        // Read raw data
        console.log(`${colors.yellow}Reading raw dataset metadata...${colors.nc}`);
        const rawData = JSON.parse(await fs.readFile(config.inputFile, 'utf8'));
        
        console.log(`${colors.green}✓ Loaded raw data with ${rawData.tables.length} tables/views.${colors.nc}`);

        // Ensure output directory exists
        await fs.mkdir(path.join(config.outputDir, "reports"), { recursive: true });

        // Build lineage graph
        const lineageGraph = buildLineageGraph(rawData.tables);

        // Analytics compatibility analysis
        console.log(`\n${colors.yellow}Analyzing tables for analytics compatibility...${colors.nc}`);
        const analyticsInsights = analyzeAnalyticsCompatibility(rawData.tables);
        console.log(`${colors.green}✓ Analytics analysis complete: ${analyticsInsights.event_tables.length} EVENT tables found.${colors.nc}`);

        // Enhance table schemas with detected field types
        console.log(`${colors.yellow}Enhancing schemas with field type detection...${colors.nc}`);
        rawData.tables.forEach(table => {
            if (table.schema && table.schema.length > 0) {
                table.schema.forEach(field => {
                    const fieldPath = field.nested_field_path || field.column_name;
                    const fieldName = fieldPath.toLowerCase();
                    const fieldType = field.nested_type || field.data_type || '';
                    field.detected_field_types = detectFieldType(fieldName, fieldType);
                });
            }
        });
        console.log(`${colors.green}✓ Field type detection complete.${colors.nc}`);

        // Update lineage graph nodes with analytics scores
        lineageGraph.nodes.forEach(node => {
            // Find the table analysis from any of the categorized arrays
            const allAnalyses = [
                ...analyticsInsights.event_tables,
                ...analyticsInsights.user_tables, 
                ...analyticsInsights.lookup_tables
            ];
            const tableAnalysis = allAnalyses.find(
                analysis => analysis.table_name === node.id
            );
            if (tableAnalysis) {
                node.analytics_score = tableAnalysis.mixpanel_compatibility;
            }
        });

        // Calculate summary statistics
        const tables = rawData.tables.filter(t => t.table_type === 'TABLE');
        const views = rawData.tables.filter(t => t.table_type === 'VIEW');
        
        const summary = {
            total_tables: tables.length,
            total_views: views.length,
            total_objects: rawData.tables.length,
            failed_objects: rawData.tables.filter(t => t.has_permission_error).length,
            total_rows_accessible: rawData.tables
                .filter(t => !t.has_permission_error && typeof t.row_count === 'number')
                .reduce((sum, t) => sum + t.row_count, 0)
        };

        // Build final audit result
        const auditResult = {
            audit_metadata: {
                generated_at: new Date().toISOString(),
                analysis_version: "1.0.0",
                source_file: config.inputFile,
                project_id: rawData.extraction_metadata?.project_id,
                dataset_id: rawData.extraction_metadata?.dataset_id,
                ...rawData.audit_metadata // Include original metadata
            },
            tables: rawData.tables, // Include all raw table data
            lineage: lineageGraph,
            analytics: analyticsInsights,
            summary: summary
        };

        // Write audit results
        const outputFile = path.join(config.outputDir, "reports", "dataset_audit.json");
        await fs.writeFile(outputFile, JSON.stringify(auditResult, null, 2));

        // Write summary CSV
        
        const auditSummaryCsv = [
            "metric,value",
            `total_tables,${summary.total_tables}`,
            `total_views,${summary.total_views}`,
            `total_objects,${summary.total_objects}`,
            `failed_objects,${summary.failed_objects}`,
            `total_rows_accessible,${summary.total_rows_accessible}`,
            `mixpanel_ready_tables,${analyticsInsights.event_tables?.length || 0}`,
            `event_tables,${analyticsInsights.event_tables?.length || 0}`,
            `user_tables,${analyticsInsights.user_tables?.length || 0}`
        ].join("\n");
        
        await fs.writeFile(
            path.join(config.outputDir, "reports", "audit_summary.csv"), 
            auditSummaryCsv + "\n"
        );

        console.log(`\n${colors.green}✔ Audit analysis complete!${colors.nc}`);
        console.log("==========================================");
        console.log(`${colors.green}▸ Processed:${colors.nc}        ${rawData.tables.length} tables/views`);
        console.log(`${colors.green}▸ Event Tables:${colors.nc}     ${analyticsInsights.event_tables.length} tables`);
        console.log(`${colors.green}▸ Join Keys Found:${colors.nc}  ${lineageGraph.edges.filter(e => e.type === 'join_key').length} relationships`);
        console.log(`${colors.green}▸ View Dependencies:${colors.nc} ${lineageGraph.edges.filter(e => e.type === 'view_dependency').length} relationships`);
        console.log("==========================================");
        console.log(`Audit results: ${colors.cyan}${outputFile}${colors.nc}`);
        
    } catch (error) {
        console.error(`\n${colors.red}Error during audit analysis:${colors.nc}`);
        console.error(error.message);
        process.exit(1);
    }
}

// Run the audit if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runAudit().catch(console.error);
}

export { runAudit, analyzeAnalyticsCompatibility, buildLineageGraph };