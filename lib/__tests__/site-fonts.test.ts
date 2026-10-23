/**
 * The site's type: Geist for everything, Geist Mono for eyebrows and data
 * (CLAUDE.md "Design system: Plasmatic Jelly" → Identity). Both faces are
 * self-hosted, the sans is preloaded and metric-matched, and the default
 * theme's `--site-font-*` tokens name them. These assertions keep the wiring
 * from drifting back to a system/Inter/JetBrains stack one line at a time.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const globals = read('app/globals.css');
const siteDisplay = read('app/fonts/site-display.css');
const rootRoute = read('app/routes/__root.tsx');

/** The value of the FIRST declaration of `prop` (the default theme's). */
function firstDecl(css: string, prop: string): string {
  const m = css.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`${prop} not declared`);
  return m[1].replace(/\s+/g, ' ').trim();
}

describe('site fonts: Geist + Geist Mono', () => {
  it('self-hosts Geist (swap, from Fontsource) and Geist Mono (generated, optional)', () => {
    expect(globals).toMatch(/@import '@fontsource-variable\/geist\/wght\.css';/);
    expect(siteDisplay).toMatch(
      /font-family: 'Geist Mono';\s*font-style: normal;\s*font-display: optional;/,
    );
  });

  it('declares a metric-matched Geist Fallback and keeps it inside the Geist token', () => {
    const face = globals.match(/@font-face\s*\{[^}]*'Geist Fallback'[^}]*\}/)?.[0] ?? '';
    for (const d of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) {
      expect(face).toContain(d);
    }
    expect(firstDecl(globals, '--font-geist')).toBe(
      "'Geist Variable', 'Geist', 'Geist Fallback', sans-serif",
    );
    expect(firstDecl(globals, '--font-geist-mono')).toMatch(/^'Geist Mono',.*monospace$/);
  });

  it('points the default theme tokens at Geist / Geist Mono', () => {
    expect(firstDecl(globals, '--site-font-body')).toBe('var(--font-geist)');
    expect(firstDecl(globals, '--site-font-display')).toBe('var(--font-geist)');
    expect(firstDecl(globals, '--site-font-mono')).toBe('var(--font-geist-mono)');
  });

  it('sets eyebrows in the mono token', () => {
    const kicker = globals.match(/\.site-kicker\s*\{[^}]*\}/)?.[0] ?? '';
    expect(kicker).toContain('font-family: var(--site-font-mono)');
  });

  it('preloads the Geist Latin subset (and only one font file) from the root document', () => {
    expect(rootRoute).toContain(
      "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'",
    );
    expect(rootRoute.match(/as: 'font'/g)?.length).toBe(1);
  });
});
