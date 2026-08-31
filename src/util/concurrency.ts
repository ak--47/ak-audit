/**
 * Bounded-parallelism map.
 *
 * Tables are processed concurrently because a large dataset otherwise takes
 * far longer than it needs to, but the bound matters: unbounded fan-out
 * against BigQuery trips per-project concurrent-query limits and turns a
 * slow run into a failed one.
 *
 * Results keep input order regardless of completion order.
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const width = Math.max(1, Math.min(limit, items.length));
	const results = new Array<R>(items.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (true) {
			const index = next++;
			if (index >= items.length) return;
			results[index] = await fn(items[index]!, index);
		}
	}

	await Promise.all(Array.from({ length: width }, worker));
	return results;
}

/** Runs tasks with bounded parallelism, keeping failures out of the results. */
export async function settleWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<{ value: R | null; error: unknown; item: T }[]> {
	return mapWithConcurrency(items, limit, async (item, index) => {
		try {
			return { value: await fn(item, index), error: null, item };
		} catch (error) {
			return { value: null, error, item };
		}
	});
}
