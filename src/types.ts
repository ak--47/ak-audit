/**
 * Core data contracts for ak-audit.
 *
 * These types are the interface between pipeline stages. Stages 3 and 4
 * (analyze, report) only ever see these shapes, never BigQuery specifics,
 * which is what keeps them warehouse-agnostic.
 */

export type TableKind =
	| 'TABLE'
	| 'VIEW'
	| 'MATERIALIZED_VIEW'
	| 'EXTERNAL'
	| 'SNAPSHOT'
	| 'UNKNOWN';

export type FieldMode = 'NULLABLE' | 'REQUIRED' | 'REPEATED';

/**
 * One column, or one leaf inside a nested STRUCT.
 *
 * `path` is the full dotted path ("campaigns.utm_source") and is the
 * identity of a field everywhere in the pipeline. `name` is just the leaf.
 */
export interface SchemaField {
	path: string;
	name: string;
	/** Full declared type, e.g. `ARRAY<STRUCT<a STRING>>`. */
	dataType: string;
	/** Normalized scalar type used to pick aggregates, e.g. `STRING`. */
	baseType: string;
	mode: FieldMode;
	/** True when this field lives inside a STRUCT. */
	isNested: boolean;
	/** True when the field is a STRUCT/ARRAY container rather than a leaf. */
	isContainer: boolean;
	isPartitioningColumn: boolean;
	clusteringPosition: number | null;
	description?: string;
}

export interface PartitionInfo {
	partitionId: string;
	rows: number;
	lastModified: string | null;
}

export interface PartitioningConfig {
	/** Column the table is partitioned on, or `_PARTITIONTIME` for ingestion time. */
	field: string;
	/** DAY | HOUR | MONTH | YEAR | RANGE */
	granularity: string;
	kind: 'time' | 'ingestion-time' | 'range';
}

/**
 * Where a row count came from.
 *
 * This is recorded because not all row counts are equally trustworthy, and
 * the difference is invisible once the number is written down. The
 * `__TABLES__`-style metadata views report 0 rows for every view, which
 * makes live views look dead. Anything reading this output needs to know
 * whether a count was measured or merely reported.
 */
export type RowCountSource =
	/** Exact, from the table's own metadata. Free. Base tables only. */
	| 'table-metadata'
	/** Exact, summed from per-partition counts. Free. */
	| 'partitions'
	/** Exact, from a real COUNT(*). Costs a scan on views. */
	| 'count-query'
	/** From region-level storage metadata. Absent for views. */
	| 'storage-metadata'
	/** No count could be obtained. */
	| 'unavailable';

/** Stage 1 output: one file per table under `raw/`. */
export interface TableMeta {
	project: string;
	dataset: string;
	table: string;
	/** `project.dataset.table` */
	fullName: string;
	kind: TableKind;
	rowCount: number | null;
	/** How `rowCount` was obtained, so a reader can judge it. */
	rowCountSource: RowCountSource;
	bytes: number | null;
	/**
	 * True when the table rejects any query lacking a partition filter.
	 *
	 * Measured on a 47 TB ingestion-time-partitioned table: without a filter
	 * BigQuery refuses the query outright rather than merely charging for
	 * it, so this must gate profiling, sampling, and counting alike.
	 */
	requirePartitionFilter: boolean;
	created: string | null;
	lastModified: string | null;
	partitioning: PartitioningConfig | null;
	clustering: string[];
	partitions: PartitionInfo[];
	ddl: string | null;
	/** Hand-written table description, the richest free context available. */
	description: string | null;
	/**
	 * Table labels, e.g. owner or domain tags.
	 *
	 * Optional because a raw file written before this field existed does not
	 * carry it. Every stage reads its input from disk, so the types describe
	 * what a file may contain, not what the current writer happens to emit.
	 */
	labels?: Record<string, string>;
	schema: SchemaField[];
	/** Exact upstream tables, from dry-run `referencedTables`. Views only. */
	references: string[];
	samples: Record<string, unknown>[];
	sampleSource: 'rest' | 'query' | 'none';
	/** Non-fatal problems. A table with errors is still emitted. */
	errors: string[];
}

export interface TopValue {
	value: string | null;
	count: number;
}

export interface ArrayStats {
	totalElements: number;
	maxLength: number;
	avgLength: number;
}

/** Per-column statistics gathered in the profile scan. */
export interface ColumnStats {
	path: string;
	nullCount: number | null;
	nullRate: number | null;
	/** Approximate distinct values (`APPROX_COUNT_DISTINCT`). */
	ndv: number | null;
	min: string | null;
	max: string | null;
	topValues: TopValue[];
	arrayStats: ArrayStats | null;
	/** Base64 HLL++ sketch, present only for join-key candidates. */
	sketch: string | null;
	/** Set when this column was deliberately not profiled. */
	skipped: string | null;
}

/** How a table's profile scan was limited to control cost. */
export type ScanStrategy = 'full' | 'partitions' | 'sample';

/** Stage 2 output: one file per table under `profile/`. */
export interface TableProfile {
	table: string;
	/** Absent when the table was skipped entirely. */
	strategy: ScanStrategy | null;
	/** Human-readable account of the limit applied, shown in the report. */
	strategyDetail: string;
	/** Bytes BigQuery reported for the queries actually run. Zero if skipped. */
	bytesProcessed: number;
	estimatedCostUsd: number;
	/**
	 * What the profile would have scanned, had it run.
	 *
	 * Kept apart from `bytesProcessed` so a skipped table never contributes
	 * to the run's reported spend. Reporting an estimate as though it were
	 * money spent overstates the cost of a run that deliberately declined it.
	 */
	estimatedBytesIfRun: number;
	rowsScanned: number | null;
	chunks: number;
	columns: Record<string, ColumnStats>;
	/** Reason the table was skipped, e.g. over budget. Null when profiled. */
	skipped: string | null;
	errors: string[];
}

export interface EdgeEndpoint {
	table: string;
	column: string;
	ndv: number;
}

export type EdgeKind =
	/** One side's values are almost entirely contained in the other's. */
	| 'foreign-key'
	/** Both sides hold effectively the same set. */
	| 'duplicate'
	/** Meaningful but partial overlap. */
	| 'overlap';

/**
 * A candidate join between two columns, always carrying its evidence.
 *
 * Cardinalities come from HLL sketches, so every number here is an
 * estimate. The report must never present an edge as certain.
 */
export interface JoinEdge {
	from: EdgeEndpoint;
	to: EdgeEndpoint;
	/** Estimated |A n B| via inclusion-exclusion over merged sketches. */
	intersection: number;
	/** intersection / min(ndv) — the foreign-key signal. */
	containment: number;
	/** intersection / |A u B| — overall similarity. */
	jaccard: number;
	kind: EdgeKind;
	/** True when both columns live in the same table. */
	sameTable: boolean;
	/** Why the pair was considered: name match, type match, or both. */
	reason: string;
}

/** A lineage edge from a view to a table it reads. */
export interface LineageEdge {
	from: string;
	to: string;
}

export type ColumnRole =
	| 'identifier'
	| 'timestamp'
	| 'measure'
	| 'categorical'
	| 'flag'
	| 'text'
	| 'structural'
	| 'unknown';

export type FindingSeverity = 'info' | 'warn';

export interface Finding {
	kind: string;
	severity: FindingSeverity;
	table: string;
	column: string | null;
	message: string;
}

export interface TableAnalysis {
	table: string;
	kind: TableKind;
	rowCount: number | null;
	bytes: number | null;
	columnCount: number;
	roles: Record<string, ColumnRole>;
	/** Columns ranked as the most useful entry points for querying. */
	keyColumns: string[];
	timeColumns: string[];
	relatedTables: string[];
	findings: Finding[];
}

/** Stage 3 output. */
export interface AnalysisResult {
	dataset: string;
	generatedAt: string;
	tables: TableAnalysis[];
	joins: JoinEdge[];
	lineage: LineageEdge[];
	findings: Finding[];
}

/** Per-run accounting, written to `manifest.json`. */
export interface RunManifest {
	tool: string;
	version: string;
	generatedAt: string;
	project: string;
	dataset: string;
	location: string;
	options: Record<string, unknown>;
	tablesDiscovered: number;
	tablesExtracted: number;
	tablesProfiled: number;
	tablesSkipped: { table: string; reason: string }[];
	/** What the skipped tables would have scanned. Not spent. */
	bytesDeclined: number;
	bytesProcessed: number;
	estimatedCostUsd: number;
	stages: Record<string, { ranAt: string; durationMs: number }>;
}
