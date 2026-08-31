import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOL_VERSION } from '../src/pipeline.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('package manifest', () => {
	it('agrees with the version the tool writes into every manifest.json', () => {
		// Two places hold the version: package.json for npm, TOOL_VERSION for
		// the run manifest. A reader who checks which version produced an
		// output folder must get the same answer as `ak-audit --version`.
		expect(pkg.version).toBe(TOOL_VERSION);
	});

	it('points its bin at the compiled entry point, not the TypeScript source', () => {
		// `npx ak-audit` runs this path with plain node. A `.ts` here would
		// publish a package that cannot start.
		expect(pkg.bin['ak-audit']).toBe('dist/cli.js');
	});

	it('ships only the build, the readme and the licence', () => {
		expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE']);
	});

	it('is not marked private', () => {
		expect(pkg.private).toBeUndefined();
	});

	it('publishes a scoped package publicly', () => {
		// npm refuses the bare name `ak-audit` as too close to `akaudit`, so
		// the package is scoped. A scoped package defaults to restricted
		// access, and `npm publish` fails on a free account without this.
		expect(pkg.name).toBe('@ak--47/ak-audit');
		expect(pkg.publishConfig?.access).toBe('public');
	});

	it('keeps the command itself unscoped', () => {
		// The scope is an install detail. What a person types stays `ak-audit`,
		// which is also what --version, the docs and TOOL_VERSION describe.
		expect(Object.keys(pkg.bin)).toEqual(['ak-audit']);
	});
});
