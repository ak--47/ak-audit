/**
 * The warehouse adapter seam.
 *
 * Only BigQuery is implemented. This interface exists so a second warehouse
 * can be added without touching analysis or reporting: stages 3 and 4 read
 * `TableMeta` and `TableProfile` and never see warehouse specifics.
 *
 * The contract is deliberately shaped around what made the BigQuery adapter
 * safe rather than around what is easy to implement. Two obligations are
 * not optional:
 *
 *  - `estimateProfileCost` must be able to price work before running it.
 *    Any warehouse billed by bytes scanned needs this, and without it the
 *    budget guard has nothing to act on.
 *  - `profileTable` must return a whole profile or none. A partially filled
 *    profile is indistinguishable from a complete one downstream.
 *
 * An adapter for a warehouse with no per-query cost can report zero from
 * `estimateProfileCost`; the budget then never refuses anything, which is
 * the correct behaviour there.
 */

import type { TableMeta, TableProfile } from '../types.ts';

export interface AdapterOptions {
	project: string;
	dataset: string;
	location?: string;
	/** Credentials file. Omit to use the platform's ambient credentials. */
	authFile?: string;
}

export interface ExtractOptions {
	sampleRows: number;
	tableFilter?: (name: string) => boolean;
	concurrency: number;
}

export interface ProfileTableOptions {
	/** Columns to sketch for join detection. */
	sketchPaths: Set<string>;
	/** Most recent partitions to read, where the warehouse supports pruning. */
	partitionLookback: number;
	/** Read the whole table rather than pruning or sampling. */
	full: boolean;
}

export interface WarehouseAdapter {
	readonly warehouseType: string;

	/** Verifies credentials and returns a human-readable description of them. */
	testConnection(): Promise<string>;

	/**
	 * Reads metadata for every selected table.
	 *
	 * Must be cheap. Callers treat extraction as effectively free and run it
	 * by default, including against datasets they know nothing about.
	 */
	extract(options: ExtractOptions): Promise<TableMeta[]>;

	/**
	 * Estimates the bytes a table's profile would scan, without running it.
	 * Return 0 where the warehouse does not bill by scan volume.
	 */
	estimateProfileCost(table: TableMeta, options: ProfileTableOptions): Promise<number>;

	/** Profiles one table, completely or not at all. */
	profileTable(table: TableMeta, options: ProfileTableOptions): Promise<TableProfile>;

	/** Bytes billed across every query this adapter has issued. */
	readonly bytesProcessed: number;
}
