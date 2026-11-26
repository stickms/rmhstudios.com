/**
 * s15-07 telling a jam's entrants that a deadline moved: a save after the start that changes `submitEndsAt` or
 * `ratingEndsAt` tells each entrant and accepted teammate (not an invited one, not the admin who saved) once with the
 * new times, at most 500 a save; a description-only edit and any edit before the start tell nobody; the notice's
 * params are the title and the two times only. Prisma is an in-memory fake wrapped in `shapeChecked`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICE_TEMPLATES, noticeParamNames } from '@/lib/notifications/notice-keys';

type Row = Record<string, unknown> & { id: string };

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-12-10T12:00:00Z');
const SECRET_THEME = 'ZEBRA-CROSSING-SECRET';

const h = vi.hoisted(() => ({
  jams: [] as Row[],
  entries: [] as { userId: string; jamId: string }[],
  team: [] as { userId: string; jamId: string; status: string }[],
  unavailable: [] as string[],
  notices: [] as Record<string, unknown>[],
  failFor: null as string | null,
  reads: [] as { model: string; args: Record<string, unknown> }[],
}));

vi.mock('@/lib/admin-audit.server', () => ({ recordAdminActionIn: vi.fn(async () => {}) }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => {}) }));
vi.mock('@/lib/competitive/jam-feedback.server', () => ({
  myFeedbackFor: vi.fn(async () => ({})),
  feedbackCounts: vi.fn(async () => new Map()),
  notifyTeamOfFeedback: vi.fn(),
  saveFeedback: vi.fn(),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    if (input.userId === h.failFor) throw new Error('push is down');
    h.notices.push(input);
  }),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const find = (where: { id?: string; slug?: string }) =>
    h.jams.find((j) => (where.id ? j.id === where.id : j.slug === where.slug)) ?? null;
  const gameJam = {
    findUnique: vi.fn(async (a: { where: { id?: string; slug?: string }; select?: Record<string, boolean> }) => {
      const row = find(a.where);
      if (!row) return null;
      return a.select ? Object.fromEntries(Object.keys(a.select).map((k) => [k, row[k]])) : { ...row };
    }),
    update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = find(a.where)!;
      Object.assign(row, a.data);
      return { ...row };
    }),
  };
  type Args = { where: { jamId: string; status?: string }; distinct?: string[]; take?: number };
  const members = (model: string, source: () => { userId: string; jamId: string; status?: string }[]) => ({
    findMany: vi.fn(async (a: Args) => {
      h.reads.push({ model, args: a as unknown as Record<string, unknown> });
      let rows = source().filter(
        (r) => r.jamId === a.where.jamId && (a.where.status === undefined || r.status === a.where.status),
      );
      if (a.distinct?.includes('userId'))
        rows = rows.filter((r, i) => rows.findIndex((x) => x.userId === r.userId) === i);
      rows = [...rows].sort((x, y) => x.userId.localeCompare(y.userId));
      return rows.slice(0, a.take ?? rows.length).map((r) => ({ userId: r.userId }));
    }),
  });
  const user = {
    findMany: vi.fn(async (a: { where: { id: { in: string[] } } }) =>
      a.where.id.in.filter((id) => h.unavailable.includes(id)).map((id) => ({ id })),
    ),
  };
  const client = {
    gameJam,
    user,
    gameJamEntry: members('entry', () => h.entries),
    gameJamTeamMember: members('team', () => h.team),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ gameJam }),
  };
  return { prisma: shapeChecked(client) };
});

import { updateJam } from '@/lib/competitive/jams.server';
import { MAX_JAM_RECIPIENTS } from '@/lib/competitive/jam-notices.server';

const iso = (ms: number) => new Date(T0.getTime() + ms);
const jam = (over: Record<string, unknown> = {}): Row => ({
  id: 'jam-1',
  slug: 'space-jam-ab12c',
  title: 'Space jam',
  description: 'Build something small',
  theme: SECRET_THEME,
  // Running: started a day ago, submissions close in 5 days, ratings in 8.
  startsAt: iso(-DAY),
  submitEndsAt: iso(5 * DAY),
  ratingEndsAt: iso(8 * DAY),
  themeVoting: false,
  themeVoteOpensAt: null,
  ...over,
});
const entrant = (userId: string) => h.entries.push({ userId, jamId: 'jam-1' });
const teammate = (userId: string, status = 'accepted') => h.team.push({ userId, jamId: 'jam-1', status });
const userIds = () => h.notices.map((n) => n.userId as string).sort();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h.jams = [jam()];
  h.entries = [];
  h.team = [];
  h.unavailable = [];
  h.notices = [];
  h.failFor = null;
  h.reads = [];
});

describe('a deadline moved after the start', () => {
  it('tells each entrant and accepted teammate once, with the new times, and nobody else', async () => {
    entrant('u1');
    entrant('u2');
    entrant('admin-1'); // the admin who saves is also an entrant: not told
    teammate('u3');
    teammate('u4', 'invited'); // an invitation is not a stake yet
    teammate('u2'); // both an entrant and a teammate: told once
    const out = await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(6 * DAY) });
    expect(out).toEqual({ ok: true, changed: ['submitEndsAt'] });
    expect(userIds()).toEqual(['u1', 'u2', 'u3']);

    const n = h.notices[0] as {
      type: string;
      entityType: string;
      entityId: string;
      link: string;
      preview: { key: string; params: Record<string, unknown>; fallback: string };
    };
    expect(n).toMatchObject({
      type: 'SYSTEM',
      entityType: 'jam_deadline',
      entityId: 'jam-1',
      link: '/jams/space-jam-ab12c',
    });
    expect(n.preview.key).toBe('jam-deadline-moved');
    // The new submission time and the unchanged rating time, as ISO strings.
    expect(n.preview.params).toEqual({
      title: 'Space jam',
      submitEndsAt: iso(6 * DAY).toISOString(),
      ratingEndsAt: iso(8 * DAY).toISOString(),
    });
    for (const name of noticeParamNames(NOTICE_TEMPLATES['jam-deadline-moved'])) {
      expect(n.preview.params).toHaveProperty(name);
    }
    expect(n.preview.fallback).toContain('Space jam moved its deadlines');
  });

  it('tells them when only the rating deadline moved, too', async () => {
    entrant('u1');
    await updateJam('admin-1', 'space-jam-ab12c', { ratingEndsAt: iso(9 * DAY) });
    expect(userIds()).toEqual(['u1']);
    expect((h.notices[0]!.preview as { params: Record<string, unknown> }).params.ratingEndsAt).toBe(
      iso(9 * DAY).toISOString(),
    );
  });

  it('reads entrants and accepted teammates with one distinct findMany each', async () => {
    entrant('u1');
    teammate('u2');
    await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(6 * DAY) });
    expect(h.reads.map((r) => r.model).sort()).toEqual(['entry', 'team']);
    for (const r of h.reads) expect(r.args).toMatchObject({ distinct: ['userId'] });
    expect(h.reads.find((r) => r.model === 'team')!.args).toMatchObject({ where: { status: 'accepted' } });
  });

  it('carries the title and the two times and never the theme', async () => {
    entrant('u1');
    await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(6 * DAY) });
    const preview = h.notices[0]!.preview as { params: Record<string, unknown>; fallback: string };
    expect(Object.keys(preview.params).sort()).toEqual(['ratingEndsAt', 'submitEndsAt', 'title']);
    expect(JSON.stringify(h.notices)).not.toContain(SECRET_THEME);
  });

  it('tells at most 500 members a save, and logs that some were left out', async () => {
    for (let i = 0; i < MAX_JAM_RECIPIENTS + 100; i++) entrant(`e${String(i).padStart(4, '0')}`);
    for (let i = 0; i < 50; i++) teammate(`t${String(i).padStart(4, '0')}`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(6 * DAY) });
    expect(h.notices).toHaveLength(MAX_JAM_RECIPIENTS);
    expect(new Set(userIds()).size).toBe(MAX_JAM_RECIPIENTS);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('skips banned members and members waiting to be deleted', async () => {
    entrant('u1');
    entrant('u2');
    teammate('u3');
    h.unavailable = ['u2', 'u3'];
    await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(6 * DAY) });
    expect(userIds()).toEqual(['u1']);
  });

  it('keeps the save when a notice fails, and still tells the others', async () => {
    entrant('u1');
    entrant('u2');
    h.failFor = 'u1';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(6 * DAY) });
    expect(out.ok).toBe(true);
    expect((h.jams[0]!.submitEndsAt as Date).toISOString()).toBe(iso(6 * DAY).toISOString());
    expect(userIds()).toEqual(['u2']);
    spy.mockRestore();
  });

  it('does not tell anyone when the save is refused', async () => {
    entrant('u1');
    const out = await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(2 * DAY) }); // earlier: refused
    expect(out.ok).toBe(false);
    expect(h.notices).toEqual([]);
  });
});

describe('nobody is told', () => {
  it('for a description-only edit after the start', async () => {
    entrant('u1');
    teammate('u2');
    const out = await updateJam('admin-1', 'space-jam-ab12c', { description: 'Now with more rules' });
    expect(out).toEqual({ ok: true, changed: ['description'] });
    expect(h.notices).toEqual([]);
    expect(h.reads).toEqual([]);
  });

  it('for a save that repeats the stored deadlines', async () => {
    entrant('u1');
    const out = await updateJam('admin-1', 'space-jam-ab12c', { submitEndsAt: iso(5 * DAY) });
    expect(out).toEqual({ ok: true, changed: [] });
    expect(h.notices).toEqual([]);
  });

  it('for an edit before the start, whatever it changes', async () => {
    h.jams = [jam({ startsAt: iso(3 * DAY), submitEndsAt: iso(6 * DAY), ratingEndsAt: iso(9 * DAY) })];
    entrant('u1');
    teammate('u2');
    const out = await updateJam('admin-1', 'space-jam-ab12c', {
      title: 'Ocean jam',
      submitEndsAt: iso(7 * DAY),
      ratingEndsAt: iso(10 * DAY),
    });
    expect(out.ok).toBe(true);
    expect(h.notices).toEqual([]);
  });
});
