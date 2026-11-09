/**
 * RMH Music's dark palette is declared twice in `components/rmhmusic/rmhmusic.css`: once under
 * `@media (prefers-color-scheme: dark)` (a dark OS with no stored choice) and once under
 * `:root[data-app-dark='1']` (the header toggle set to dark). CSS cannot share one block between a
 * media query and an attribute selector, so this pins the two copies together: same custom
 * properties, same values, and every palette token the light base sets is overridden by both (or
 * is on the short neutral list below). Without it, a fix lands in one path and not the other —
 * which is how the toggle-to-dark path kept the white cloud tile on dialogs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTE_THEME_BG } from '@/stores/themeStore';

const CSS = readFileSync(join(__dirname, '../../../components/rmhmusic/rmhmusic.css'), 'utf8');

/** Tokens the light base sets that are the same in both modes on purpose. */
const NEUTRAL = new Set(['--app-font-display']);

/**
 * A light token that is only an alias (`var(--app-surface)`) follows its target into dark: the
 * var() resolves on the same element, where the dark block has overridden the target.
 */
const isAlias = (value: string) => /^var\(--[\w-]+\)$/.test(value);

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `{…}` block that follows `start` (no nested braces inside a palette block). */
function blockAfter(css: string, start: number): string {
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/** Names declared more than once inside one block (a copy-paste slip the cascade hides). */
const repeated: string[] = [];

function declarations(body: string, block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of stripComments(body).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = m[1];
    if (out.has(name)) repeated.push(`${name} twice in the ${block} block`);
    out.set(name, m[2].replace(/\s+/g, ' ').trim());
  }
  return out;
}

function palettes(css: string) {
  const clean = stripComments(css);
  const light = clean.match(/(^|\n)\.rmhmusic-theme\s*\{/);
  const media = clean.indexOf('@media (prefers-color-scheme: dark)');
  const mediaBlock = clean.indexOf(":root:not([data-app-dark='0']) .rmhmusic-theme", media);
  const explicit = clean.indexOf(":root[data-app-dark='1'] .rmhmusic-theme");
  if (!light || media < 0 || mediaBlock < 0 || explicit < 0) {
    throw new Error('rmhmusic.css: could not find the light base and both dark palette blocks');
  }
  return {
    light: declarations(blockAfter(clean, light.index!), 'light'),
    systemDark: declarations(blockAfter(clean, mediaBlock), 'dark-OS'),
    toggleDark: declarations(blockAfter(clean, explicit), 'dark-toggle'),
  };
}

describe('rmhmusic.css: the two dark palettes stay identical', () => {
  const { light, systemDark, toggleDark } = palettes(CSS);

  it('no block declares a property twice', () => {
    expect(repeated, repeated.join('\n')).toEqual([]);
  });

  it('found real palettes', () => {
    expect(light.size).toBeGreaterThan(20);
    expect(systemDark.size).toBeGreaterThan(20);
  });

  it('the system-dark and toggle-dark blocks declare the same properties with the same values', () => {
    const diffs: string[] = [];
    for (const [name, value] of systemDark) {
      if (!toggleDark.has(name))
        diffs.push(`${name} is set for a dark OS but not for the dark toggle`);
      else if (toggleDark.get(name) !== value)
        diffs.push(`${name}: "${value}" (dark OS) vs "${toggleDark.get(name)}" (dark toggle)`);
    }
    for (const name of toggleDark.keys()) {
      if (!systemDark.has(name))
        diffs.push(`${name} is set for the dark toggle but not for a dark OS`);
    }
    expect(diffs, `The two dark blocks in rmhmusic.css have drifted:\n${diffs.join('\n')}`).toEqual(
      [],
    );
  });

  it('every token of the light palette is overridden by both dark blocks (or is neutral)', () => {
    const missing = [...light.entries()]
      .filter(([name, value]) => !NEUTRAL.has(name) && !isAlias(value))
      .map(([name]) => name)
      .filter((name) => !systemDark.has(name) || !toggleDark.has(name));
    expect(
      missing,
      `Light tokens with no dark value (dark mode would keep the light one). Add them to both dark blocks, or to NEUTRAL in this test if they are the same in both modes:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});

describe('rmhmusic.css: the document ground matches the paper', () => {
  const { light, systemDark } = palettes(CSS);
  const clean = stripComments(CSS);
  const ground = (selector: string) => {
    const at = clean.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`rmhmusic.css: no ${selector} rule`);
    return declarationsOf(blockAfter(clean, at));
  };

  // With JavaScript off nothing paints <html>; these rules do, in the paper's own colour.
  it('light: <html> is painted with the light --app-bg', () => {
    expect(ground(':root:has(.rmhmusic-theme)').get('background-color')).toBe(light.get('--app-bg'));
  });

  it('dark OS: <html> is painted with the dark --app-bg and takes the dark scheme', () => {
    const rule = ground(":root:not([data-app-dark='0']):has(.rmhmusic-theme)");
    expect(rule.get('background-color')).toBe(systemDark.get('--app-bg'));
    expect(rule.get('color-scheme')).toBe('dark');
  });
});

describe('rmhmusic.css: the pre-paint script paints the same grounds', () => {
  const { light, systemDark, toggleDark } = palettes(CSS);
  const entry = APP_ROUTE_THEME_BG['/rmhmusic'];

  // The inline script in `app/routes/__root.tsx` paints this map's colours before the stylesheet
  // matters; if they differ from `--app-bg` the page flashes from one to the other.
  it("the '/rmhmusic' entry's light and dark grounds are the palettes' --app-bg", () => {
    expect(entry.light).toBe(light.get('--app-bg'));
    expect(entry.dark).toBe(systemDark.get('--app-bg'));
    expect(entry.dark).toBe(toggleDark.get('--app-bg'));
  });
});

function declarationsOf(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}
