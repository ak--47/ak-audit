/**
 * Output folder layout and file writing.
 *
 * The folder serves two readers at once. JSON carries exact values for an
 * agent; Markdown carries cheap narrative context so an agent can orient
 * without parsing everything. `catalog.md` exists so that reader can find
 * the right table without opening 500 files.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface OutputLayout {
	root: string;
	raw: string;
	profile: string;
	analysis: string;
	analysisTables: string;
	report: string;
}

export function layout(root: string): OutputLayout {
	return {
		root,
		raw: join(root, 'raw'),
		profile: join(root, 'profile'),
		analysis: join(root, 'analysis'),
		analysisTables: join(root, 'analysis', 'tables'),
		report: join(root, 'report'),
	};
}

export async function ensureLayout(root: string): Promise<OutputLayout> {
	const dirs = layout(root);
	for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });
	return dirs;
}

/**
 * Makes a table name safe for a filename without losing identity.
 *
 * BigQuery table names are already restricted, but casing differences alone
 * would collide on case-insensitive filesystems, so distinct names must map
 * to distinct files.
 */
export function safeFileName(name: string): string {
	const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_');
	const hasUpper = /[A-Z]/.test(name);
	return hasUpper ? `${cleaned}-${shortHash(name)}` : cleaned;
}

function shortHash(input: string): string {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).slice(0, 6);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(value, jsonReplacer, 2) + '\n', 'utf8');
}

export async function writeText(path: string, text: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, text.endsWith('\n') ? text : text + '\n', 'utf8');
}

export async function readJson<T>(path: string): Promise<T | null> {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch {
		return null;
	}
}

export function fileExists(path: string): boolean {
	return existsSync(path);
}

/**
 * BigQuery returns BigInt for INT64 and single-key wrapper objects for dates
 * and timestamps, neither of which survive JSON.stringify. Rendering them as
 * strings keeps full precision, which Number would silently lose past 2^53.
 *
 * The single-key test is essential. Unwrapping anything that merely has a
 * `value` key also flattens legitimate shapes: it silently reduced every
 * `{value, count}` top-value pair to a bare string, discarding the counts.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString();
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const keys = Object.keys(value);
		if (keys.length === 1 && keys[0] === 'value') {
			const inner = (value as { value: unknown }).value;
			if (typeof inner === 'string' || typeof inner === 'number') return inner;
		}
	}
	return value;
}

/** Normalizes a BigQuery cell into something JSON and Markdown can hold. */
export function plainValue(value: unknown): unknown {
	if (value === null || value === undefined) return null;
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) return value.map(plainValue);
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if ('value' in obj && Object.keys(obj).length === 1) return plainValue(obj.value);
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) out[k] = plainValue(v);
		return out;
	}
	return value;
}
