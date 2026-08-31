import { describe, expect, it } from 'vitest';
import { isPseudoTable, mentionsTable } from '../src/warehouse/bigquery/usage.ts';

describe('mentionsTable', () => {
	it('finds a view referenced with its dataset prefix', () => {
		expect(
			mentionsTable('SELECT * FROM `p.sales_intelligence.deal_reviews_won`', 'deal_reviews_won'),
		).toBe(true);
	});

	it('finds a bare reference', () => {
		expect(mentionsTable('select x from deal_reviews_won where y=1', 'deal_reviews_won')).toBe(true);
	});

	it('does not match a longer name that contains it', () => {
		// `deal_reviews` must not be credited for a query against
		// `deal_reviews_won`, or every base table inherits its views' traffic.
		expect(mentionsTable('SELECT * FROM deal_reviews_won', 'deal_reviews')).toBe(false);
	});

	it('does not match a prefix', () => {
		expect(mentionsTable('SELECT * FROM my_deal_reviews', 'deal_reviews')).toBe(false);
	});

	it('handles regex characters in a table name', () => {
		expect(mentionsTable('FROM `a.b.odd.name`', 'odd.name')).toBe(true);
	});

	it('is false for empty input', () => {
		expect(mentionsTable(null, 'x')).toBe(false);
		expect(mentionsTable('SELECT 1', '')).toBe(false);
	});
});

describe('isPseudoTable', () => {
	it('rejects the INFORMATION_SCHEMA views', () => {
		// These are listed in referenced_tables but are not dataset contents.
		expect(isPseudoTable('INFORMATION_SCHEMA.COLUMNS')).toBe(true);
		expect(isPseudoTable('INFORMATION_SCHEMA.JOBS_BY_PROJECT')).toBe(true);
	});

	it('rejects the double-underscore pseudo-tables', () => {
		// Counting these made a real 37-table dataset report 39 read.
		expect(isPseudoTable('__TABLES__')).toBe(true);
		expect(isPseudoTable('__TABLES_SUMMARY__')).toBe(true);
		expect(isPseudoTable('__PARTITIONS_SUMMARY__')).toBe(true);
	});

	it('keeps a real table whose name merely starts with an underscore', () => {
		expect(isPseudoTable('_staging_accounts')).toBe(false);
		expect(isPseudoTable('dim_accounts')).toBe(false);
	});
});
