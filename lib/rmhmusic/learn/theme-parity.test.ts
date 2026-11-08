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
