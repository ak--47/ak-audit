/**
 * Shared value formatting.
 */

/**
 * Formats a rate without letting rounding lie.
 *
 * A column that is 99.96% null must not read as "100%" beside a distinct
 * count of 6, and a column with a single null row must not read as "0%".
 * Only an exact 0 or 1 gets the absolute label.
 */
export function formatRate(rate: number | null | undefined): string {
	if (rate === null || rate === undefined) return '—';
	if (rate <= 0) return '0%';
	if (rate >= 1) return '100%';
	return `${Math.min(99, Math.max(1, Math.round(rate * 100)))}%`;
}
