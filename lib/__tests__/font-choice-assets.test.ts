// @vitest-environment node
/**
 * The reader's fonts are self-hosted, one stylesheet per face, and only the defaults ride the site sheet (owner,
 * 2026-11-23: "ensure we only load fonts we use"). Design: docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_CATALOGUE } from '@/lib/appearance/fonts';
import { FONT_ASSET_PATHS } from '@/lib/appearance/font-assets.gen';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const families = (css: string) => [...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]);

describe('font choice assets', () => {
  it('every catalogue face has its own generated sheet and an asset entry', () => {
    for (const f of FONT_CATALOGUE) {
      expect(existsSync(join(ROOT, `app/fonts/choice/${f.id}.css`)), f.id).toBe(true);
      expect(FONT_ASSET_PATHS[f.id]?.sheet, f.id).toBe(`app/fonts/choice/${f.id}.css`);
      expect(FONT_ASSET_PATHS[f.id]?.latin, f.id).toMatch(/-latin-(wght|400)-normal\.woff2$/);
    }
  });

  it('the site sheet declares only the default faces', () => {
    const globals = read('app/globals.css');
    expect(globals).not.toMatch(/@fontsource-variable\/geist/);
    expect(globals).not.toMatch(/fonts\/site-display\.css/);
    const imported = [...globals.matchAll(/@import '\.\/fonts\/([^']+)'/g)].map((m) => m[1]);
    expect(imported).toEqual(['choice/dm-sans.css', 'choice/dm-mono.css', 'choice-rules.css']);
    const declared = new Set(imported.flatMap((f) => families(read(`app/fonts/${f}`))));
    expect([...declared].sort()).toEqual(['DM Mono', 'DM Sans', 'DM Sans Fallback']);
  });

  it('text faces swap behind a metric fallback; mono faces are optional', () => {
    for (const f of FONT_CATALOGUE) {
      const css = read(`app/fonts/choice/${f.id}.css`);
      if (f.kind === 'mono') {
        expect(css, f.id).toMatch(/font-display: optional;/);
        expect(css, f.id).not.toMatch(/font-display: swap;/);
      } else {
        expect(css, f.id).toMatch(/font-display: swap;/);
        expect(families(css), f.id).toContain(`${f.family} Fallback`);
      }
    }
  });

  it("a stand-in covers only Latin, so other scripts take the OS face at its own metrics", () => {
    for (const f of FONT_CATALOGUE.filter((x) => x.kind !== 'mono')) {
      const face = read(`app/fonts/choice/${f.id}.css`).match(/@font-face\s*\{[^}]*Fallback'[^}]*\}/)?.[0] ?? '';
      expect(face, f.id).toMatch(/unicode-range: U\+0000-00FF/);
      expect(face, f.id).not.toMatch(/U\+0600/);
    }
  });

  it('Charis SIL (Charter) answers 600 with its 700 file', () => {
    const css = read('app/fonts/choice/charter.css');
    expect(css).toMatch(/font-weight: 600 700;/);
    expect(css).not.toMatch(/font-weight: 600;/);
  });

  it('the choice rules map attributes to variables and declare no faces', () => {
    const rules = read('app/fonts/choice-rules.css');
    expect(rules).not.toMatch(/@font-face/);
    expect(rules).toMatch(/html\[data-font-main='inter'\]\s*\{\s*--site-font-body: 'Inter', 'Inter Fallback'/);
    expect(rules).toMatch(/html\[data-font-reading='dm-sans'\]\s*\{\s*--site-font-reading: 'DM Sans'/);
    expect(rules).toMatch(/html\[data-font-mono='jetbrains-mono'\]\s*\{\s*--site-font-mono: 'JetBrains Mono'/);
  });
});
