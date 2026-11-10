/**
 * Which stylesheets the site-tier / app-tier CSS gates look at (redesign E4).
 *
 * The games and standalone arms in `FULLSCREEN_TIER_DIRS` keep their own scheme, their own keyframes and their own
 * `!important`s, so the gates skip them. The `--app-*` app tier sits in that same list (for the palette rules) but IS
 * held to these gates, hence {@link APP_TIER_DIRS}.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FULLSCREEN_TIER_DIRS } from '../../eslint-local-rules/design-scope.js';

/** The `--app-*` full-screen apps: in FULLSCREEN_TIER_DIRS for the palette rules, but held to the CSS gates. */
export const APP_TIER_DIRS = new Set([
  'shared',
  'rmhbox',
  'rmhcode',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'tf2-hud',
  'rmhvibe',
  'studio',
]);

function owned(rel: string): boolean {
  const parts = rel.split('/');
  if (parts[0] !== 'components') return true;
  const dir = parts[1] ?? '';
  return APP_TIER_DIRS.has(dir) || !FULLSCREEN_TIER_DIRS.has(dir);
}

function walk(root: string, dir: string, out: string[]): string[] {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__' && e.name !== 'generated') walk(root, rel, out);
    } else if (e.name.endsWith('.css') && owned(rel)) out.push(rel);
  }
  return out;
}

/** Repo-relative paths of every site-tier and app-tier `.css` file (split partials included), sorted. */
export function siteAppCssFiles(root: string = process.cwd()): string[] {
  return ['app', 'components', 'lib', 'hooks', 'stores'].flatMap((d) => walk(root, d, [])).sort();
}
