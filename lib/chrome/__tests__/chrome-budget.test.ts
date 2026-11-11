// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { globSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

describe('chrome renderer budgets (Steel V4, V13)', () => {
  it('the module is under 6 kB gzip', async () => {
    const out = await build({
      entryPoints: ['lib/chrome/index.ts'],
      bundle: true,
      minify: true,
      format: 'esm',
      write: false,
      logLevel: 'silent',
    });
    const bytes = gzipSync(out.outputFiles[0].contents, { level: 9 }).length;
    expect(bytes, `lib/chrome is ${bytes} B gzip`).toBeLessThan(6 * 1024);
  });

  it('nothing imports the renderer statically: it loads at idle through lib/chrome/install.ts', () => {
    const files = globSync('{app,components,lib,features,stores,hooks}/**/*.{ts,tsx}', {
      exclude: (f) => /node_modules|\.test\.|routeTree\.gen/.test(String(f)),
    }).map(String);
    const offenders = files.filter((file) => {
      if (file.startsWith('lib/chrome/')) return false;
      const source = readFileSync(file, 'utf8');
      return /from\s+['"]@\/lib\/chrome(\/(index|renderer|environment|shader))?['"]/.test(source);
    });
    expect(offenders).toEqual([]);
    expect(readFileSync('lib/chrome/install.ts', 'utf8')).toMatch(/import\(['"]\.\/index['"]\)/);
  });
});
