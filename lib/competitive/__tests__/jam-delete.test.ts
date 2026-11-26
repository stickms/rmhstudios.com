/**
 * s15-13 deleting a jam, through the real endpoint wrapper with Prisma, the lock, the audit write and the session
 * stood in for by fakes: admins only; refused once the jam has started or has an entry; one conditional delete inside the
 * jam's lock; the audit row written in the same transaction and naming the slug and title; and every relation to
 * `GameJam` in the schema cascades, so the shortlist, the votes and the suggestions go with it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-12-10T12:00:00Z');
const SLUG = 'space-jam-ab12c';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  jams: [] as { id: string; slug: string; title: string; startsAt: Date }[],
  entries: [] as { jamId: string }[],
  children: { candidates: 3, votes: 5, suggestions: 2 },
  audits: [] as { adminId: string; action: string; opts: Record<string, string | undefined>; inTx: boolean }[],
  lockKeys: [] as string[],
  inTx: 0,
  deletes: 0,
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(
    async (_tx: unknown, adminId: string, action: string, opts: Record<string, string | undefined>) => {
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
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.lockKeys.push(key);
  }),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const gameJam = {
    findUnique: vi.fn(
      async (a: { where: { id?: string; slug?: string } }) =>
        h.jams.find((j) => (a.where.id ? j.id === a.where.id : j.slug === a.where.slug)) ?? null,
    ),
    // The conditional delete: the id, a start in the future and no entry, evaluated as Postgres would.
    deleteMany: vi.fn(async (a: { where: { id: string; startsAt: { gt: Date }; entries: { none: object } } }) => {
      const jam = h.jams.find((j) => j.id === a.where.id);
      const hasEntry = h.entries.some((e) => e.jamId === a.where.id);
      if (!jam || jam.startsAt.getTime() <= a.where.startsAt.gt.getTime() || hasEntry) return { count: 0 };
      h.jams = h.jams.filter((j) => j.id !== a.where.id);
      h.children = { candidates: 0, votes: 0, suggestions: 0 };
      h.deletes += 1;
      return { count: 1 };
    }),
  };
  const client = {
    gameJam,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      h.inTx++;
      try {
        return await fn({ gameJam });
      } finally {
        h.inTx--;
      }
    },
  };
  return { prisma: shapeChecked(client) };
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function del(slug: string) {
  const { route } = await import('@/lib/competitive/api/jams.$slug.server');
  const handlers = route.handlers as Record<string, Handler>;
  const res = await handlers.DELETE!({
    request: new Request(`https://rmhstudios.com/api/jams/${slug}`, {
      method: 'DELETE',
      headers: { 'cf-connecting-ip': `${Math.random()}`, cookie: 'better-auth.session_token=abc' },
    }),
    params: { slug },
  });
  const text = await res.text();
  const json = (JSON.parse(text || 'null') ?? null) as Record<string, unknown> | null;
  if (json) assertJsonSafe(json);
  return { status: res.status, json };
}

const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h.session = null;
  h.jams = [{ id: 'jam-1', slug: SLUG, title: 'Space jam', startsAt: new Date(T0.getTime() + 3 * DAY) }];
  h.entries = [];
  h.children = { candidates: 3, votes: 5, suggestions: 2 };
  h.audits = [];
  h.lockKeys = [];
  h.inTx = 0;
  h.deletes = 0;
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member, and deletes nothing', async () => {
    expect((await del(SLUG)).status).toBe(401);
    h.session = { user: { id: 'u1', isAdmin: false } };
    expect((await del(SLUG)).status).toBe(403);
    expect(h.jams).toHaveLength(1);
    expect(h.audits).toEqual([]);
  });
});

describe('a jam that has not started', () => {
  it('is deleted under the jam’s lock, with one audit row naming the slug and title, in the same transaction', async () => {
    admin();
    const res = await del(SLUG);
    expect(res).toMatchObject({ status: 200, json: { ok: true } });
    expect(h.jams).toEqual([]);
    expect(h.lockKeys).toContain('game-jam:jam-1');
    expect(h.audits).toEqual([
      {
        adminId: 'admin-1',
        action: 'game-jam-delete',
        opts: { targetType: 'game_jam', targetId: 'jam-1', detail: `${SLUG}: Space jam` },
        inTx: true,
      },
    ]);
  });

  it('answers 404 for an unknown jam, and a second delete finds nothing', async () => {
    admin();
    expect((await del('nope')).status).toBe(404);
    expect((await del(SLUG)).status).toBe(200);
    expect((await del(SLUG)).status).toBe(404);
    expect(h.deletes).toBe(1);
  });

  it('takes its shortlist, votes and suggestions with it', async () => {
    admin();
    await del(SLUG);
    expect(h.children).toEqual({ candidates: 0, votes: 0, suggestions: 0 });
  });
});

describe('a jam that cannot be deleted', () => {
  it('is refused with JAM_DELETE_STARTED once it has started, and nothing is audited', async () => {
    admin();
    vi.setSystemTime(new Date(T0.getTime() + 3 * DAY));
    const res = await del(SLUG);
    expect(res.status).toBe(409);
    expect(res.json?.code).toBe('JAM_DELETE_STARTED');
    expect(h.jams).toHaveLength(1);
    expect(h.audits).toEqual([]);
  });

  it('is refused when it has an entry', async () => {
    admin();
    h.entries = [{ jamId: 'jam-1' }];
    const res = await del(SLUG);
    expect(res.json?.code).toBe('JAM_DELETE_STARTED');
    expect(h.jams).toHaveLength(1);
    expect(h.audits).toEqual([]);
  });
});

describe('cascade', () => {
  it('every relation to GameJam in the schema is onDelete: Cascade', () => {
    const dir = resolve(__dirname, '../../../prisma/schema');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n.endsWith('.prisma')) files.push(p);
      }
    };
    walk(dir);
    const relations = files
      .flatMap((f) => readFileSync(f, 'utf8').split('\n'))
      .filter((l) => /^\s+\w+\s+GameJam\s+@relation\(/.test(l));
    expect(relations.length).toBeGreaterThanOrEqual(4);
    for (const l of relations) expect(l, l).toContain('onDelete: Cascade');
  });
});
