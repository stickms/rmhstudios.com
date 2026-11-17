/**
 * RMH Research is a full-screen microsite (it is in FULLSCREEN_TIER_DIRS for its
 * pinned scroll scenes, which the site-tier CSS gates refuse), but it is drawn
 * in the site's own Steel material. This holds it to the rules those gates
 * would otherwise have held it to: flat (R1, B2), token colours only (T1–T3),
 * weights 400/500/600 (Y1), no letterspaced capitals (Y2).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'components/rmh-research');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|tsx?)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT).map((f) => ({ file: f.slice(process.cwd().length + 1), src: readFileSync(f, 'utf8') }));
/** Strip block and line comments so a rule's own documentation does not trip it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Rules that only mean something in a stylesheet: in TSX, `filter:` and `mask:` are ordinary object keys. */
const CSS_ONLY = new Set(['blur or filter (R1, B2)', 'blend or mask (B2)']);

const FORBIDDEN: [string, RegExp][] = [
  ['gradient (R1)', /(linear|radial|conic)-gradient\(/],
  ['blur or filter (R1, B2)', /(backdrop-filter|(^|[\s;{])filter\s*:|blur\()/m],
  ['shadow (T4)', /(box-shadow|text-shadow|drop-shadow)/],
  ['blend or mask (B2)', /(mix-blend-mode|(^|[\s;{])mask(-image)?\s*:)/m],
  ['raw colour (T1)', /(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\()/],
  ['heavy weight (Y1)', /font-weight\s*:\s*(700|800|900|bold)|fontWeight:\s*['"]?(700|800|900|bold)/],
  ['letterspaced capitals (Y2)', /text-transform\s*:\s*uppercase|textTransform:\s*['"]uppercase/],
  ['translucency (R1)', /color-mix\([^)]*transparent/],
  ['squircle (S)', /corner-shape/],
];

describe('RMH Research is flat Steel', () => {
  it('has files to check', () => {
    expect(FILES.length).toBeGreaterThan(5);
  });
  for (const [rule, re] of FORBIDDEN) {
    it(`uses no ${rule}`, () => {
      const hits = FILES.filter(({ file, src }) => (!CSS_ONLY.has(rule) || file.endsWith('.css')) && re.test(code(src))).map(({ file }) => file);
      expect(hits).toEqual([]);
    });
  }
});
