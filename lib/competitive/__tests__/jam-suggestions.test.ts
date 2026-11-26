/**
 * s15-13 theme suggestions, through the real endpoint wrappers with Prisma, the lock, the session and the timeout
 * check stood in for by fakes (the Prisma fake goes through `shapeChecked`): the window, the cap under the member's
 * lock, duplicates, withdrawing, who sees what, the `comment` timeout, bans and blocks, "On the shortlist" withheld
 * until the vote has opened (the member's list and the export), the export and the erasure operation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-12-10T12:00:00Z');

interface SuggestionRow {
  id: string;
  jamId: string;
  userId: string;
  text: string;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  jam: null as Record<string, unknown> | null,
  candidates: [] as { jamId: string; text: string }[],
  suggestions: [] as SuggestionRow[],
  users: new Map<string, { id: string; name: string | null; handle: string | null; bannedUntil: Date | null }>(),
  blocks: [] as { blockerId: string; blockedId: string }[],
  restricted: false,
  lockKeys: [] as string[],
  chain: new Map<string, Promise<void>>(),
  seq: 0,
  erased: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: vi.fn(async (_userId: string, feature: string) =>
    h.restricted && feature === 'comment' ? Response.json({ error: 'timed out' }, { status: 403 }) : null,
  ),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  // A real lock blocks the second holder of a key until the first transaction ends; this does the same.
  lockKey: vi.fn(async (tx: { held: Array<() => void> }, key: string) => {
    h.lockKeys.push(key);
    const prev = h.chain.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => {
      release = r;
    });
    h.chain.set(
      key,
      prev.then(() => mine),
    );
    await prev;
    tx.held.push(release);
  }),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const pick = (row: Record<string, unknown>, select?: Record<string, unknown>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };
  const gameJam = {
    findUnique: vi.fn(async (a: { where: { id?: string; slug?: string }; select?: Record<string, unknown> }) =>
      h.jam && (a.where.id ? h.jam.id === a.where.id : h.jam.slug === a.where.slug) ? pick(h.jam, a.select) : null,
    ),
  };
  const gameJamThemeCandidate = {
    findMany: vi.fn(async (a: { where: { jamId: string } }) => h.candidates.filter((c) => c.jamId === a.where.jamId)),
  };
  const user = {
    findUnique: vi.fn(async (a: { where: { id: string } }) => h.users.get(a.where.id) ?? null),
  };
  const userBlock = {
    findFirst: vi.fn(async (a: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
      h.blocks.some((b) => a.where.OR.some((o) => o.blockerId === b.blockerId && o.blockedId === b.blockedId))
        ? { id: 'block-1' }
        : null,
    ),
  };
  const gameJamThemeSuggestion = {
    findMany: vi.fn(async (a: { where: { jamId?: string; userId?: string }; select?: Record<string, unknown> }) =>
      h.suggestions
        .filter(
          (s) => (!a.where.jamId || s.jamId === a.where.jamId) && (!a.where.userId || s.userId === a.where.userId),
        )
        .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
        .map((s) => ({
          ...pick(s as unknown as Record<string, unknown>, a.select),
          ...(a.select?.user ? { user: h.users.get(s.userId) } : {}),
          ...(a.select?.jam ? { jam: { ...h.jam, themeCandidates: h.candidates } } : {}),
        })),
    ),
    create: vi.fn(async (a: { data: { jamId: string; userId: string; text: string } }) => {
      h.seq += 1;
      const row: SuggestionRow = { id: `s-${h.seq}`, ...a.data, createdAt: new Date(Date.now() + h.seq) };
      h.suggestions.push(row);
      return { ...row };
    }),
    deleteMany: vi.fn(async (a: { where: { id?: string; jamId?: string; userId: string } }) => {
      const before = h.suggestions.length;
      h.suggestions = h.suggestions.filter(
        (s) =>
          !(
            s.userId === a.where.userId &&
            (!a.where.id || s.id === a.where.id) &&
            (!a.where.jamId || s.jamId === a.where.jamId)
          ),
      );
      h.erased.push(a.where);
      return { count: before - h.suggestions.length };
    }),
  };
  const client = {
    gameJam,
    gameJamThemeCandidate,
    gameJamThemeSuggestion,
    user,
    userBlock,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { gameJam, user, userBlock, gameJamThemeSuggestion, held: [] as Array<() => void> };
      try {
        return await fn(tx);
      } finally {
        for (const release of tx.held) release();
      }
    },
  };
  return { prisma: shapeChecked(client) };
});

interface Body {
  code?: string;
  max?: number;
  suggestion: { text: string; shortlisted: boolean };
  view: { open: boolean; mine: { text: string }[]; all: unknown[] | null };
}

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function call(method: 'GET' | 'POST' | 'DELETE', slug: string, body?: unknown, id?: string) {
  const mod = id
    ? await import('@/lib/competitive/api/jams.$slug.suggestions.$id.server')
    : await import('@/lib/competitive/api/jams.$slug.suggestions.server');
  const handlers = mod.route.handlers as Record<string, Handler>;
  const res = await handlers[method]!({
    request: new Request(`https://rmhstudios.com/api/jams/${slug}/suggestions${id ? `/${id}` : ''}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: id ? { slug, id } : { slug },
  });
  const text = await res.text();
  const json = (JSON.parse(text || 'null') ?? null) as Body | null;
  if (json) assertJsonSafe(json);
  return { status: res.status, json };
}

const as = (id: string, isAdmin = false) => {
  h.session = { user: { id, isAdmin } };
};
const SLUG = 'space-jam-ab12c';
const suggest = (text: string) => call('POST', SLUG, { text });
const seed = (userId: string, text: string, ms = 0) =>
  h.suggestions.push({ id: `seed-${++h.seq}`, jamId: 'jam-1', userId, text, createdAt: new Date(T0.getTime() + ms) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h.session = null;
  h.jam = {
    id: 'jam-1',
    slug: SLUG,
    createdById: 'admin-1',
    startsAt: new Date(T0.getTime() + 3 * DAY),
    themeVoting: true,
    themeVoteOpensAt: new Date(T0.getTime() + DAY),
  };
  h.candidates = [];
  h.suggestions = [];
  h.users = new Map([
    ['u1', { id: 'u1', name: 'Ada', handle: 'ada', bannedUntil: null }],
    ['u2', { id: 'u2', name: 'Bo', handle: 'bo', bannedUntil: null }],
    ['u3', { id: 'u3', name: 'Cy', handle: 'cy', bannedUntil: null }],
    ['admin-1', { id: 'admin-1', name: 'Admin', handle: 'admin', bannedUntil: null }],
  ]);
  h.blocks = [];
  h.restricted = false;
  h.lockKeys = [];
  h.chain = new Map();
  h.seq = 0;
  h.erased = [];
});

describe('the window', () => {
  it('takes a suggestion before the vote opens and lists it as the member’s own', async () => {
    as('u1');
    const first = await suggest('  Deep   sea ');
    expect(first.status).toBe(201);
    expect(first.json?.suggestion).toMatchObject({ text: 'Deep sea', shortlisted: false });
    expect((await suggest('Tiny worlds')).status).toBe(201);
    const list = await call('GET', SLUG);
    expect(list.json?.view.open).toBe(true);
    expect(list.json?.view.mine.map((m: { text: string }) => m.text)).toEqual(['Deep sea', 'Tiny worlds']);
    expect(list.json?.view.all).toBeNull();
  });

  it('refuses once the vote has opened, once the jam has started, and for a jam without a vote window', async () => {
    as('u1');
    vi.setSystemTime(new Date(T0.getTime() + DAY));
    const opened = await suggest('Too late');
    expect(opened.status).toBe(409);
    expect(opened.json?.code).toBe('JAM_SUGGESTIONS_CLOSED');
    vi.setSystemTime(new Date(T0.getTime() + 4 * DAY));
    expect((await suggest('Way too late')).json?.code).toBe('JAM_SUGGESTIONS_CLOSED');
    vi.setSystemTime(T0);
    h.jam = { ...h.jam!, themeVoteOpensAt: null };
    expect((await suggest('No window')).json?.code).toBe('JAM_SUGGESTIONS_CLOSED');
    h.jam = { ...h.jam!, themeVoting: false, themeVoteOpensAt: new Date(T0.getTime() + DAY) };
    expect((await suggest('No vote')).json?.code).toBe('JAM_SUGGESTIONS_CLOSED');
    expect(h.suggestions).toHaveLength(0);
  });

  it('answers 404 for an unknown jam and 401 for a signed-out caller', async () => {
    as('u1');
    expect((await call('POST', 'nope', { text: 'Anything' })).status).toBe(404);
    h.session = null;
    expect((await suggest('Anything')).status).toBe(401);
  });

  it('trims, strips control characters and refuses text outside 3 to 120 characters', async () => {
    as('u1');
    expect((await suggest('ab')).status).toBe(400);
    expect((await suggest('x'.repeat(121))).status).toBe(400);
    expect((await suggest('Ocean\u0007 floor')).json?.suggestion.text).toBe('Ocean floor');
  });
});

describe('the cap and duplicates', () => {
  it('refuses a fourth suggestion with the limit and its number', async () => {
    as('u1');
    for (const t of ['One one', 'Two two', 'Three three']) expect((await suggest(t)).status).toBe(201);
    const fourth = await suggest('Four four');
    expect(fourth.status).toBe(409);
    expect(fourth.json).toMatchObject({ code: 'JAM_SUGGESTION_LIMIT', max: 3 });
    expect(h.suggestions).toHaveLength(3);
  });

  it('two concurrent fourth suggestions leave exactly three, each count-and-insert under the member lock', async () => {
    as('u1');
    seed('u1', 'One one');
    seed('u1', 'Two two');
    const [a, b] = await Promise.all([suggest('Race a'), suggest('Race b')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(h.suggestions.filter((s) => s.userId === 'u1')).toHaveLength(3);
    expect(h.lockKeys.filter((k) => k === 'jam-suggestions:jam-1:u1').length).toBeGreaterThanOrEqual(2);
  });

  it('counts per member and per jam, not across members', async () => {
    seed('u2', 'One one');
    seed('u2', 'Two two');
    seed('u2', 'Three three');
    as('u1');
    expect((await suggest('Mine')).status).toBe(201);
  });

  it('refuses the same text twice from one member (ignoring case) but lets another member send it', async () => {
    as('u1');
    expect((await suggest('Deep sea')).status).toBe(201);
    expect((await suggest('deep SEA')).json?.code).toBe('CONFLICT');
    as('u2');
    expect((await suggest('Deep sea')).status).toBe(201);
  });
});

describe('withdrawing', () => {
  it('removes your own suggestion while the window is open and never someone else’s', async () => {
    seed('u1', 'Mine mine');
    seed('u2', 'Theirs');
    as('u1');
    const theirs = h.suggestions.find((s) => s.userId === 'u2')!;
    expect((await call('DELETE', SLUG, undefined, theirs.id)).status).toBe(404);
    expect(h.suggestions).toHaveLength(2);
    const mine = h.suggestions.find((s) => s.userId === 'u1')!;
    expect((await call('DELETE', SLUG, undefined, mine.id)).status).toBe(200);
    expect(h.suggestions.map((s) => s.userId)).toEqual(['u2']);
  });

  it('is refused once the window has closed', async () => {
    seed('u1', 'Mine mine');
    as('u1');
    vi.setSystemTime(new Date(T0.getTime() + 2 * DAY));
    const res = await call('DELETE', SLUG, undefined, h.suggestions[0]!.id);
    expect(res.json?.code).toBe('JAM_SUGGESTIONS_CLOSED');
    expect(h.suggestions).toHaveLength(1);
  });
});

describe('who sees what', () => {
  it('shows a member only their own, and an admin every one grouped by text with a count and the names', async () => {
    seed('u1', 'Deep sea', 1);
    seed('u2', 'deep sea', 2);
    seed('u3', 'Tiny worlds', 3);
    as('u2');
    const member = await call('GET', SLUG);
    expect(member.json?.view.mine.map((m: { text: string }) => m.text)).toEqual(['deep sea']);
    expect(member.json?.view.all).toBeNull();
    expect(JSON.stringify(member.json)).not.toContain('Tiny worlds');
    as('admin-1', true);
    const admin = await call('GET', SLUG);
    expect(admin.json?.view.mine).toEqual([]);
    expect(admin.json?.view.all).toEqual([
      {
        text: 'Deep sea',
        count: 2,
        suggesters: [
          { id: 'u1', name: 'Ada' },
          { id: 'u2', name: 'Bo' },
        ],
        onShortlist: false,
      },
      { text: 'Tiny worlds', count: 1, suggesters: [{ id: 'u3', name: 'Cy' }], onShortlist: false },
    ]);
  });
});

describe('the timeout, bans and blocks', () => {
  it('a member timed out from commenting cannot suggest, and nothing is written', async () => {
    as('u1');
    h.restricted = true;
    expect((await suggest('Deep sea')).status).toBe(403);
    expect(h.suggestions).toHaveLength(0);
  });

  it('a banned member is refused', async () => {
    as('u1');
    h.users.get('u1')!.bannedUntil = new Date(T0.getTime() + DAY);
    expect((await suggest('Deep sea')).status).toBe(403);
    h.users.get('u1')!.bannedUntil = new Date(T0.getTime() - DAY);
    expect((await suggest('Deep sea')).status).toBe(201);
  });

  it('a member who blocked the jam’s creator, or is blocked by them, is refused', async () => {
    as('u1');
    h.blocks = [{ blockerId: 'admin-1', blockedId: 'u1' }];
    expect((await suggest('Deep sea')).status).toBe(403);
    h.blocks = [{ blockerId: 'u1', blockedId: 'admin-1' }];
    expect((await suggest('Deep sea')).status).toBe(403);
    expect(h.suggestions).toHaveLength(0);
  });
});

describe('"On the shortlist" is withheld until the vote has opened', () => {
  it('hides it on the member’s own list and in the export before the vote opens, shows it after', async () => {
    const { suggestionsView, exportJamSuggestions } = await import('@/lib/competitive/jam-suggestions.server');
    seed('u1', 'Deep sea');
    h.candidates = [{ jamId: 'jam-1', text: 'deep sea' }];
    const before = await suggestionsView(SLUG, 'u1', false, T0);
    expect(before!.mine[0]!.shortlisted).toBe(false);
    const exportedBefore = await exportJamSuggestions('u1', T0);
    expect(exportedBefore[0]).toMatchObject({ text: 'Deep sea', shortlisted: false });
    // The admin knows regardless.
    expect((await suggestionsView(SLUG, 'admin-1', true, T0))!.all![0]!.onShortlist).toBe(true);

    const after = new Date(T0.getTime() + DAY);
    expect((await suggestionsView(SLUG, 'u1', false, after))!.mine[0]!.shortlisted).toBe(true);
    expect((await exportJamSuggestions('u1', after))[0]).toMatchObject({ shortlisted: true });
    const body = { view: after };
    assertJsonSafe(body);
  });
});

describe('export and erasure', () => {
  it('exports only the member’s own suggestions with the jam title, text and time', async () => {
    const { exportJamSuggestions } = await import('@/lib/competitive/jam-suggestions.server');
    h.jam = { ...h.jam!, title: 'Space jam' };
    seed('u1', 'Deep sea', 5);
    seed('u2', 'Not mine', 6);
    const rows = await exportJamSuggestions('u1', T0);
    assertJsonSafe(rows);
    expect(rows).toEqual([
      {
        jamTitle: 'Space jam',
        text: 'Deep sea',
        suggestedAt: new Date(T0.getTime() + 5).toISOString(),
        shortlisted: false,
      },
    ]);
  });

  it('the erasure operation deletes the member’s suggestions and nobody else’s', async () => {
    const { jamSuggestionErasureOps } = await import('@/lib/competitive/jam-suggestions.server');
    seed('u1', 'Deep sea');
    seed('u2', 'Tiny worlds');
    await Promise.all(jamSuggestionErasureOps('u1'));
    expect(h.suggestions.map((s) => s.userId)).toEqual(['u2']);
  });
});
