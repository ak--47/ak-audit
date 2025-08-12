/**
 * TypeScript definitions for DWH Audit Tool
 *
 * This file defines the interfaces and types used throughout the data warehouse audit tool.
 * It serves as both documentation and a contract for implementing support for new warehouses.
 */

type DataWarehouse = "bigquery" | "snowflake" | "redshift" | "databricks";

// ============================================================================
// CLI and Configuration Types
// ============================================================================

export interface AuditOptions {
    /** Data warehouse type (currently only 'bigquery' supported) */
    dwh: DataWarehouse;

    /** Project ID (e.g., BigQuery project ID) */
    project?: string;

    /** Dataset ID to audit */
    dataset?: string;

    /** Warehouse region/location */
    location?: string;

    /** Number of sample rows to extract per table */
    samples: number;

    /** Output directory for audit results */
    output: string;

    /** Optional table filter (comma-separated list, supports glob patterns) */
    filter?: string;

    /** Optional path to credentials file */
    credentials?: string;
}

// ============================================================================
// Raw Dataset Schema - Output from bigquery.js, input to audit.js
// ============================================================================

/**
 * Schema field definition
 * This is the core interface that all warehouses must implement
 */
export interface SchemaField {
    /** Column name */
    column_name: string;

    /** Position in table schema (1-indexed) */
    ordinal_position: number;

    /** Whether field accepts NULL values ('YES' | 'NO') */
    is_nullable: "YES" | "NO";

    /** Base data type (e.g., 'STRING', 'INTEGER', 'TIMESTAMP') */
    data_type: string;

    /** Whether this field is used for partitioning */
    is_partitioning_column: boolean;

    /** Position in clustering key (null if not clustered) */
    clustering_ordinal_position: number | null;

    /** Full field path for nested fields (e.g., 'user.profile.name') */
    nested_field_path: string;

    /** Complete type including nested structures (e.g., 'ARRAY<STRUCT<name STRING>>') */
    nested_type: string;

    /** Whether this field appears in multiple tables (populated by audit.js) */
    is_potential_join_key?: boolean;
}

/**
 * Table metadata extracted from data warehouse
 * This is the core interface that all warehouses must implement
 */
export interface TableMetadata {
    /** Table name */
    table_name: string;

    /** Table type */
    table_type: "TABLE" | "VIEW";

    /** ISO timestamp of when table was created */
    creation_time: string | null;

    /** Whether extraction encountered permission errors */
    has_permission_error: boolean;

    /** Array of error messages encountered during extraction */
    error_details: string[];

    /** Complete schema definition */
    schema: SchemaField[];

    /** Number of rows in table */
    row_count: number;

    /** Size in bytes */
    size_bytes: number;

    /** Sample data rows */
    sample_data: Record<string, any>[];

    /** View definition/SQL (only for views) */
    view_definition: string | null;

    /** Partitioning information (warehouse-specific) */
    partitioning_info: any;

    /** Clustering information (warehouse-specific) */
    clustering_info: any;
}

/**
 * Raw dataset output format - what bigquery.js produces
 * This is the contract for all warehouse extractors
 */
export interface RawDataset {
    /** Metadata about the extraction process */
    extraction_metadata: {
        /** ISO timestamp of extraction */
        generated_at: string;

        /** Project/workspace ID */
        project_id: string;

        /** Dataset/database ID */
        dataset_id: string;

        /** Warehouse region */
        region: string;

        /** Permission mode detected during extraction */
        permission_mode: "jobUser" | "dataViewer" | string;

        /** Number of sample rows requested */
        sample_limit: number;

        /** Table filter applied (null if none) */
        table_filter: string[] | null;

        /** Additional warehouse-specific metadata */
        [key: string]: any;
    };

    /** Array of all tables and views extracted */
    tables: TableMetadata[];

    /** Summary statistics */
    summary: {
        /** Number of tables found */
        total_tables: number;

        /** Number of views found */
        total_views: number;

        /** Total number of objects (tables + views) */
        total_objects: number;

        /** Number of objects that failed extraction */
        failed_objects: number;

        /** Total accessible row count across all tables */
        total_rows_accessible: number;
    };
}

// ============================================================================
// Analysis Results Schema - Output from audit.js
// ============================================================================

/**
 * Analytics features detected in a table
 */
export interface AnalyticsFeatures {
    /** Has timestamp/datetime field */
    has_timestamp: boolean;

    /** Has user identifier field */
    has_user_id: boolean;

    /** Has event identifier field */
    has_event_id: boolean;

    /** Has session identifier field */
    has_session_id: boolean;

    /** Has event name/type field */
    has_event_name: boolean;

    /** Whether timestamp field is nullable */
    timestamp_nullable: boolean;

    /** Whether user ID field is nullable */
    user_id_nullable: boolean;

    /** Whether event ID field is nullable */
    event_id_nullable: boolean;
}

/**
 * Data quality metrics for a table
 */
export interface DataQualityMetrics {
    /** Estimated null rate across fields */
    null_rate_estimate: number;

    /** Fields that appear to be unique identifiers */
    unique_fields: string[];

    /** Fields that may contain PII */
    potential_pii: string[];
}

/**
 * Schema complexity metrics
 */
export interface SchemaComplexity {
    /** Total number of fields */
    total_fields: number;

    /** Number of nested fields */
    nested_fields: number;

    /** Number of STRUCT fields */
    struct_fields: number;

    /** Number of REPEATED/ARRAY fields */
    repeated_fields: number;

    /** Maximum nesting depth */
    max_nesting_depth: number;
}

/**
 * Per-table analytics analysis result
 */
export interface TableAnalysis {
    /** Table name */
    table_name: string;

    /** Table type */
    table_type: "TABLE" | "VIEW";

    /** Table category based on analytics patterns */
    table_category: "EVENT" | "USER" | "LOOKUP" | "UNKNOWN";

    /** Mixpanel compatibility score (0-10) */
    mixpanel_compatibility: number;

    /** Number of rows in the table */
    row_count: number;

    /** Size in bytes */
    size_bytes: number;

    /** Creation timestamp */
    creation_time: string;

    /** Required fields analysis for different patterns */
    required_fields: {
        /** Whether table has timestamp fields */
        has_timestamp: boolean;

        /** Whether table has user identifier fields */
        has_user_id: boolean;

        /** Detected timestamp fields */
        timestamp_fields: Array<{
            name: string;
            type: string;
            nullable: boolean;
            by_type: boolean;
            by_name: boolean;
        }>;

        /** Detected user ID fields */
        user_id_fields: Array<{
            name: string;
            type: string;
            nullable: boolean;
        }>;
    };

    /** Event schema type classification */
    event_schema_type: "MULTI_SCHEMA" | "MONO_SCHEMA" | null;

    /** Schema complexity metrics */
    schema_complexity: {
        /** Total number of fields */
        total_fields: number;

        /** Complex fields (STRUCT, RECORD, JSON, REPEATED) */
        complex_fields: string[];

        /** Maximum nesting depth */
        nested_depth: number;

        /** Total number of subfields */
        total_subfields: number;
    };

    /** Data quality assessment */
    data_quality: {
        /** Fields that may contain PII */
        potential_pii: Array<{
            field: string;
            types: string[];
        }>;

        /** Volume category based on row count */
        volume_category: "SMALL" | "MEDIUM" | "LARGE" | "UNKNOWN";

        /** Days since table creation/update */
        freshness: number | null;
    };

    /** Detailed field information */
    field_details: Record<string, {
        type: string;
        nullable: boolean;
        join_key: boolean;
    }>;
}

/**
 * Overall analytics insights across dataset
 */
export interface AnalyticsInsights {
    /** Tables with event-like patterns (timestamp + user_id) */
    event_tables: TableAnalysis[];

    /** Tables with user identifiers but no timestamp */
    user_tables: TableAnalysis[];

    /** Tables with arbitrary join keys */
    lookup_tables: TableAnalysis[];

    /** Tables with complex nested structures */
    complex_fields: TableAnalysis[];

    /** Tables with potential PII fields */
    pii_warnings: TableAnalysis[];

    /** All table analyses (required by UI) */
    data_quality: TableAnalysis[];

    /** Field patterns found across dataset */
    field_patterns: {
        /** Timestamp field names found */
        timestamp_fields: string[];

        /** User ID field names found */
        user_id_fields: string[];

        /** Event name field names found */
        event_name_fields: string[];

        /** Session field names found */
        session_fields: string[];

        /** Complex field names found */
        complex_fields: string[];

        /** PII field names found */
        pii_fields: string[];
    };
}

/**
 * Table relationship node
 */
export interface LineageNode {
    /** Table/view name */
    id: string;

    /** Node type */
    type: "table" | "view";

    /** Number of rows */
    row_count: number;

    /** Analytics readiness score */
    analytics_score: number;
}

/**
 * Table relationship edge
 */
export interface LineageEdge {
    /** Source table/view */
    source: string;

    /** Target table/view */
    target: string;

    /** Relationship type */
    type: "view_dependency" | "join_key";

    /** Relationship label/description */
    label: string;

    /** Whether relationship is bidirectional */
    bidirectional?: boolean;
}

/**
 * Table relationship graph
 */
export interface LineageGraph {
    /** All tables and views as nodes */
    nodes: LineageNode[];

    /** All relationships as edges */
    edges: LineageEdge[];
}

/**
 * Final audit result - what audit.js produces
 */
export interface AuditResult {
    /** Analysis metadata */
    audit_metadata: {
        /** ISO timestamp of analysis */
        generated_at: string;

        /** Analysis engine version */
        analysis_version: string;

        /** Path to source raw dataset file */
        source_file: string;

        /** Original extraction metadata passed through */
        [key: string]: any;
    };

    /** All original table metadata */
    tables: TableMetadata[];

    /** Table relationship graph */
    lineage: LineageGraph;

    /** Analytics insights */
    analytics: AnalyticsInsights;

    /** Summary statistics */
    summary: {
        /** Number of tables */
        total_tables: number;

        /** Number of views */
        total_views: number;

        /** Total objects */
        total_objects: number;

        /** Failed objects */
        failed_objects: number;

        /** Total accessible rows */
        total_rows_accessible: number;
    };
}

// ============================================================================
// Warehouse Adapter Interface
// ============================================================================

/**
 * Interface that all warehouse adapters must implement
 * This enables adding support for Snowflake, Databricks, etc.
 */
export interface WarehouseAdapter {
    /** Warehouse type identifier */
    readonly warehouseType: string;

    /**
     * Extract raw dataset metadata
     * @param options Configuration options
     * @returns Promise that resolves to raw dataset
     */
    extractRawData(options: AuditOptions): Promise<RawDataset>;

    /**
     * Validate connection and permissions
     * @param options Configuration options
     * @returns Promise that resolves to permission mode string
     */
    testConnection(options: AuditOptions): Promise<string>;
}

// ============================================================================
// Export main functions
// ============================================================================

/**
 * Run data extraction step
 */
export function runDataExtraction(): Promise<void>;

/**
 * Run analytics analysis step
 */
export function runAudit(inputFile?: string, outputDir?: string): Promise<void>;

/**
 * Analyze analytics compatibility
 */
export function analyzeAnalyticsCompatibility(tables: TableMetadata[]): AnalyticsInsights;

/**
 * Build table lineage graph
 */
export function buildLineageGraph(tables: TableMetadata[]): LineageGraph;

/**
 * Generate HTML report
 */
export function generateHtmlReport(auditResult: AuditResult): string;

/**
 * Rebuild HTML report from existing audit data
 */
export function rebuildHtmlReport(): Promise<void>;
