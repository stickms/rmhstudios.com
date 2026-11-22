/**
 * "Hide me from leaderboards" on every board (sprint 09 #07): the source-scan ratchet.
 *
 * `BOARD_PRIVACY_READ_PATHS` lists the files that return a ranked list of members and must read the hidden set;
 * `BOARD_PRIVACY_EXEMPT` names the files that look like boards and are not, with a reason. This test fails a file
 * that looks like a board and is in neither, a listed file that does not call `leaderboardHiddenUserIds()` in code
 * (a comment is not a call), and an exemption that is stale or that reads members itself.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_PRIVACY_EXEMPT, BOARD_PRIVACY_READ_PATHS } from '@/lib/game/leaderboard-privacy';

const ROOT = join(__dirname, '..', '..', '..');

/** Names that mark a board: leaderboard, standings, board (which also catches onboarding), pickem, contributors, tricks. */
const BOARD_NAME = /leaderboard|standings|board|pickem|contributors|tricks/i;
/** A ranked read: `findMany` ordered by a score-like column and cut with `take`. */
const SCORE_COLUMN = /\b(score|rating|totalXp|wpm|bestWpm|timeMs)\b/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full));
  }
  return out;
}

/** Source files the scan covers: server modules under lib, features and server, and the route files under app/routes/api. */
function scanned(): string[] {
  const files = [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'features')), ...walk(join(ROOT, 'server'))].filter(
    (f) => f.endsWith('.server.ts') && !f.endsWith('.test.ts'),
  );
  const routes = walk(join(ROOT, 'app/routes/api')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  return [...files, ...routes];
}

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The source with comments removed, so a mention in a comment is never taken for a call. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function looksLikeBoard(path: string): boolean {
  // Route files are named by their URL segments, so the folder counts for them.
  const name = path.startsWith('app/routes/') ? path.slice('app/routes/'.length) : (path.split('/').pop() ?? path);
  if (BOARD_NAME.test(name)) return true;
  const src = code(read(path));
  return (
    /\bfindMany\b/.test(src) &&
    /orderBy:[^\n]*/.test(src) &&
    [...src.matchAll(/orderBy:[^\n]*/g)].some((m) => SCORE_COLUMN.test(m[0])) &&
    /\btake\b/.test(src)
  );
}

/** `lib/game/adapters.server.ts` as the specifier another file imports it by. */
function specifier(path: string): string {
  const bare = path.replace(/\.ts$/, '');
  return bare.startsWith('features/') ? `@${bare}` : `@/${bare}`;
}

describe('board privacy read paths', () => {
  const listed = new Set<string>(BOARD_PRIVACY_READ_PATHS);
  const exempt = new Set(Object.keys(BOARD_PRIVACY_EXEMPT));

  it('scans a real set of files', () => {
    expect(scanned().length).toBeGreaterThan(500);
    expect(scanned().filter(looksLikeBoard).length).toBeGreaterThan(30);
  });

  it('classifies every file that looks like a board', () => {
    const unlisted = scanned().filter((f) => looksLikeBoard(f) && !listed.has(f) && !exempt.has(f));
    // A file listed here returns a ranked list of members: add it to BOARD_PRIVACY_READ_PATHS and filter through
    // leaderboardHiddenUserIds(), or, if it genuinely shows no member identity, to BOARD_PRIVACY_EXEMPT with a reason.
    expect(unlisted).toEqual([]);
  });

  it('lists each path once, and never as both read path and exemption', () => {
    expect(new Set(BOARD_PRIVACY_READ_PATHS).size).toBe(BOARD_PRIVACY_READ_PATHS.length);
    expect([...exempt].filter((f) => listed.has(f))).toEqual([]);
  });

  it.each([...BOARD_PRIVACY_READ_PATHS])('%s calls leaderboardHiddenUserIds in code', (path) => {
    expect(existsSync(join(ROOT, path)), `${path} no longer exists: remove it from the registry`).toBe(true);
    const full = read(path);
    const src = code(full);
    const own = /function\s+leaderboardHiddenUserIds\b/.test(src);
    if (own) {
      // The standalone hub defines its own twin (it has no access to the web tier's cache): the definition plus a call.
      expect([...src.matchAll(/\bleaderboardHiddenUserIds\s*\(/g)].length).toBeGreaterThanOrEqual(2);
    } else {
      expect(src).toMatch(
        /import\s*\{[^}]*\bleaderboardHiddenUserIds\b[^}]*\}\s*from\s*'@\/lib\/game\/leaderboard-privacy\.server'/,
      );
      expect(src).toMatch(/\bleaderboardHiddenUserIds\s*\(/);
    }
  });

  it.each(Object.entries(BOARD_PRIVACY_EXEMPT))('%s is exempt for a stated reason', (path, entry) => {
    expect(existsSync(join(ROOT, path)), `${path} no longer exists: remove its exemption`).toBe(true);
    expect(entry.reason.trim().length).toBeGreaterThan(20);
    expect(entry.reason).not.toMatch(/\b(todo|tbd|fixme)\b/i);
    if (!entry.via) return;
    // A handler that only passes the request on: the file it passes to is listed, this one imports it, and this one
    // reads no table itself.
    expect(listed.has(entry.via), `${entry.via} must be in BOARD_PRIVACY_READ_PATHS`).toBe(true);
    const src = code(read(path));
    const via = specifier(entry.via);
    // An import alone proves nothing: a value imported from the listed file must be used in code.
    const imp = [...src.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s*from\s*'([^']+)'/g)].find((m) => m[2] === via);
    expect(imp, `${path} must import a value from ${via}`).toBeTruthy();
    const names = (imp?.[1] ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith('type '))
      .map((n) => n.split(/\s+as\s+/).pop() as string);
    const used = names.some((n) => [...src.matchAll(new RegExp(`\\b${n}\\b`, 'g'))].length >= 2);
    expect(used, `${path} imports ${via} but never uses it`).toBe(true);
    expect(src).not.toMatch(/\b(prisma|prismaRead)\s*\./);
  });
});
