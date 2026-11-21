import { beforeEach, describe, expect, it, vi } from 'vitest';

// Written feedback on jam entries: only raters write (never the submitter or a teammate), the words are saved
// with the scores, an edit after rating closes is refused, outsiders cannot list or flag it, an anonymous author
// id never leaves the server (an admin still sees it), a blocked pair is refused, and the team is notified at
// most once an hour per entry (a compare-and-set on `feedbackNotifiedAt`).

interface Entry {
  id: string;
  jamId: string;
  userId: string;
  feedbackNotifiedAt: Date | null;
}
interface Member {
  entryId: string;
  userId: string;
  status: string;
}
interface Rating {
  id: string;
  entryId: string;
  raterId: string;
}
interface Fb {
  id: string;
  ratingId: string;
  entryId: string;
  authorId: string;
  body: string;
  anonymous: boolean;
  helpfulAt: Date | null;
  removedAt: Date | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  jam: null as null | { id: string; slug: string; title: string; startsAt: Date; submitEndsAt: Date; ratingEndsAt: Date },
  entries: [] as Entry[],
  members: [] as Member[],
  ratings: [] as Rating[],
  feedback: [] as Fb[],
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  banned: new Set<string>(),
  seq: 0,
  notify: vi.fn(async (_n: { userId: string; entityType?: string; entityId?: string; preview?: string; link?: string }) => {}),
}));

vi.mock('@/lib/prisma.server', () => {
  const inSet = (v: unknown, x: unknown) => !!v && typeof v === 'object' && 'in' in (v as object) && (v as { in: unknown[] }).in.includes(x);
  const matchFb = (f: Fb, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as object)) return inSet(v, (f as unknown as Record<string, unknown>)[k]);
      if (v && typeof v === 'object' && 'not' in (v as object))
        return (f as unknown as Record<string, unknown>)[k] !== (v as { not: unknown }).not;
      if (v && typeof v === 'object' && 'gt' in (v as object))
        return ((f as unknown as Record<string, Date>)[k] as Date).getTime() > (v as { gt: Date }).gt.getTime();
      return (f as unknown as Record<string, unknown>)[k] === v;
    });
  const gameJamEntry = {
    async findUnique({ where: w }: { where: { id: string } }) {
      const e = h.entries.find((x) => x.id === w.id);
      if (!e) return null;
      return {
        ...e,
        jam: h.jam,
        team: h.members.filter((m) => m.entryId === e.id && m.status === 'accepted').map((m) => ({ userId: m.userId })),
      };
    },
    async updateMany({ where: w, data }: { where: { id: string; feedbackNotifiedAt: Date | null }; data: { feedbackNotifiedAt: Date } }) {
      const e = h.entries.find((x) => x.id === w.id && (x.feedbackNotifiedAt?.getTime() ?? null) === (w.feedbackNotifiedAt?.getTime() ?? null));
      if (!e) return { count: 0 };
      e.feedbackNotifiedAt = data.feedbackNotifiedAt;
      return { count: 1 };
    },
  };
  const gameJamTeamMember = {
    async findUnique({ where: w }: { where: { entryId_userId: { entryId: string; userId: string } } }) {
      return h.members.find((m) => m.entryId === w.entryId_userId.entryId && m.userId === w.entryId_userId.userId) ?? null;
    },
    async findMany({ where: w }: { where: { entryId: string; status: string } }) {
      return h.members.filter((m) => m.entryId === w.entryId && m.status === w.status);
    },
  };
  const gameJamRating = {
    async upsert({ where: w, create }: { where: { entryId_raterId: { entryId: string; raterId: string } }; create: { entryId: string; raterId: string } }) {
      let r = h.ratings.find((x) => x.entryId === w.entryId_raterId.entryId && x.raterId === w.entryId_raterId.raterId);
      if (!r) {
        r = { id: `r${++h.seq}`, entryId: create.entryId, raterId: create.raterId };
        h.ratings.push(r);
      }
      return { id: r.id };
    },
  };
  const gameJamFeedback = {
    async findUnique({ where: w }: { where: { ratingId?: string; id?: string } }) {
      return h.feedback.find((f) => (w.ratingId ? f.ratingId === w.ratingId : f.id === w.id)) ?? null;
    },
    async upsert({
      where: w,
      create,
      update,
    }: {
      where: { ratingId: string };
      create: Omit<Fb, 'id' | 'helpfulAt' | 'removedAt' | 'createdAt'>;
      update: Partial<Fb>;
    }) {
      const f = h.feedback.find((x) => x.ratingId === w.ratingId);
      if (f) Object.assign(f, update);
      else h.feedback.push({ id: `f${++h.seq}`, helpfulAt: null, removedAt: null, createdAt: new Date(), ...create });
    },
    async updateMany({ where: w, data }: { where: Record<string, unknown>; data: Partial<Fb> }) {
      const hit = h.feedback.filter((f) => matchFb(f, w));
      for (const f of hit) Object.assign(f, data);
      return { count: hit.length };
    },
    async deleteMany({ where: w }: { where: Record<string, unknown> }) {
      const hit = h.feedback.filter((f) => matchFb(f, w));
      for (const f of hit) h.feedback.splice(h.feedback.indexOf(f), 1);
      return { count: hit.length };
    },
    async count({ where: w }: { where: Record<string, unknown> }) {
      return h.feedback.filter((f) => matchFb(f, w)).length;
    },
    async findMany({ where: w }: { where: Record<string, unknown> }) {
      return h.feedback
        .filter((f) => matchFb(f, w))
        .map((f) => ({ ...f, author: { id: f.authorId, name: `name-${f.authorId}`, handle: f.authorId, image: null } }));
    },
  };
  const user = {
    async findUnique({ where: w }: { where: { id: string } }) {
      return { bannedUntil: h.banned.has(w.id) ? new Date(Date.now() + 86_400_000) : null };
    },
  };
  const userBlock = {
    async findFirst({ where: w }: { where: { OR: Array<{ blockerId: unknown; blockedId: unknown }> } }) {
      const is = (spec: unknown, val: string) => spec === val || inSet(spec, val);
      const hit = h.blocks.find((b) => w.OR.some((o) => is(o.blockerId, b.blockerId) && is(o.blockedId, b.blockedId)));
      return hit ? { id: 'b' } : null;
    },
  };
  const models = { gameJamEntry, gameJamTeamMember, gameJamRating, gameJamFeedback, user, userBlock };
  return {
    prisma: {
      ...models,
      async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        return fn({ ...models, async $executeRaw() { return 1; } });
      },
    },
  };
});
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: { id: string; name?: string; handle?: string }) => ({ id: u.id, name: u.name ?? null, handle: u.handle ?? null, image: null }),
}));

import { rateEntry } from '@/lib/competitive/jams.server';
import { listFeedback, markHelpful } from '@/lib/competitive/jam-feedback.server';
import { FEEDBACK_NOTIFY_WINDOW_MS } from '@/lib/competitive/jam-feedback';

const DAY = 86_400_000;
const scores = { fun: 4, creativity: 4, theme: 4, polish: 4 };
const WORDS = 'The movement felt great but the second level crashed.';

function setupJam(phase: 'rating' | 'done' = 'rating') {
  const now = Date.now();
  const w = phase === 'rating' ? [-2 * DAY, -DAY, DAY] : [-3 * DAY, -2 * DAY, -DAY];
  h.jam = {
    id: 'j1',
    slug: 'jam',
    title: 'Spring jam',
    startsAt: new Date(now + w[0]!),
    submitEndsAt: new Date(now + w[1]!),
    ratingEndsAt: new Date(now + w[2]!),
  };
}
const rate = (raterId: string, extras: { feedback?: string | null; anonymous?: boolean } = {}) =>
  rateEntry('jam', raterId, 'e1', scores, extras);
const list = (actorId: string | null, isAdmin = false) => listFeedback({ slug: 'jam', entryId: 'e1', actorId, isAdmin });

beforeEach(() => {
  h.entries.length = 0;
  h.members.length = 0;
  h.ratings.length = 0;
  h.feedback.length = 0;
  h.blocks.length = 0;
  h.banned.clear();
  h.notify.mockClear();
  setupJam('rating');
  h.entries.push({ id: 'e1', jamId: 'j1', userId: 'owner', feedbackNotifiedAt: null });
  h.members.push({ entryId: 'e1', userId: 'mate', status: 'accepted' });
});

describe('who may write feedback', () => {
  it('a rater saves words with the scores', async () => {
    const r = await rate('a', { feedback: WORDS });
    expect(r).toMatchObject({ ok: true, feedback: 'created' });
    expect(h.feedback).toHaveLength(1);
    expect(h.feedback[0]).toMatchObject({ authorId: 'a', entryId: 'e1', body: WORDS, anonymous: false });
  });

  it('the submitter and an accepted teammate cannot rate, so cannot leave feedback', async () => {
    expect(await rate('owner', { feedback: WORDS })).toMatchObject({ ok: false, status: 403 });
    expect(await rate('mate', { feedback: WORDS })).toMatchObject({ ok: false, status: 403 });
    expect(h.feedback).toHaveLength(0);
  });

  it('text that is too short or too long is refused before anything is written', async () => {
    expect(await rate('a', { feedback: 'too short' })).toMatchObject({ ok: false, status: 400 });
    expect(await rate('a', { feedback: 'x'.repeat(1001) })).toMatchObject({ ok: false, status: 400 });
    expect(h.ratings).toHaveLength(0);
  });

  it('feedback is optional: scores alone save no feedback, and an empty box withdraws it', async () => {
    expect(await rate('a')).toMatchObject({ ok: true, feedback: 'unchanged' });
    expect(h.feedback).toHaveLength(0);
    await rate('a', { feedback: WORDS });
    expect(await rate('a', { feedback: '   ' })).toMatchObject({ ok: true, feedback: 'cleared' });
    expect(h.feedback).toHaveLength(0);
  });

  it('a rater edits their feedback while rating is open (one row, no second notification)', async () => {
    await rate('a', { feedback: WORDS });
    const second = await rate('a', { feedback: `${WORDS} Also the music is lovely.` });
    expect(second).toMatchObject({ ok: true, feedback: 'edited' });
    expect(h.feedback).toHaveLength(1);
    expect(h.feedback[0]!.body).toContain('music');
  });

  it('after ratingEndsAt neither the scores nor the words can change', async () => {
    await rate('a', { feedback: WORDS });
    setupJam('done');
    expect(await rate('a', { feedback: `${WORDS} Edited late.` })).toMatchObject({ ok: false, status: 409 });
    expect(h.feedback[0]!.body).toBe(WORDS);
  });

  it('a rater blocked either way by the team keeps their rating but leaves no feedback', async () => {
    h.blocks.push({ blockerId: 'mate', blockedId: 'a' });
    expect(await rate('a', { feedback: WORDS })).toMatchObject({ ok: true, feedback: 'blocked' });
    expect(h.ratings).toHaveLength(1);
    expect(h.feedback).toHaveLength(0);
    h.blocks.length = 0;
    h.blocks.push({ blockerId: 'b', blockedId: 'owner' });
    expect(await rate('b', { feedback: WORDS })).toMatchObject({ ok: true, feedback: 'blocked' });
    expect(h.feedback).toHaveLength(0);
  });

  it('a banned member leaves no feedback', async () => {
    h.banned.add('a');
    expect(await rate('a', { feedback: WORDS })).toMatchObject({ ok: true, feedback: 'banned' });
    expect(h.feedback).toHaveLength(0);
  });

  it('a piece a moderator removed stays removed when the rater saves again', async () => {
    await rate('a', { feedback: WORDS });
    h.feedback[0]!.removedAt = new Date();
    await rate('a', { feedback: 'Something else entirely that is long enough.' });
    expect(h.feedback[0]!.body).toBe(WORDS);
  });
});

describe('who may read it', () => {
  beforeEach(async () => {
    await rate('a', { feedback: WORDS });
    await rate('b', { feedback: 'Anonymous but useful: the boss fight is too long.', anonymous: true });
  });

  it('the submitter and a teammate read every piece', async () => {
    for (const who of ['owner', 'mate']) {
      const r = await list(who);
      expect(r.ok && r.value).toHaveLength(2);
    }
  });

  it('an outsider, a rater and a signed-out viewer are refused', async () => {
    for (const who of ['a', 'stranger', null]) expect(await list(who)).toEqual({ ok: false, code: 'forbidden' });
  });

  it('an unknown entry or the wrong jam slug is not found', async () => {
    expect(await listFeedback({ slug: 'jam', entryId: 'zzz', actorId: 'owner', isAdmin: false })).toEqual({ ok: false, code: 'not-found' });
    expect(await listFeedback({ slug: 'other', entryId: 'e1', actorId: 'owner', isAdmin: false })).toEqual({ ok: false, code: 'not-found' });
  });

  it('an anonymous piece carries no author id to the team, and an admin still sees it', async () => {
    const asTeam = await list('owner');
    const anon = asTeam.ok && asTeam.value.find((f) => f.anonymous)!;
    expect(anon && anon.author).toBeNull();
    expect(JSON.stringify(asTeam)).not.toContain('"b"');
    const named = asTeam.ok && asTeam.value.find((f) => !f.anonymous)!;
    expect(named && named.author).toMatchObject({ id: 'a' });
    const asAdmin = await list('someone', true);
    expect(asAdmin.ok && asAdmin.value.find((f) => f.anonymous)!.author).toMatchObject({ id: 'b' });
  });

  it('a removed piece is no longer listed', async () => {
    h.feedback[0]!.removedAt = new Date();
    const r = await list('owner');
    expect(r.ok && r.value).toHaveLength(1);
  });
});

describe('Helpful', () => {
  beforeEach(async () => {
    await rate('a', { feedback: WORDS });
  });

  it('the team flags and unflags; the first time is kept', async () => {
    const id = h.feedback[0]!.id;
    expect(await markHelpful({ slug: 'jam', feedbackId: id, actorId: 'mate', helpful: true })).toEqual({ ok: true, value: true });
    const first = h.feedback[0]!.helpfulAt;
    expect(first).not.toBeNull();
    await markHelpful({ slug: 'jam', feedbackId: id, actorId: 'owner', helpful: true });
    expect(h.feedback[0]!.helpfulAt).toBe(first);
    await markHelpful({ slug: 'jam', feedbackId: id, actorId: 'owner', helpful: false });
    expect(h.feedback[0]!.helpfulAt).toBeNull();
  });

  it('the rater and outsiders cannot flag', async () => {
    const id = h.feedback[0]!.id;
    for (const who of ['a', 'stranger'])
      expect(await markHelpful({ slug: 'jam', feedbackId: id, actorId: who, helpful: true })).toEqual({ ok: false, code: 'forbidden' });
    expect(h.feedback[0]!.helpfulAt).toBeNull();
  });
});

describe('the batched notification', () => {
  it('ten raters inside an hour produce one notification round, naming no rater', async () => {
    for (let i = 0; i < 10; i++) await rate(`r${i}`, { feedback: `${WORDS} (rater ${i})` });
    // One round: the submitter and the one teammate, once each.
    expect(h.notify).toHaveBeenCalledTimes(2);
    expect(h.notify.mock.calls.map((c) => c[0].userId).sort()).toEqual(['mate', 'owner']);
    const first = h.notify.mock.calls[0]![0];
    expect(first).toMatchObject({ entityType: 'jam_feedback', entityId: 'e1', link: '/jams/jam' });
    expect(first).not.toHaveProperty('actorId');
  });

  it('two raters finishing together claim the marker once', async () => {
    await Promise.all([rate('a', { feedback: WORDS }), rate('b', { feedback: WORDS })]);
    expect(h.notify).toHaveBeenCalledTimes(2);
  });

  it('after the window the next new piece notifies again, counting the pieces since', async () => {
    await rate('a', { feedback: WORDS });
    h.notify.mockClear();
    h.entries[0]!.feedbackNotifiedAt = new Date(Date.now() - FEEDBACK_NOTIFY_WINDOW_MS - 1000);
    h.feedback[0]!.createdAt = new Date(Date.now() - 2 * FEEDBACK_NOTIFY_WINDOW_MS);
    await rate('b', { feedback: WORDS });
    await rate('c', { feedback: WORDS });
    expect(h.notify).toHaveBeenCalledTimes(2);
    expect(h.notify.mock.calls[0]![0].preview).toContain('New feedback');
  });

  it('an edit, or scores alone, notify nobody', async () => {
    await rate('a', { feedback: WORDS });
    h.notify.mockClear();
    h.entries[0]!.feedbackNotifiedAt = null;
    await rate('a', { feedback: `${WORDS} More.` });
    await rate('b');
    expect(h.notify).not.toHaveBeenCalled();
  });
});
