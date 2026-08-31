import { describe, expect, it } from 'vitest';
import { mentionsTable } from '../src/warehouse/bigquery/usage.ts';

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
