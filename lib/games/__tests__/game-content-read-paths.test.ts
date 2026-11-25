import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// s14-17: these writes ask the member's timeouts first; this suite is not about them (restriction-paths and
// lib/api/__tests__/v1-timeouts.test.ts are), so nobody is timed out here.
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: async () => null,
  restrictionMessage: async () => null,
  isRestricted: async () => false,
}));
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import {
  GAME_CONTENT_EXEMPT_PATHS,
  GAME_CONTENT_READ_PATHS,
  GAME_CONTENT_UNFILTERED_READS,
} from '@/lib/games/moderation';

/**
 * s14-08: a review, guide or tip a moderator removed reaches nobody but its author. Every server file that reads
 * `gameReview`, `gameGuide` or `achievementTip` is in `GAME_CONTENT_READ_PATHS` (and filters on `moderatedAt`) or in
 * `GAME_CONTENT_EXEMPT_PATHS` with its reason. A new reader that is in neither fails here instead of leaking. Two
 * halves:
 *
 *  1. a source scan over lib/, app/, server/, features/, components/ and scripts/;
 *  2. the one reader that is a route (the achievement tips) driven against a fake that filters the way Postgres does.
 */

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '.git') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|d)\.(ts|tsx)$/.test(name) && name !== 'routeTree.gen.ts') {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Source without comments (a mention in a comment is not a read, and a comment never satisfies a scan). */
function code(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const TABLE = /\b(gameReview|gameGuide|achievementTip)\b/;
const READ_CALL =
  /\b(?:gameReview|gameGuide|achievementTip)\.(?:findMany|findFirst|findUnique|count|aggregate|groupBy)\(/g;

/** The text of each read call's arguments, up to its closing parenthesis. */
function readCalls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(READ_CALL)) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

describe('the read-path registry', () => {
  const sources = ['lib', 'app', 'server', 'features', 'components', 'scripts'].flatMap((dir) =>
    walk(path.join(ROOT, dir)),
  );
  const readers = sources.filter((file) => TABLE.test(code(file)));
  const listed = new Set<string>(GAME_CONTENT_READ_PATHS);
  const exempt = new Set(Object.keys(GAME_CONTENT_EXEMPT_PATHS));

  it('finds the readers the registry was written from', () => {
    expect(readers).toContain('lib/games/meta.server.ts');
    expect(readers).toContain('lib/sitemap.server.ts');
    expect(readers).toContain('lib/arcade/api/arcade.tips.server.ts');
  });

  it('every file that touches the three tables is listed or exempt, never both', () => {
    const unclassified = readers.filter((file) => !listed.has(file) && !exempt.has(file));
    expect(
      unclassified,
      'add each to GAME_CONTENT_READ_PATHS (and filter moderatedAt) or exempt it with a reason',
    ).toEqual([]);
    for (const file of listed) expect(exempt.has(file), `${file} is listed and exempt`).toBe(false);
  });

  it('lists no file that does not read the tables (a dead entry hides a deleted reader)', () => {
    for (const file of [...listed, ...exempt]) {
      expect(readers, `${file} does not read gameReview, gameGuide or achievementTip`).toContain(file);
    }
  });

  it('every listed reader filters on moderatedAt: null', () => {
    for (const file of listed) {
      expect(code(file), `${file} never filters moderatedAt: null`).toMatch(/moderatedAt:\s*null/);
    }
  });

  it('every read call in a listed file names moderatedAt (a filter, or a select it then checks), bar the stated ones', () => {
    for (const file of listed) {
      const calls = readCalls(code(file));
      const unfiltered = calls.filter((call) => !call.includes('moderatedAt'));
      const allowed = GAME_CONTENT_UNFILTERED_READS[file];
      expect(
        unfiltered.length,
        `${file}: ${unfiltered.length} read(s) of a game review, guide or tip ignore moderatedAt:\n${unfiltered.join('\n---\n')}`,
      ).toBe(allowed?.calls ?? 0);
    }
    for (const [file, { reason }] of Object.entries(GAME_CONTENT_UNFILTERED_READS)) {
      expect(listed.has(file), `${file} is not a listed reader`).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  it('every exemption states a real reason', () => {
    for (const [file, reason] of Object.entries(GAME_CONTENT_EXEMPT_PATHS)) {
      expect(reason.trim().length, file).toBeGreaterThan(40);
    }
  });

  it('the scan catches a reader that forgets the filter', () => {
    const bad = 'const rows = await prisma.gameGuide.findMany({ where: { gameId, published: true } });';
    expect(readCalls(bad)).toHaveLength(1);
    expect(readCalls(bad)[0]).not.toContain('moderatedAt');
    const good = 'prisma.achievementTip.findMany({ where: { achievementId, moderatedAt: null }, take: f(1) });';
    expect(readCalls(good)[0]).toContain('moderatedAt');
  });
});

/* ── 2. the achievement tips, as a route ───────────────────────────────── */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ tips: [] as Record<string, unknown>[] }));

function ok(row: Row, where: Row | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, want]) => {
    if (key === 'OR') return (want as Row[]).some((w) => ok(row, w));
    return row[key] === want;
  });
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      achievementTip: {
        findMany: async ({ where }: { where: Row }) =>
          h.tips
            .filter((t) => ok(t, where))
            .map((t) => ({
              ...t,
              user: {
                id: t.userId,
                name: t.userId,
                username: null,
                handle: t.userId,
                image: null,
                profile: null,
                inventory: [],
              },
              vote: false,
            })),
        findUnique: async ({ where }: { where: Row }) => h.tips.find((t) => t.id === where.id) ?? null,
        count: async () => 0,
        create: async () => ({ id: 'new' }),
        update: async () => ({}),
      },
      achievementTipVote: { findUnique: async () => null, create: async () => ({}), delete: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
    }),
  };
});
vi.mock('@/lib/api/handler.server', async (orig) => ({
  ...(await orig<object>()),
  defineHandler: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/achievements/catalog', () => ({ ACHIEVEMENTS: [{ id: 'first-win', name: 'First win' }] }));

type Handler = (a: Row) => Promise<Response>;

const tip = (over: Row = {}) => ({
  id: 't1',
  achievementId: 'first-win',
  userId: 'a',
  body: 'A tip long enough',
  votes: 0,
  moderatedAt: null,
  ...over,
});

beforeEach(() => {
  h.tips = [tip({ id: 'live', userId: 'a' }), tip({ id: 'gone', userId: 'b', moderatedAt: new Date() })];
});

describe('achievement tips', () => {
  async function handlers() {
    return handlersOfModule<Handler>(await import('@/lib/arcade/api/arcade.tips.server'));
  }

  it('another player (and a signed-out one) sees only the live tip', async () => {
    const { GET } = await handlers();
    for (const userId of [null, 'c']) {
      const res = await GET!({ userId, query: { achievementId: 'first-win' } });
      const body = (await res.json()) as { tips: { id: string }[] };
      expect(body.tips.map((t) => t.id)).toEqual(['live']);
    }
  });

  it('the author also sees their removed tip, marked removed', async () => {
    const { GET } = await handlers();
    const res = await GET!({ userId: 'b', query: { achievementId: 'first-win' } });
    const body = (await res.json()) as { tips: { id: string; removed: boolean }[] };
    expect(body.tips.map((t) => [t.id, t.removed]).sort()).toEqual([
      ['gone', true],
      ['live', false],
    ]);
  });

  it('a vote on a removed tip is refused as if the tip did not exist', async () => {
    const { PUT } = await handlers();
    const res = await PUT!({ userId: 'c', body: { tipId: 'gone' } });
    expect(res.status).toBe(404);
  });
});
