/**
 * `createScheduledPost` / `updateScheduledPost` (lib/scheduled/create.server.ts): the drafts cap is counted and
 * inserted under the member's advisory lock (taken first, so two creates at the cap cannot both pass), the cap
 * refuses the `MAX_PENDING + 1`th row, a community sanction refuses, and the Sprint 6/7 fields survive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  order: [] as string[],
  pending: { n: 0 },
  created: [] as Array<Record<string, unknown>>,
  sanction: { current: null as null | { kind: string; endsAt: Date | null } },
  row: { current: null as Record<string, unknown> | null },
  updateMany: vi.fn(),
  settings: { current: null as null | { requireImageAlt: boolean } },
}));

vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.order.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    scheduledPost: {
      count: vi.fn(async () => {
        h.order.push('count');
        return h.pending.n;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.order.push('create');
        h.created.push(data);
        return { id: 'sp1', ...data };
      }),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      scheduledPost: {
        findUnique: vi.fn(async () => h.row.current),
        updateMany: h.updateMany,
      },
    },
  };
});
vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: vi.fn(async () => h.sanction.current),
}));
vi.mock('@/lib/communities/settings.server', () => ({
  getCommunitySettings: vi.fn(async () => h.settings.current),
}));
vi.mock('@/lib/feed/alt-text.server', () => ({ altTextViolation: vi.fn(async () => null) }));

const { createScheduledPost, updateScheduledPost, MAX_PENDING } = await import('@/lib/scheduled/create.server');

const ME = 'user_me';
const future = () => new Date(Date.now() + 3 * 3_600_000).toISOString();

beforeEach(() => {
  h.order.length = 0;
  h.pending.n = 0;
  h.created.length = 0;
  h.sanction.current = null;
  h.row.current = null;
  h.settings.current = null;
  h.updateMany.mockReset();
});

describe('createScheduledPost cap', () => {
  it('takes the member lock before it counts, and counts before it inserts', async () => {
    const out = await createScheduledPost(ME, { content: 'hello', scheduledAt: future() });
    expect(out.ok).toBe(true);
    expect(h.order).toEqual([`lock:scheduled:${ME}`, 'count', 'create']);
  });

  it('allows the last free slot and refuses the MAX_PENDING + 1th row without inserting', async () => {
    h.pending.n = MAX_PENDING - 1;
    expect((await createScheduledPost(ME, { content: 'last' })).ok).toBe(true);

    h.created.length = 0;
    h.pending.n = MAX_PENDING;
    const out = await createScheduledPost(ME, { content: 'one too many' });
    expect(out).toMatchObject({ ok: false, reason: 'cap', status: 400 });
    expect(h.created).toHaveLength(0);
  });

  it('is 50 drafts at once', () => {
    expect(MAX_PENDING).toBe(50);
  });
});

describe('createScheduledPost refusals', () => {
  it('refuses a member banned or timed out of the community, with the gate code', async () => {
    h.sanction.current = { kind: 'ban', endsAt: null };
    const out = await createScheduledPost(ME, { content: 'hi', communityId: 'c1' });
    expect(out).toMatchObject({ ok: false, status: 403, reason: 'sanction' });
    expect(h.created).toHaveLength(0);
    expect(h.order).toEqual([]);
  });

  it('refuses an undescribed image into a community that requires descriptions', async () => {
    h.settings.current = { requireImageAlt: true };
    const out = await createScheduledPost(
      ME,
      { content: 'pic', communityId: 'c1', imageUrls: ['u1'] },
      { trustedImages: true },
    );
    expect(out).toMatchObject({ ok: false, status: 400, reason: 'alt_required' });
  });

  it('refuses an empty draft, a past time and a capsule without a date', async () => {
    expect(await createScheduledPost(ME, { content: '  ' })).toMatchObject({ reason: 'empty' });
    expect(
      await createScheduledPost(ME, { content: 'x', scheduledAt: new Date(Date.now() - 1000).toISOString() }),
    ).toMatchObject({ reason: 'past' });
    expect(await createScheduledPost(ME, { content: 'x', capsule: true })).toMatchObject({ reason: 'capsule_date' });
  });

  it("refuses image urls that are not the member's own unless the caller resolved them", async () => {
    expect(await createScheduledPost(ME, { content: 'x', imageUrls: ['/api/feed/image/other-1-a.png'] })).toMatchObject(
      {
        reason: 'invalid_image',
      },
    );
  });

  it('runs a precheck after validation and before the lock', async () => {
    const out = await createScheduledPost(
      ME,
      { content: 'x' },
      {
        precheck: async () => ({ ok: false, status: 422, reason: 'held', body: { error: 'held' } }),
      },
    );
    expect(out).toMatchObject({ ok: false, reason: 'held' });
    expect(h.order).toEqual([]);
  });
});

describe('createScheduledPost keeps the Sprint 6 and 7 fields', () => {
  it('stores the content warning, GIF description, reply control, ranked and quiz polls', async () => {
    await createScheduledPost(ME, {
      content: 'q',
      contentWarning: 'spoilers',
      gifUrl: 'https://example.com/a.gif',
      gifAlt: 'a dancing cat',
      replyControl: 'MENTIONED',
      poll: {
        question: 'Best?',
        options: ['a', 'b', 'c'],
        ranked: true,
        durationHours: 24,
      },
    });
    expect(h.created[0]).toMatchObject({
      isSensitive: true,
      contentWarning: 'spoilers',
      gifUrl: 'https://example.com/a.gif',
      gifAlt: 'a dancing cat',
      replyControl: 'MENTIONED',
      poll: { ranked: true, options: ['a', 'b', 'c'] },
    });
  });
});

describe('updateScheduledPost', () => {
  const row = (extra: Record<string, unknown> = {}) => ({
    id: 'sp1',
    userId: ME,
    content: 'old',
    publishedId: null,
    isCapsule: false,
    imageUrls: [],
    imageAlts: [],
    gifUrl: null,
    gifAlt: null,
    communityId: null,
    poll: null,
    isSensitive: false,
    contentWarning: null,
    ...extra,
  });

  it("refuses another member's row, a published row and a sealed capsule", async () => {
    h.row.current = row({ userId: 'someone' });
    expect(await updateScheduledPost(ME, 'sp1', { content: 'x' })).toMatchObject({ reason: 'not_found', status: 404 });
    h.row.current = row({ publishedId: 'p1' });
    expect(await updateScheduledPost(ME, 'sp1', { content: 'x' })).toMatchObject({ reason: 'published', status: 409 });
    h.row.current = row({ isCapsule: true });
    expect(await updateScheduledPost(ME, 'sp1', { content: 'x' })).toMatchObject({
      reason: 'capsule_sealed',
      status: 409,
    });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('writes only what changed, compare-and-set on the row being unpublished', async () => {
    h.row.current = row();
    h.updateMany.mockResolvedValue({ count: 1 });
    const out = await updateScheduledPost(ME, 'sp1', { content: ' new ', scheduledAt: future() });
    expect(out.ok).toBe(true);
    const arg = h.updateMany.mock.calls[0]![0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(arg.where).toMatchObject({ id: 'sp1', userId: ME, publishedId: null, isCapsule: false });
    expect(Object.keys(arg.data).sort()).toEqual(['content', 'scheduledAt']);
    expect(arg.data.content).toBe('new');
  });

  it('loses to a publish that raced it', async () => {
    h.row.current = row();
    h.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateScheduledPost(ME, 'sp1', { content: 'x' })).toMatchObject({ reason: 'published' });
  });

  it('re-checks the community sanction when the content changes', async () => {
    h.row.current = row({ communityId: 'c1' });
    h.sanction.current = { kind: 'timeout', endsAt: new Date(Date.now() + 60_000) };
    expect(await updateScheduledPost(ME, 'sp1', { content: 'x' })).toMatchObject({ reason: 'sanction', status: 403 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });
});
