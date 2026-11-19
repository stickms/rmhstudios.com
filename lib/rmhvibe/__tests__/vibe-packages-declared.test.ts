/**
 * Every package vibes can import is bundled from node_modules at image build
 * time (scripts/build-vibe-packages.ts), so each one must be a declared
 * dependency. The registry names them only as strings, which dead-code tools
 * cannot see: d3, gsap and konva were once removed as "unused" and the image
 * build (and so the deploy) failed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostedPackages, inlinePackages } from '@/lib/rmhvibe/vibe-packages';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);

describe('vibe packages', () => {
  it.each([...hostedPackages().map((p) => p.name), ...inlinePackages()])('%s is a declared dependency', (name) => {
    expect(declared.has(name), `${name} is in VIBE_PACKAGES but not in package.json`).toBe(true);
  });
});
