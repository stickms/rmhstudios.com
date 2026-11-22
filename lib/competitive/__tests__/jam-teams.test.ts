import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Game jam teams: the cap is a cap under the lock, a member is on one entry per jam (accept and submit paths,
// under the member lock), a teammate cannot rate their own entry (server side, and out of the leaderboard),
// blocks and bans are refused, and nothing changes once submissions close.

interface Member {
  entryId: string;
  userId: string;
  jamId: string;
  status: string;
  invitedAt: Date;
  respondedAt: Date | null;
}
interface Entry {
  id: string;
  jamId: string;
  userId: string;
  buildId: string;
  title: string;
}
interface Rating {
  entryId: string;
  raterId: string;
  fun: number;
  creativity: number;
  theme: number;
  polish: number;
}

const h = vi.hoisted(() => ({
  jam: null as null | {
    id: string;
    slug: string;
    title: string;
    startsAt: Date;
    submitEndsAt: Date;
    ratingEndsAt: Date;
    theme: string;
    description: string;
  },
  entries: [] as Array<{ id: string; jamId: string; userId: string; buildId: string; title: string }>,
  members: [] as Array<{
    entryId: string;
    userId: string;
    jamId: string;
    status: string;
    invitedAt: Date;
    respondedAt: Date | null;
  }>,
  ratings: [] as Array<{
    entryId: string;
    raterId: string;
    fun: number;
    creativity: number;
    theme: number;
    polish: number;
  }>,
  users: new Map<string, { id: string; name: string; handle: string; image: null; bannedUntil: Date | null }>(),
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  builds: new Map<string, { userId: string; visibility: string; createdAt: Date }>(),
  log: [] as string[],
  locks: new Map<string, Promise<void>>(),
  notify: vi.fn(
    async (_n: { userId: string; entityType?: string; entityId?: string; preview?: string; link?: string }) => {},
  ),
}));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

vi.mock('@/lib/prisma.server', () => {
  const match = (row: Record<string, unknown>, w: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(w)) {
      if (k === 'OR') {
        if (!(v as Record<string, unknown>[]).some((alt) => match(row, alt))) return false;
      } else if (k === 'entry') {
        const e = h.entries.find((x) => x.id === row.entryId);
        if (!e || !match(e as unknown as Record<string, unknown>, v as Record<string, unknown>)) return false;
      } else if (v && typeof v === 'object' && 'in' in (v as object)) {
        if (!(v as { in: unknown[] }).in.includes(row[k])) return false;
      } else if (v && typeof v === 'object' && 'not' in (v as object)) {
        if (row[k] === (v as { not: unknown }).not) return false;
      } else if (row[k] !== v) return false;
    }
    return true;
  };
  const withUser = (m: Member) => ({
    ...m,
    user: h.users.get(m.userId) ?? { id: m.userId, name: null, handle: null, image: null },
  });
  const entryRow = (e: Entry) => ({
    ...e,
    build: { title: e.title },
    jam: h.jam,
    user: h.users.get(e.userId) ?? { id: e.userId },
  });
  const gameJamTeamMember = {
    async findUnique({ where: w }: { where: { entryId_userId: { entryId: string; userId: string } } }) {
      await tick();
      const k = w.entryId_userId;
      const r = h.members.find((m) => m.entryId === k.entryId && m.userId === k.userId);
      return r ? withUser(r) : null;
    },
    async findMany({ where: w }: { where: Record<string, unknown> }) {
      await tick();
      return h.members
        .filter((m) => match(m as unknown as Record<string, unknown>, w))
        .map((m) => ({
          ...withUser(m),
          entry: { build: { title: h.entries.find((e) => e.id === m.entryId)?.title } },
        }));
    },
    async count({ where: w }: { where: Record<string, unknown> }) {
      h.log.push('count');
      await tick();
      return h.members.filter((m) => match(m as unknown as Record<string, unknown>, w)).length;
    },
    async create({ data }: { data: { entryId: string; userId: string; jamId: string; status: string } }) {
      h.log.push('create');
      await tick();
      const row: Member = { ...data, invitedAt: new Date(), respondedAt: null };
      h.members.push(row);
      return withUser(row);
    },
    async updateMany({ where: w, data }: { where: Record<string, unknown>; data: Partial<Member> }) {
      await tick();
      const hit = h.members.filter((m) => match(m as unknown as Record<string, unknown>, w));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    },
    async deleteMany({ where: w }: { where: Record<string, unknown> }) {
      await tick();
      const hit = h.members.filter((m) => match(m as unknown as Record<string, unknown>, w));
      for (const r of hit) h.members.splice(h.members.indexOf(r), 1);
      return { count: hit.length };
    },
  };
  const gameJamEntry = {
    async findUnique({ where: w }: { where: { id?: string; jamId_userId?: { jamId: string; userId: string } } }) {
      await tick();
      const e = w.id
        ? h.entries.find((x) => x.id === w.id)
        : h.entries.find((x) => x.jamId === w.jamId_userId!.jamId && x.userId === w.jamId_userId!.userId);
      return e ? entryRow(e) : null;
    },
    async findMany() {
      await tick();
      return h.entries.map(entryRow);
    },
    async upsert({
      where: w,
      create,
      update,
    }: {
      where: { jamId_userId: { jamId: string; userId: string } };
      create: { jamId: string; userId: string; buildId: string };
      update: { buildId: string };
    }) {
      h.log.push('upsert-entry');
      await tick();
      const e = h.entries.find((x) => x.jamId === w.jamId_userId.jamId && x.userId === w.jamId_userId.userId);
      if (e) Object.assign(e, update);
      else h.entries.push({ id: `entry-${create.userId}`, ...create, title: `${create.userId}'s game` });
    },
  };
  const gameJamRating = {
    async upsert({
      where: w,
      create,
      update,
    }: {
      where: { entryId_raterId: { entryId: string; raterId: string } };
      create: Rating;
      update: Partial<Rating>;
    }) {
      await tick();
      const r = h.ratings.find(
        (x) => x.entryId === w.entryId_raterId.entryId && x.raterId === w.entryId_raterId.raterId,
      );
      if (r) Object.assign(r, update);
      else h.ratings.push({ ...create });
    },
    async deleteMany({ where: w }: { where: Record<string, unknown> }) {
      await tick();
      const hit = h.ratings.filter((r) => match(r as unknown as Record<string, unknown>, w));
      for (const r of hit) h.ratings.splice(h.ratings.indexOf(r), 1);
      return { count: hit.length };
    },
    async findMany({ where: w }: { where: Record<string, unknown> }) {
      await tick();
      return h.ratings.filter((r) => match(r as unknown as Record<string, unknown>, w));
    },
    async groupBy() {
      const by = new Map<string, Rating[]>();
      for (const r of h.ratings) by.set(r.entryId, [...(by.get(r.entryId) ?? []), r]);
      return [...by.entries()].map(([entryId, rows]) => ({
        entryId,
        _count: { _all: rows.length },
        _sum: {
          fun: rows.reduce((s, r) => s + r.fun, 0),
          creativity: rows.reduce((s, r) => s + r.creativity, 0),
          theme: rows.reduce((s, r) => s + r.theme, 0),
          polish: rows.reduce((s, r) => s + r.polish, 0),
        },
      }));
    },
  };
  const gameJam = {
    async findUnique() {
      await tick();
      return h.jam ? { ...h.jam } : null;
    },
  };
  const user = {
    async findUnique({ where: w }: { where: { id: string } }) {
      await tick();
      return h.users.get(w.id) ?? null;
    },
  };
  const userBlock = {
    async findFirst({ where: w }: { where: { OR: Array<{ blockerId: string; blockedId: string }> } }) {
      await tick();
      return h.blocks.find((b) => w.OR.some((o) => o.blockerId === b.blockerId && o.blockedId === b.blockedId)) ?? null;
    },
  };
  const userBuild = {
    async findUnique({ where: w }: { where: { id: string } }) {
      await tick();
      return h.builds.get(w.id) ?? null;
    },
    async findMany() {
      return [];
    },
  };
  // s06-07: the jam page also reads feedback (the viewer's own, and the team's count); this suite writes none.
  const gameJamFeedback = {
    async findMany() {
      return [];
    },
    async groupBy() {
      return [];
    },
  };
  const models = {
    gameJamTeamMember,
    gameJamEntry,
    gameJamRating,
    gameJam,
    user,
    userBlock,
    userBuild,
    gameJamFeedback,
  };
  const db = {
    ...models,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const held: (() => void)[] = [];
      const tx = {
        ...models,
        async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          if (!strings.join('?').includes('pg_advisory_xact_lock')) return 0;
          const key = String(values[0]);
          h.log.push(`lock:${key}`);
          while (h.locks.has(key)) await h.locks.get(key);
          let release!: () => void;
          h.locks.set(key, new Promise<void>((resolve) => (release = resolve)));
          held.push(() => {
            h.locks.delete(key);
            release();
          });
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        for (const release of held) release();
      }
    },
  };
  return { prisma: db };
});
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: { id: string; name?: string }) => ({ id: u.id, name: u.name ?? null, image: null, handle: null }),
}));

import {
  inviteTeammate,
  leaveTeam,
  listTeam,
  removeTeammate,
  respondToTeamInvite,
} from '@/lib/competitive/jam-teams.server';
import { MAX_TEAMMATES } from '@/lib/competitive/jam-teams';
import { getJam, rateEntry, submitEntry } from '@/lib/competitive/jams.server';

const DAY = 86_400_000;
const scores = { fun: 5, creativity: 5, theme: 5, polish: 5 };

function setupJam(phase: 'open' | 'rating' | 'done' = 'open') {
  const now = Date.now();
  const w = {
    open: [-DAY, DAY, 2 * DAY],
    rating: [-2 * DAY, -DAY, DAY],
    done: [-3 * DAY, -2 * DAY, -DAY],
  }[phase];
  h.jam = {
    id: 'j1',
    slug: 'jam',
    title: 'Spring jam',
    description: '',
    theme: 'Water',
    startsAt: new Date(now + w[0]!),
    submitEndsAt: new Date(now + w[1]!),
    ratingEndsAt: new Date(now + w[2]!),
  };
}

const user = (id: string, over: Partial<{ bannedUntil: Date | null }> = {}) =>
  h.users.set(id, { id, name: id, handle: id, image: null, bannedUntil: null, ...over });
const addEntry = (id: string, userId: string) =>
  h.entries.push({ id, jamId: 'j1', userId, buildId: `b-${id}`, title: `${id} game` });
const addMember = (entryId: string, userId: string, status: 'invited' | 'accepted') =>
  h.members.push({ entryId, userId, jamId: 'j1', status, invitedAt: new Date(), respondedAt: null });
const statusOf = (entryId: string, userId: string) =>
  h.members.find((m) => m.entryId === entryId && m.userId === userId)?.status;
const invite = (userId: string, entryId = 'e1', actorId = 'owner') =>
  inviteTeammate({ slug: 'jam', entryId, actorId, userId });
const respond = (userId: string, accept: boolean, entryId = 'e1') =>
  respondToTeamInvite({ slug: 'jam', entryId, userId, accept });

beforeEach(() => {
  h.entries.length = 0;
  h.members.length = 0;
  h.ratings.length = 0;
  h.users.clear();
  h.blocks.length = 0;
  h.builds.clear();
  h.log.length = 0;
  h.locks.clear();
  h.notify.mockClear();
  setupJam('open');
  for (const id of ['owner', 'a', 'b', 'c', 'd', 'rival']) user(id);
  addEntry('e1', 'owner');
  addEntry('e2', 'rival');
});

describe('inviting', () => {
  it('the submitter invites a member, who is notified once with a link to the jam; repeating it changes nothing', async () => {
    const first = await invite('a');
    expect(first.ok && first.value.status).toBe('invited');
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({
      userId: 'a',
      entityType: 'jam_team',
      entityId: 'e1',
      link: '/jams/jam',
    });
    expect(noticeFallbackText(h.notify.mock.calls[0]![0].preview as never)).toContain(
      'added you to their entry in Spring jam',
    );

    expect((await invite('a')).ok).toBe(true);
    expect(h.members).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('takes the member lock, then the entry lock, before it counts', async () => {
    await invite('a');
    const member = h.log.indexOf('lock:jam-team:j1:a');
    const entry = h.log.indexOf('lock:jam-entry-team:e1');
    expect(member).toBeGreaterThanOrEqual(0);
    expect(entry).toBeGreaterThan(member);
    expect(entry).toBeLessThan(h.log.indexOf('count'));
  });

  it('refuses a fourth teammate, counting invited and accepted alike', async () => {
    addMember('e1', 'a', 'accepted');
    addMember('e1', 'b', 'accepted');
    addMember('e1', 'c', 'invited');
    expect(MAX_TEAMMATES).toBe(3);
    expect(await invite('d')).toEqual({ ok: false, code: 'full' });
    expect(h.members).toHaveLength(3);
  });

  it('two racing invitations cannot both take the last place', async () => {
    addMember('e1', 'a', 'accepted');
    addMember('e1', 'b', 'accepted');
    const results = await Promise.all([invite('c'), invite('d')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'full')).toHaveLength(1);
    expect(h.members).toHaveLength(3);
  });

  it('refuses a block in either direction and leaves nothing behind', async () => {
    h.blocks.push({ blockerId: 'owner', blockedId: 'a' }, { blockerId: 'b', blockedId: 'owner' });
    expect(await invite('a')).toEqual({ ok: false, code: 'blocked' });
    expect(await invite('b')).toEqual({ ok: false, code: 'blocked' });
    expect(h.members).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refuses a banned member, but not one whose ban has lapsed', async () => {
    user('a', { bannedUntil: new Date(Date.now() + DAY) });
    user('b', { bannedUntil: new Date(Date.now() - DAY) });
    expect(await invite('a')).toEqual({ ok: false, code: 'banned' });
    expect((await invite('b')).ok).toBe(true);
  });

  it('refuses the submitter, an unknown member, a non-submitter and an unknown entry', async () => {
    expect(await invite('owner')).toEqual({ ok: false, code: 'self' });
    expect(await invite('nobody')).toEqual({ ok: false, code: 'user-not-found' });
    addMember('e1', 'a', 'accepted');
    expect(await invite('b', 'e1', 'a')).toEqual({ ok: false, code: 'not-owner' });
    expect(await invite('b', 'e1', 'rival')).toEqual({ ok: false, code: 'not-owner' });
    expect(await invite('b', 'e-none')).toEqual({ ok: false, code: 'not-found' });
    expect(await inviteTeammate({ slug: 'other', entryId: 'e1', actorId: 'owner', userId: 'b' })).toEqual({
      ok: false,
      code: 'not-found',
    });
  });
});

describe('one entry per member per jam', () => {
  it('refuses an invitation to a member who already submitted their own entry, naming it', async () => {
    const r = await invite('rival');
    expect(r).toEqual({ ok: false, code: 'already-on-entry', entryTitle: 'e2 game' });
    expect(h.members).toHaveLength(0);
  });

  it('refuses an invitation to a member who accepted another entry', async () => {
    addMember('e2', 'a', 'accepted');
    expect(await invite('a')).toEqual({ ok: false, code: 'already-on-entry', entryTitle: 'e2 game' });
  });

  it('accepting while on another entry is refused, and the invitation stays pending', async () => {
    addMember('e1', 'a', 'invited');
    addMember('e2', 'a', 'accepted');
    expect(await respond('a', true)).toEqual({ ok: false, code: 'already-on-entry', entryTitle: 'e2 game' });
    expect(statusOf('e1', 'a')).toBe('invited');
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a member invited to two entries can accept only one; accepting drops the other invitation', async () => {
    addMember('e1', 'a', 'invited');
    addMember('e2', 'a', 'invited');
    expect((await respond('a', true, 'e1')).ok).toBe(true);
    expect(statusOf('e1', 'a')).toBe('accepted');
    expect(statusOf('e2', 'a')).toBeUndefined();
    expect(await respond('a', true, 'e2')).toEqual({ ok: false, code: 'no-invite' });
  });

  it('two accepts at once, on two entries, put the member on one', async () => {
    addMember('e1', 'a', 'invited');
    addMember('e2', 'a', 'invited');
    const results = await Promise.all([respond('a', true, 'e1'), respond('a', true, 'e2')]);
    expect(h.members.filter((m) => m.userId === 'a' && m.status === 'accepted')).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(h.log).toContain('lock:jam-team:j1:a');
  });

  it('submitting an entry while credited on another is refused under the member lock', async () => {
    user('a');
    h.builds.set('b1', { userId: 'a', visibility: 'PUBLIC', createdAt: new Date(Date.now() - DAY / 2) });
    addMember('e1', 'a', 'accepted');
    const r = await submitEntry('jam', 'a', 'b1');
    expect(r).toEqual({ ok: false, error: 'You are already on e1 game', status: 409 });
    expect(h.entries.find((e) => e.userId === 'a')).toBeUndefined();
    expect(h.log).toContain('lock:jam-team:j1:a');
  });

  it('a racing accept and submit leave the member on one entry', async () => {
    user('a');
    h.builds.set('b1', { userId: 'a', visibility: 'PUBLIC', createdAt: new Date(Date.now() - DAY / 2) });
    addMember('e1', 'a', 'invited');
    await Promise.all([respond('a', true), submitEntry('jam', 'a', 'b1')]);
    const own = h.entries.some((e) => e.userId === 'a');
    const accepted = statusOf('e1', 'a') === 'accepted';
    expect(own && accepted).toBe(false);
    expect(own || accepted).toBe(true);
  });

  it('submitting a first entry withdraws the member’s pending invitations; swapping a build does not', async () => {
    user('a');
    h.builds.set('b1', { userId: 'a', visibility: 'PUBLIC', createdAt: new Date(Date.now() - DAY / 2) });
    addMember('e2', 'a', 'invited');
    expect((await submitEntry('jam', 'a', 'b1')).ok).toBe(true);
    expect(h.members).toHaveLength(0);
    addMember('e1', 'a', 'invited');
    expect((await submitEntry('jam', 'a', 'b1')).ok).toBe(true);
    expect(h.members).toHaveLength(1);
  });
});

describe('answering an invitation', () => {
  it('accepting credits them and tells the submitter once; two accepts at once notify once', async () => {
    addMember('e1', 'a', 'invited');
    await Promise.all([respond('a', true), respond('a', true)]);
    expect(statusOf('e1', 'a')).toBe('accepted');
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({ userId: 'owner', entityType: 'jam_team', link: '/jams/jam' });
  });

  it('declining deletes the invitation and tells nobody', async () => {
    addMember('e1', 'a', 'invited');
    expect((await respond('a', false)).ok).toBe(true);
    expect(h.members).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('an accept re-checks the block and the ban', async () => {
    addMember('e1', 'a', 'invited');
    addMember('e1', 'b', 'invited');
    h.blocks.push({ blockerId: 'a', blockedId: 'owner' });
    user('b', { bannedUntil: new Date(Date.now() + DAY) });
    expect(await respond('a', true)).toEqual({ ok: false, code: 'blocked' });
    expect(await respond('b', true)).toEqual({ ok: false, code: 'banned' });
    expect(statusOf('e1', 'a')).toBe('invited');
  });

  it('there is nothing to answer without an invitation, and a teammate cannot decline', async () => {
    expect(await respond('a', true)).toEqual({ ok: false, code: 'no-invite' });
    addMember('e1', 'a', 'accepted');
    expect(await respond('a', false)).toEqual({ ok: false, code: 'already-accepted' });
    expect(statusOf('e1', 'a')).toBe('accepted');
  });

  it('accepting deletes a rating the member gave this entry while merely invited', async () => {
    addMember('e1', 'a', 'invited');
    h.ratings.push({ entryId: 'e1', raterId: 'a', ...scores }, { entryId: 'e2', raterId: 'a', ...scores });
    await respond('a', true);
    expect(h.ratings.map((r) => r.entryId)).toEqual(['e2']);
  });
});

describe('rating', () => {
  it('a teammate cannot rate their own entry, even by calling the endpoint function directly', async () => {
    addMember('e1', 'a', 'accepted');
    expect(await rateEntry('jam', 'a', 'e1', scores)).toEqual({
      ok: false,
      error: 'You cannot rate your own entry',
      status: 403,
    });
    expect(h.ratings).toHaveLength(0);
  });

  it('the submitter still cannot, and takes the member lock before it writes', async () => {
    expect((await rateEntry('jam', 'owner', 'e1', scores)).ok).toBe(false);
    addMember('e2', 'a', 'accepted');
    expect((await rateEntry('jam', 'a', 'e1', scores)).ok).toBe(true);
    expect(h.log).toContain('lock:jam-team:j1:a');
    expect(h.ratings).toHaveLength(1);
  });

  it('an invited (unaccepted) member, and a teammate of another entry, may rate', async () => {
    addMember('e1', 'a', 'invited');
    addMember('e2', 'b', 'accepted');
    expect((await rateEntry('jam', 'a', 'e1', scores)).ok).toBe(true);
    expect((await rateEntry('jam', 'b', 'e1', scores)).ok).toBe(true);
  });

  it('a teammate’s rating cannot be written by an accept racing a rating', async () => {
    addMember('e1', 'a', 'invited');
    await Promise.all([respond('a', true), rateEntry('jam', 'a', 'e1', scores)]);
    expect(statusOf('e1', 'a')).toBe('accepted');
    expect(h.ratings.filter((r) => r.entryId === 'e1' && r.raterId === 'a')).toHaveLength(0);
  });

  it('the results leave out any rating from the entry’s own team', async () => {
    setupJam('done');
    addMember('e1', 'a', 'accepted');
    h.ratings.push(
      { entryId: 'e1', raterId: 'a', fun: 5, creativity: 5, theme: 5, polish: 5 },
      { entryId: 'e1', raterId: 'owner', fun: 5, creativity: 5, theme: 5, polish: 5 },
      { entryId: 'e1', raterId: 'c', fun: 1, creativity: 1, theme: 1, polish: 1 },
      { entryId: 'e1', raterId: 'd', fun: 3, creativity: 3, theme: 3, polish: 3 },
    );
    const jam = await getJam('jam', 'c');
    const row = jam!.entries.find((e) => e.id === 'e1')!;
    expect(row.ratingCount).toBe(2);
    expect(row.averages).toEqual({ fun: 2, creativity: 2, theme: 2, polish: 2 });
    expect(row.score).toBe(2);
  });
});

describe('what the jam page shows', () => {
  it('credits accepted teammates on the entry, not invited ones, and says what the viewer is', async () => {
    addMember('e1', 'a', 'accepted');
    addMember('e1', 'b', 'invited');
    const asA = await getJam('jam', 'a');
    const row = asA!.entries.find((e) => e.id === 'e1')!;
    expect(row.team.map((u) => u.id)).toEqual(['a']);
    expect(row.viewerTeamState).toBe('teammate');
    expect(row.rateable).toBe(false);
    expect(asA!.teamEntryId).toBe('e1');

    const asB = await getJam('jam', 'b');
    expect(asB!.entries.find((e) => e.id === 'e1')!.viewerTeamState).toBe('invited');
    expect(asB!.entries.find((e) => e.id === 'e1')!.team.map((u) => u.id)).toEqual(['a']);

    const asOwner = await getJam('jam', 'owner');
    expect(asOwner!.entries.find((e) => e.id === 'e1')!.viewerTeamState).toBe('owner');
    const asStranger = await getJam('jam', 'c');
    const strangerRow = asStranger!.entries.find((e) => e.id === 'e1')!;
    expect(strangerRow.viewerTeamState).toBeNull();
    expect(strangerRow.rateable).toBe(true);
    expect((await getJam('jam', null))!.entries.find((e) => e.id === 'e1')!.rateable).toBe(false);
  });
});

describe('after submissions close', () => {
  beforeEach(() => setupJam('rating'));

  it('refuses every write and changes nothing', async () => {
    addMember('e1', 'a', 'invited');
    addMember('e1', 'b', 'accepted');
    expect(await invite('c')).toEqual({ ok: false, code: 'closed' });
    expect(await respond('a', true)).toEqual({ ok: false, code: 'closed' });
    expect(await respond('a', false)).toEqual({ ok: false, code: 'closed' });
    expect(await removeTeammate({ slug: 'jam', entryId: 'e1', actorId: 'owner', userId: 'b' })).toEqual({
      ok: false,
      code: 'closed',
    });
    expect(await leaveTeam({ slug: 'jam', entryId: 'e1', userId: 'b' })).toEqual({ ok: false, code: 'closed' });
    expect(h.members.map((m) => `${m.userId}:${m.status}`)).toEqual(['a:invited', 'b:accepted']);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('reads stay open', async () => {
    addMember('e1', 'b', 'accepted');
    const r = await listTeam({ slug: 'jam', entryId: 'e1', actorId: null });
    expect(r.ok && r.value.map((m) => m.id)).toEqual(['b']);
  });
});

describe('removing, leaving and listing', () => {
  it('the submitter removes a teammate or withdraws an invitation; nobody else can', async () => {
    addMember('e1', 'a', 'accepted');
    addMember('e1', 'b', 'invited');
    expect(await removeTeammate({ slug: 'jam', entryId: 'e1', actorId: 'a', userId: 'b' })).toEqual({
      ok: false,
      code: 'not-owner',
    });
    expect((await removeTeammate({ slug: 'jam', entryId: 'e1', actorId: 'owner', userId: 'a' })).ok).toBe(true);
    expect((await removeTeammate({ slug: 'jam', entryId: 'e1', actorId: 'owner', userId: 'b' })).ok).toBe(true);
    expect(h.members).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a member leaves only their own row, and may then be invited again', async () => {
    addMember('e1', 'a', 'accepted');
    addMember('e1', 'b', 'accepted');
    expect((await leaveTeam({ slug: 'jam', entryId: 'e1', userId: 'a' })).ok).toBe(true);
    expect(h.members.map((m) => m.userId)).toEqual(['b']);
    expect((await invite('a')).ok).toBe(true);
  });

  it('lists pending invitations to the submitter and the invitee only', async () => {
    addMember('e1', 'a', 'accepted');
    addMember('e1', 'b', 'invited');
    addMember('e1', 'c', 'invited');
    const ids = async (actorId: string | null) => {
      const r = await listTeam({ slug: 'jam', entryId: 'e1', actorId });
      return r.ok ? r.value.map((m) => m.id).sort() : r.code;
    };
    expect(await ids('owner')).toEqual(['a', 'b', 'c']);
    expect(await ids('b')).toEqual(['a', 'b']);
    expect(await ids('d')).toEqual(['a']);
    expect(await ids(null)).toEqual(['a']);
    expect(await listTeam({ slug: 'jam', entryId: 'zzz', actorId: 'owner' })).toEqual({ ok: false, code: 'not-found' });
  });
});
