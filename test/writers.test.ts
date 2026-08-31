import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plainValue, safeFileName, writeJson } from '../src/output/writers.ts';

async function roundTrip(value: unknown): Promise<unknown> {
	const dir = await mkdtemp(join(tmpdir(), 'ak-audit-'));
	const path = join(dir, 'v.json');
	await writeJson(path, value);
	return JSON.parse(await readFile(path, 'utf8'));
}

describe('writeJson', () => {
	it('unwraps a BigQuery single-key wrapper into its scalar', () => {
		return expect(roundTrip({ ts: { value: '2024-06-01T00:00:00Z' } })).resolves.toEqual({
			ts: '2024-06-01T00:00:00Z',
		});
	});

	it('keeps {value, count} pairs intact', async () => {
		// Unwrapping anything with a `value` key silently reduced every top
		// value to a bare string and threw away its count, which reached the
		// report as empty objects.
		await expect(
			roundTrip({ topValues: [{ value: 'page view', count: 1781 }] }),
		).resolves.toEqual({ topValues: [{ value: 'page view', count: 1781 }] });
	});

	it('renders BigInt as a string so precision past 2^53 survives', async () => {
		await expect(roundTrip({ n: 1008601755644n })).resolves.toEqual({ n: '1008601755644' });
	});

	it('leaves a null value alone', async () => {
		await expect(roundTrip({ topValues: [{ value: null, count: 3 }] })).resolves.toEqual({
			topValues: [{ value: null, count: 3 }],
		});
	});
});

describe('plainValue', () => {
	it('unwraps nested single-key wrappers', () => {
		expect(plainValue({ a: { value: 5 }, b: [{ value: 'x' }] })).toEqual({ a: 5, b: ['x'] });
	});

	it('preserves multi-key objects', () => {
		expect(plainValue({ value: 'v', count: 2 })).toEqual({ value: 'v', count: 2 });
	});
});

describe('safeFileName', () => {
	it('leaves a lowercase name unchanged', () => {
		expect(safeFileName('ad_spend')).toBe('ad_spend');
	});

	it('disambiguates names that differ only by case', () => {
		// A case-insensitive filesystem would otherwise collide these.
		expect(safeFileName('complexTypes')).not.toBe(safeFileName('complextypes'));
	});

	it('strips path separators', () => {
		expect(safeFileName('a/b')).not.toContain('/');
	});
});
