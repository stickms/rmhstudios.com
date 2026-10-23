/**
 * The site's type: Geist for everything, Geist Mono for eyebrows and data
 * (CLAUDE.md "Design system: Plasmatic Jelly" → Identity). Both faces are
 * self-hosted, the sans is preloaded and metric-matched, and the default
 * theme's `--site-font-*` tokens lead with them while keeping the system face
 * and Inter after them for the scripts Geist lacks (non-Latin locales). These
 * assertions keep the wiring from drifting one line at a time.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const globals = read('app/globals.css');
const siteDisplay = read('app/fonts/site-display.css');
const rootRoute = read('app/routes/__root.tsx');

/** The value of the FIRST declaration of `prop` (the default `:root` / theme block). */
function firstToken(prop: string): string {
  const m = globals.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`${prop} not declared`);
  return m[1].replace(/\s+/g, ' ').trim();
}

describe('site fonts: Geist + Geist Mono', () => {
  it('self-hosts Geist (swap, from Fontsource) and Geist Mono (generated, optional)', () => {
    expect(globals).toMatch(/@import '@fontsource-variable\/geist\/wght\.css';/);
    expect(globals.match(/@import '@fontsource-variable\/geist\/wght\.css';/g)?.length).toBe(1);
    expect(siteDisplay).toMatch(
      /font-family: 'Geist Mono';\s*font-style: normal;\s*font-display: optional;/,
    );
  });

  it('declares a metric-matched Geist Fallback and keeps it inside the Geist token', () => {
    const face = globals.match(/@font-face\s*\{[^}]*'Geist Fallback'[^}]*\}/)?.[0] ?? '';
    for (const d of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) {
      expect(face).toContain(d);
    }
    expect(firstToken('--font-geist')).toBe("'Geist Variable', 'Geist', 'Geist Fallback'");
    expect(firstToken('--font-geist-mono')).toContain("'Geist Mono'");
  });

  it('family tokens end in a named face, never a generic (a generic makes the rest of the stack unreachable)', () => {
    const generics = /(^|,)\s*(sans-serif|serif|monospace|system-ui|ui-[a-z-]+|cursive|fantasy)\s*$/;
    expect(firstToken('--font-geist')).not.toMatch(generics);
    expect(firstToken('--font-geist-mono')).not.toMatch(generics);
  });

  for (const token of ['--site-font-display', '--site-font-body']) {
    it(`${token} leads with Geist and keeps the non-Latin fallbacks`, () => {
      const v = firstToken(token);
      expect(v.startsWith('var(--font-geist)')).toBe(true);
      expect(v).toContain('system-ui');
      expect(v).toContain('var(--font-inter)');
    });
  }

  it('--site-font-mono leads with Geist Mono and keeps JetBrains Mono', () => {
    const v = firstToken('--site-font-mono');
    expect(v.startsWith('var(--font-geist-mono)')).toBe(true);
    expect(v).toContain('var(--font-jetbrains-mono)');
  });

  it('fallbacks follow Geist in order', () => {
    const order = (v: string, names: string[]) => {
      const idx = names.map((n) => v.indexOf(n));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    };
    for (const token of ['--site-font-display', '--site-font-body']) {
      order(firstToken(token), [
        'var(--font-geist)',
        '-apple-system',
        'var(--font-inter)',
        'system-ui',
      ]);
    }
    order(firstToken('--site-font-mono'), [
      'var(--font-geist-mono)',
      'var(--font-jetbrains-mono)',
      "'SF Mono'",
      'monospace',
    ]);
  });

  it('sets eyebrows in the mono token', () => {
    const kicker = globals.match(/\.site-kicker\s*\{[^}]*\}/)?.[0] ?? '';
    expect(kicker).toContain('font-family: var(--site-font-mono)');
  });

  it('preloads the Geist Latin subset (and only one font file) from the root document', () => {
    expect(rootRoute).toContain(
      "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'",
    );
    expect(rootRoute).toMatch(/href:\s*geistLatinWoff2/);
    expect(rootRoute.match(/as: 'font'/g)?.length).toBe(1);
  });
});
