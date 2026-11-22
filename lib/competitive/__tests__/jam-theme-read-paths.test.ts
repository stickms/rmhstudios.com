import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JAM_THEME_READ_PATHS } from '@/lib/competitive/jam-themes';

// Source scan: every server path that reads a jam's theme, counts or winner is registered in
// JAM_THEME_READ_PATHS and carries the guard that withholds them before `startsAt`.

const root = join(__dirname, '..', '..', '..');
// Whitespace is collapsed so the scan does not depend on how prettier laid the file out.
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\s+/g, ' ');

/** What each registered file must contain to be safe. */
const GUARDS: Record<(typeof JAM_THEME_READ_PATHS)[number], RegExp[]> = {
  'lib/competitive/jams.server.ts': [
    /themeVisible\(j, now\) \? \(themeOverride \?\? j\.theme\) : null/,
    /effectiveThemes\(/,
  ],
  'lib/competitive/api/jams.server.ts': [/listJams\(\)/, /jamThemeVotingFields/],
  'lib/competitive/api/jams.$slug.server.ts': [/getJam\(/],
  'lib/competitive/jam-themes.server.ts': [
    /const started = phase === 'closed'/,
    /counts = started \?/,
    /startsAt\.getTime\(\) <= now\.getTime\(\)/,
  ],
  'lib/competitive/api/jams.$slug.theme-vote.server.ts': [/themeVoteView\(/, /rateLimit: 'write'/],
  'lib/competitive/api/jams.$slug.theme-candidates.server.ts': [/auth: 'admin'/],
  'lib/admin/lookup.server.ts': [/gameJam\.findUnique/],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

describe('JAM_THEME_READ_PATHS', () => {
  it('lists real files, each with its guard', () => {
    for (const p of JAM_THEME_READ_PATHS) {
      const src = read(p);
      for (const guard of GUARDS[p]) expect(src, `${p}: ${guard}`).toMatch(guard);
    }
  });

  it('is complete: no other server file reads gameJam rows or the vote tables', () => {
    const allowed = new Set<string>(JAM_THEME_READ_PATHS);
    // Writers and per-member plumbing that never return a count or the theme.
    const plumbing = new Set(['lib/account/deletion.server.ts']);
    const files = [...walk('lib'), ...walk('app'), ...walk('server'), ...walk('components')];
    const offenders = files.filter((f) => {
      if (allowed.has(f) || plumbing.has(f)) return false;
      const src = read(f);
      return /\bgameJam\.find(Unique|Many|First)|gameJamThemeVote\.(find|group|count)|gameJamThemeCandidate\.find/.test(
        src,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('admin lookup selects no theme column', () => {
    const src = read('lib/admin/lookup.server.ts');
    const block = src.slice(src.indexOf('gameJam.findUnique'), src.indexOf('gameJam.findUnique') + 400);
    expect(block).not.toMatch(/theme/);
  });

  it('keeps the vote and candidate endpoints behind the right wrappers', () => {
    expect(read('lib/competitive/api/jams.$slug.theme-vote.server.ts')).toMatch(
      /PUT: implement\( castJamThemeVotesApi, \{ rateLimit: 'write'/,
    );
    expect(read('lib/competitive/api/jams.$slug.theme-candidates.server.ts')).toMatch(
      /auth: 'admin', rateLimit: 'write'/,
    );
  });
});
