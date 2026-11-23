/**
 * The site's type: DM Sans for everything and DM Mono for data by default (owner, 2026-11-23, replacing Geist), with
 * the reader's own faces chosen from lib/appearance/fonts.ts. The defaults are self-hosted in the site sheet with a
 * metric-matched fallback; every other face is its own sheet (lib/__tests__/font-choice-assets.test.ts). The default
 * `--site-font-*` tokens lead with them and fall back to the OS face for the scripts they lack (non-Latin locales).
 * These assertions keep the wiring from drifting one line at a time.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCss } from './css-source';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readCss(join(ROOT, p));

const globals = read('app/globals.css');
const rootRoute = read('app/routes/__root.tsx');
const comfort = read('app/globals/comfort-suite.css');

/** The value of the FIRST declaration of `prop` (the default `:root` / theme block). */
function firstToken(prop: string): string {
  const m = globals.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`${prop} not declared`);
  return m[1].replace(/\s+/g, ' ').trim();
}

describe('site fonts: DM Sans + DM Mono by default, the reader\'s choice otherwise', () => {
  it('self-hosts the defaults in the site sheet and no Geist', () => {
    expect(globals).toContain("@import './fonts/choice/dm-sans.css';");
    expect(globals).toContain("@import './fonts/choice/dm-mono.css';");
    expect(globals).not.toMatch(/@fontsource-variable\/geist/);
  });

  it('keeps the metric-matched DM Sans Fallback inside the default token', () => {
    expect(firstToken('--font-default-sans')).toBe("'DM Sans', 'DM Sans Fallback'");
    expect(firstToken('--font-default-mono')).toBe("'DM Mono'");
  });

  it('family tokens end in a named face, never a generic (a generic makes the rest of the stack unreachable)', () => {
    const generics = /(^|,)\s*(sans-serif|serif|monospace|system-ui|ui-[a-z-]+|cursive|fantasy)\s*$/;
    expect(firstToken('--font-default-sans')).not.toMatch(generics);
    expect(firstToken('--font-default-mono')).not.toMatch(generics);
  });

  it('--site-font-body is DM Sans then the OS face — no second webfont', () => {
    expect(firstToken('--site-font-body')).toBe('var(--font-default-sans), system-ui, sans-serif');
  });

  // Steel section 3: there is no display face. The display token is the body stack, by reference, so the two cannot
  // drift apart.
  it('--site-font-display is the body stack', () => {
    expect(firstToken('--site-font-display')).toBe('var(--site-font-body)');
  });

  it('--site-font-reading follows the body stack until the reader splits them', () => {
    expect(firstToken('--site-font-reading')).toBe('var(--site-font-body)');
  });

  it('--site-font-mono is DM Mono then the OS mono — no second webfont', () => {
    expect(firstToken('--site-font-mono')).toBe(
      'var(--font-default-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
    );
  });

  it('the app tier uses the same faces, the reader\'s choice included', () => {
    const app = read('components/shared/app-theme.css');
    expect(app).toContain('--app-font-body: var(--site-font-body);');
    expect(app).toContain('--app-font-display: var(--site-font-body);');
    expect(app).toMatch(/--app-font-mono: var\(--site-font-mono\)/);
  });

  it('no stylesheet or component names the retired Geist tokens', () => {
    expect(globals).not.toMatch(/--font-geist/);
    expect(read('components/shared/app-theme.css')).not.toMatch(/--font-geist/);
  });

  it('readable font wins over a chosen main and reading face, later in the cascade', () => {
    expect(comfort).toMatch(/html\.readable-font\s*\{[^}]*--site-font-body:[^}]*--site-font-reading:/);
    // readCss inlines the split globals/*.css, so the readable-font rule's own text sits after the rules' import.
    expect(globals.indexOf('fonts/choice-rules.css')).toBeGreaterThan(-1);
    expect(globals.indexOf('fonts/choice-rules.css')).toBeLessThan(globals.indexOf('html.readable-font {'));
  });

  it('draws text with grayscale smoothing', () => {
    expect(globals).toMatch(/html\s*\{\s*-webkit-font-smoothing: antialiased;\s*-moz-osx-font-smoothing: grayscale;/);
  });

  it('has no eyebrows: the kicker is sentence case in the site sans, not letterspaced mono caps', () => {
    const kicker = globals.match(/\.site-kicker\s*\{[^}]*\}/)?.[0] ?? '';
    expect(kicker).not.toContain('--site-font-mono');
    expect(kicker).not.toContain('text-transform: uppercase');
    expect(globals).toMatch(/--site-kicker-tracking:\s*0;/);
  });

  it('preloads only the text faces in use, from the generated asset list, and links only chosen sheets', () => {
    expect(rootRoute).not.toMatch(/@fontsource-variable\/geist/);
    expect(rootRoute).toContain("from '@/lib/appearance/font-assets.gen'");
    expect(rootRoute).toMatch(/href: FONT_ASSETS\[id\]\.latin/);
    expect(rootRoute).toMatch(/fontsInUse\(fonts\)\.map\(\(id\) => \(\{ rel: 'stylesheet', href: FONT_ASSETS\[id\]\.sheet \}\)\)/);
    expect(rootRoute.match(/as: 'font'/g)?.length).toBe(1);
  });

  it('the Discord head links the chosen faces too, since it stamps their attributes', () => {
    const discord = rootRoute.slice(rootRoute.indexOf('if (discord) {'), rootRoute.indexOf('hintDocumentAssets(appCss'));
    expect(discord).toContain('...fontLinks.sheets');
  });
});
