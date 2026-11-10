/**
 * Every relative stylesheet import resolves.
 *
 * Moving a feature folder (redesign A1) rewrites TypeScript specifiers, and tsc checks
 * those, but nothing type-checks a CSS `@import '../shared/…'` or a `.css` side-effect
 * import: four moved games still pointed at `components/shared/` with their old depth
 * and only the production build noticed. This walks every source tree for relative
 * stylesheet imports and fails on any that does not exist on disk.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ROOTS = ['app', 'components', 'features', 'lib', 'hooks', 'stores'];
const CSS_IMPORT = /@import\s+(?:url\()?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
// Statement-level imports only (line start), so comments and template strings never match.
const TS_CSS_IMPORT = /^\s*import\s+(?:[^'"\n]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+\.css)(?:\?[^'"]*)?['"]/gm;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|tsx?|jsx?)$/.test(name)) out.push(full);
  }
}

describe('relative stylesheet imports', () => {
  it('all resolve to a file on disk', () => {
    const files: string[] = [];
    for (const r of ROOTS) if (existsSync(join(ROOT, r))) walk(join(ROOT, r), files);
    const broken: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const re = file.endsWith('.css') ? CSS_IMPORT : TS_CSS_IMPORT;
      for (const m of src.matchAll(re)) {
        const spec = m[1]!.split('?')[0]!;
        if (spec.includes('<')) continue; // a placeholder in prose, not a path
        const target = normalize(join(dirname(file), spec));
        if (!existsSync(target)) broken.push(`${relative(ROOT, file)} -> ${spec}`);
      }
    }
    expect(broken, 'fix these paths (after a move, count the new depth)').toEqual([]);
  });
});
