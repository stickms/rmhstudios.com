/**
 * The site's type: Geist for everything, Geist Mono for data (no eyebrows)
 * (CLAUDE.md "Design system: Plasmatic Jelly" → Identity). Both faces are
 * self-hosted, the sans is preloaded and metric-matched, and the default
 * theme's `--site-font-*` tokens lead with them and fall back to the OS face for
 * the scripts Geist lacks (non-Latin locales). These
 * assertions keep the wiring from drifting one line at a time.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCss } from './css-source';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readCss(join(ROOT, p));

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

  it('--site-font-body is Geist then the OS face — no second webfont', () => {
    expect(firstToken('--site-font-body')).toBe('var(--font-geist), system-ui, sans-serif');
  });

  // Steel section 3: there is no display face. The display token is the body stack, by reference, so the two cannot
  // drift apart.
  it('--site-font-display is the body stack', () => {
    expect(firstToken('--site-font-display')).toBe('var(--site-font-body)');
  });

  it('--site-font-mono is Geist Mono then the OS mono — no second webfont', () => {
    expect(firstToken('--site-font-mono')).toBe(
      'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
    );
  });

  it('the app tier uses the same faces', () => {
    const app = read('components/shared/app-theme.css');
    expect(app).toContain('--app-font-body: var(--font-geist), system-ui, sans-serif;');
    expect(app).toContain('--app-font-display: var(--font-geist), system-ui, sans-serif;');
    expect(app).toMatch(/--app-font-mono: var\(--font-geist-mono\)/);
  });

  it('loads no older face from the site sheet (those load with their game/page)', () => {
    for (const old of ['Inter', 'JetBrains Mono', 'Playfair Display', 'Cinzel', 'Outfit']) {
      expect(siteDisplay).not.toContain(`'${old}'`);
    }
    expect(globals).not.toMatch(/@import '@fontsource-variable\/(inter|jetbrains-mono)/);
    expect(globals).not.toContain('--font-inter');
    expect(globals).not.toContain('--font-serif');
  });

  it('has no eyebrows: the kicker is sentence case in the site sans, not letterspaced mono caps', () => {
    const kicker = globals.match(/\.site-kicker\s*\{[^}]*\}/)?.[0] ?? '';
    expect(kicker).not.toContain('--site-font-mono');
    expect(kicker).not.toContain('text-transform: uppercase');
    expect(globals).toMatch(/--site-kicker-tracking:\s*0;/);
  });

  it('preloads the Geist Latin subset (and only one font file) from the root document', () => {
    expect(rootRoute).toContain(
      "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'",
    );
    expect(rootRoute).toMatch(/href:\s*geistLatinWoff2/);
    expect(rootRoute.match(/as: 'font'/g)?.length).toBe(1);
  });
});
