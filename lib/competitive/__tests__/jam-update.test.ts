/**
 * s14-14 editing a game jam, through the real endpoint wrapper with Prisma, the audit write and the advisory lock
 * stood in for by fakes: admins only; each save audited inside the update's transaction with the changed field names
 * and never the secret theme; the theme not echoed; a phase that moved since the dialog opened refused; two saves
 * serialised by the jam's lock; the slug unchanged; `createJam` and the edit share one date rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

type Row = Record<string, unknown> & { id: string; slug: string };

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-12-10T12:00:00Z');
const SECRET = 'ZEBRA-CROSSING-SECRET';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  jams: [] as Row[],
  audits: [] as {
    adminId: string;
    action: string;
    opts: { targetType?: string; targetId?: string; detail?: string };
    inTx: boolean;
  }[],
  lockKeys: [] as string[],
  chain: new Map<string, Promise<void>>(),
  inTx: 0,
  created: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(
    async (
      _tx: unknown,
      adminId: string,
      action: string,
      opts: { targetType?: string; targetId?: string; detail?: string },
    ) => {
      h.audits.push({ adminId, action, opts, inTx: h.inTx > 0 });
    },
  ),
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/competitive/jam-feedback.server', () => ({
  myFeedbackFor: vi.fn(async () => ({})),
  feedbackCounts: vi.fn(async () => new Map()),
  notifyTeamOfFeedback: vi.fn(),
  saveFeedback: vi.fn(),
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
  const find = (where: { id?: string; slug?: string }) =>
    h.jams.find((j) => (where.id ? j.id === where.id : j.slug === where.slug)) ?? null;
  const pick = (row: Row | null, select?: Record<string, boolean>) => {
    if (!row) return null;
    if (!select) return { ...row };
    return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
  };
  const gameJam = {
    findUnique: vi.fn(async (a: { where: { id?: string; slug?: string }; select?: Record<string, boolean> }) =>
      pick(find(a.where), a.select),
    ),
    update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = find(a.where)!;
      Object.assign(row, a.data);
      return { ...row };
    }),
    create: vi.fn(async (a: { data: unknown }) => {
      h.created.push(a.data);
      return { slug: 'created-abc12' };
    }),
  };
  const empty = () => ({ findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) });
  const client = {
    gameJam,
    gameJamEntry: empty(),
    gameJamTeamMember: empty(),
    gameJamRating: empty(),
    userBuild: empty(),
    gameJamThemeCandidate: empty(),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { gameJam, held: [] as Array<() => void>, $executeRaw: vi.fn() };
      h.inTx++;
      try {
        return await fn(tx);
      } finally {
        h.inTx--;
        for (const release of tx.held) release();
      }
    },
  };
  return { prisma: shapeChecked(client) };
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function patch(slug: string, body: unknown) {
  const { route } = await import('@/lib/competitive/api/jams.$slug.server');
  const handlers = route.handlers as Record<string, Handler>;
  const res = await handlers.PATCH!({
    request: new Request(`https://rmhstudios.com/api/jams/${slug}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    }),
    params: { slug },
  });
  const text = await res.text();
  return { status: res.status, text, json: (JSON.parse(text || 'null') ?? null) as Record<string, unknown> | null };
}

const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};
const iso = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const jam = (over: Record<string, unknown> = {}): Row => ({
  id: 'jam-1',
  slug: 'space-jam-ab12c',
  title: 'Space jam',
  description: 'Build something small',
  theme: SECRET,
  startsAt: new Date(T0.getTime() + 3 * DAY),
  submitEndsAt: new Date(T0.getTime() + 6 * DAY),
  ratingEndsAt: new Date(T0.getTime() + 9 * DAY),
  createdById: 'admin-1',
  createdAt: new Date(T0.getTime() - DAY),
  themeVoting: false,
  themeVoteOpensAt: null,
  themeResolvedAt: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h.session = null;
  h.jams = [jam()];
  h.audits = [];
  h.lockKeys = [];
  h.chain = new Map();
  h.inTx = 0;
  h.created = [];
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member, and writes nothing', async () => {
    expect((await patch('space-jam-ab12c', { title: 'Hijack' })).status).toBe(401);
    h.session = { user: { id: 'u9', isAdmin: false } };
    expect((await patch('space-jam-ab12c', { title: 'Hijack' })).status).toBe(403);
    expect(h.jams[0]!.title).toBe('Space jam');
    expect(h.audits).toEqual([]);
  });

  it('answers an unknown jam with the not-found code', async () => {
    admin();
    const res = await patch('no-such-jam', { title: 'Nope here' });
    expect(res.status).toBe(404);
    expect(res.json?.code).toBe('NOT_FOUND');
  });
});

describe('before the start', () => {
  it('edits title, description, theme and dates at the same address, audited inside the transaction', async () => {
    admin();
    const res = await patch('space-jam-ab12c', {
      title: 'Ocean jam',
      description: 'Build something wet',
      theme: SECRET + '-2',
      submitEndsAt: iso(7 * DAY),
      ratingEndsAt: iso(10 * DAY),
    });
    expect(res.status).toBe(200);
    const row = h.jams[0]!;
    expect(row.slug).toBe('space-jam-ab12c');
    expect(row.title).toBe('Ocean jam');
    expect(row.theme).toBe(SECRET + '-2');
    expect((row.submitEndsAt as Date).toISOString()).toBe(iso(7 * DAY));
    const body = res.json as { jam: { slug: string; title: string; theme: string | null; phase: string } };
    assertJsonSafe(body);
    expect(body.jam).toMatchObject({ slug: 'space-jam-ab12c', title: 'Ocean jam', phase: 'upcoming' });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      adminId: 'admin-1',
      action: 'game-jam-edit',
      inTx: true,
      opts: { targetType: 'game_jam', targetId: 'jam-1', detail: 'title,description,theme,submitEndsAt,ratingEndsAt' },
    });
  });

  it('never returns or records the secret theme, old or new', async () => {
    admin();
    const res = await patch('space-jam-ab12c', { theme: 'BRAND-NEW-SECRET', title: 'Ocean jam' });
    expect(res.status).toBe(200);
    expect((res.json as { jam: { theme: unknown } }).jam.theme).toBeNull();
    for (const secret of [SECRET, 'BRAND-NEW-SECRET']) {
      expect(res.text).not.toContain(secret);
      expect(JSON.stringify(h.audits)).not.toContain(secret);
    }
  });

  it('keeps the slug whatever the body says', async () => {
    admin();
    const res = await patch('space-jam-ab12c', { slug: 'hijacked', title: 'Ocean jam' });
    expect(res.status).toBe(200);
    expect(h.jams[0]!.slug).toBe('space-jam-ab12c');
  });

  it('writes and audits nothing for a save that repeats the stored values', async () => {
    admin();
    const res = await patch('space-jam-ab12c', { title: 'Space jam', startsAt: iso(3 * DAY) });
    expect(res.status).toBe(200);
    expect(h.audits).toEqual([]);
  });

  it('refuses dates out of order with its code and changes nothing', async () => {
    admin();
    const res = await patch('space-jam-ab12c', { submitEndsAt: iso(2 * DAY) });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'JAM_DATES_ORDER' });
    expect((h.jams[0]!.submitEndsAt as Date).toISOString()).toBe(iso(6 * DAY));
    expect(h.audits).toEqual([]);
  });

  it('refuses a voting jam theme: the vote decides it', async () => {
    admin();
    h.jams = [jam({ themeVoting: true, themeVoteOpensAt: new Date(T0.getTime() + DAY), theme: 'First candidate' })];
    const res = await patch('space-jam-ab12c', { theme: 'My pick' });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
    expect(h.jams[0]!.theme).toBe('First candidate');
  });

  it('moves a vote that has not opened, and refuses an opening after the start', async () => {
    admin();
    h.jams = [jam({ themeVoting: true, themeVoteOpensAt: new Date(T0.getTime() + DAY), theme: 'First candidate' })];
    expect((await patch('space-jam-ab12c', { themeVoteOpensAt: iso(2 * DAY) })).status).toBe(200);
    const late = await patch('space-jam-ab12c', { themeVoteOpensAt: iso(4 * DAY) });
    expect(late.status).toBe(400);
    expect(late.json).toMatchObject({ code: 'JAM_VOTE_OPENS_LATE' });
    // Moving the start up to the opening time is the same refusal.
    const early = await patch('space-jam-ab12c', { startsAt: iso(2 * DAY - 1000) });
    expect(early.json).toMatchObject({ code: 'JAM_VOTE_OPENS_LATE' });
  });

  it('refuses the vote time once the vote has opened', async () => {
    admin();
    h.jams = [jam({ themeVoting: true, themeVoteOpensAt: new Date(T0.getTime() - DAY), theme: 'First candidate' })];
    const res = await patch('space-jam-ab12c', { themeVoteOpensAt: iso(2 * DAY) });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
  });
});

describe('after the start', () => {
  beforeEach(() => {
    admin();
    h.jams = [
      jam({
        startsAt: new Date(T0.getTime() - DAY),
        submitEndsAt: new Date(T0.getTime() + 2 * DAY),
        ratingEndsAt: new Date(T0.getTime() + 5 * DAY),
      }),
    ];
  });

  it('extends a deadline and the description, audited with those field names', async () => {
    const res = await patch('space-jam-ab12c', { submitEndsAt: iso(3 * DAY), description: 'Now with extra time' });
    expect(res.status).toBe(200);
    expect((h.jams[0]!.submitEndsAt as Date).toISOString()).toBe(iso(3 * DAY));
    expect(h.audits[0]?.opts.detail).toBe('description,submitEndsAt');
  });

  it('refuses a shorter deadline and keeps the old one', async () => {
    const res = await patch('space-jam-ab12c', { submitEndsAt: iso(DAY) });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'JAM_DEADLINE_SHORTER' });
    expect((h.jams[0]!.submitEndsAt as Date).toISOString()).toBe(iso(2 * DAY));
    expect(h.audits).toEqual([]);
  });

  it('refuses the theme, the title and the start', async () => {
    for (const body of [{ theme: 'Other' }, { title: 'Other title' }, { startsAt: iso(-2 * DAY) }]) {
      const res = await patch('space-jam-ab12c', body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.json).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
    }
    expect(h.audits).toEqual([]);
  });

  it('refuses a phase that moved since the dialog opened', async () => {
    // The dialog opened while the jam was upcoming; the save lands after the start.
    h.jams = [jam()];
    vi.setSystemTime(new Date(T0.getTime() + 4 * DAY));
    const res = await patch('space-jam-ab12c', { title: 'Late fix' });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
    expect(h.jams[0]!.title).toBe('Space jam');
  });

  it('refuses everything once rating has closed', async () => {
    vi.setSystemTime(new Date(T0.getTime() + 6 * DAY));
    const res = await patch('space-jam-ab12c', { description: 'Too late' });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
  });

  it('serialises two saves under the jam lock: a stale shortening cannot undo an extension', async () => {
    // Both dialogs opened on the same deadline (day 2). The first extends it to day 6; the second, which is an
    // extension of the old value, is now a shortening of the new one.
    const [a, b] = await Promise.all([
      patch('space-jam-ab12c', { submitEndsAt: iso(4 * DAY), ratingEndsAt: iso(7 * DAY) }),
      patch('space-jam-ab12c', { submitEndsAt: iso(3 * DAY) }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(409);
    expect(b.json).toMatchObject({ code: 'JAM_DEADLINE_SHORTER' });
    expect((h.jams[0]!.submitEndsAt as Date).toISOString()).toBe(iso(4 * DAY));
    expect(h.lockKeys.filter((k) => k === 'game-jam:jam-1')).toHaveLength(2);
  });
});

describe('the transaction', () => {
  it('takes the jam lock before it reads, and audits only a real change', async () => {
    admin();
    await patch('space-jam-ab12c', { title: 'Ocean jam' });
    expect(h.lockKeys[0]).toBe('game-jam:jam-1');
    expect(h.audits).toHaveLength(1);
  });
});

describe('createJam shares the date rule', () => {
  it('refuses out-of-order dates with the same code and creates nothing', async () => {
    const { createJam } = await import('@/lib/competitive/jams.server');
    const res = await createJam('admin-1', {
      title: 'Bad jam',
      description: 'x',
      theme: 'y',
      startsAt: new Date(T0.getTime() + 3 * DAY),
      submitEndsAt: new Date(T0.getTime() + 2 * DAY),
      ratingEndsAt: new Date(T0.getTime() + 9 * DAY),
    });
    expect(res).toMatchObject({ ok: false, code: 'JAM_DATES_ORDER' });
    expect(h.created).toEqual([]);
  });

  it('creates a jam whose dates are in order', async () => {
    const { createJam } = await import('@/lib/competitive/jams.server');
    const res = await createJam('admin-1', {
      title: 'Good jam',
      description: 'x',
      theme: 'y',
      startsAt: new Date(T0.getTime() + 2 * DAY),
      submitEndsAt: new Date(T0.getTime() + 3 * DAY),
      ratingEndsAt: new Date(T0.getTime() + 9 * DAY),
    });
    expect(res.ok).toBe(true);
    expect(h.created).toHaveLength(1);
  });
});
