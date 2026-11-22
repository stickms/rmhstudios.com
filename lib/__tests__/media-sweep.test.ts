import { describe, it, expect, vi } from 'vitest';
import {
  SWEEP_BATCH,
  SWEEP_ROW_CAP,
  sweepMedia,
  sweepUnreferencedMedia,
  type SweepDeps,
} from '@/lib/media/sweep.server';
import { variantKeysFor } from '@/lib/media/ingest.server';

// ingest.server is imported for its variant naming only; its database and storage doors are never touched here.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/storage/s3.server', () => ({ putObject: vi.fn() }));

type Target = { id: string; key: string; url: string };

function makeDeps(
  targets: Target[],
  refs: {
    scheduled?: Array<{ imageUrls: string[] }>;
    cards?: Array<{ frontImageUrl: string | null; backImageUrl: string | null }>;
    shots?: Array<{ url: string }>;
    builds?: Array<{ thumbnailUrl: string | null }>;
  } = {},
) {
  return {
    prisma: {
      media: {
        findMany: vi.fn(async () => targets),
        deleteMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => ({ count: args.where.id.in.length })),
      },
      scheduledPost: { findMany: vi.fn(async () => refs.scheduled ?? []) },
      flashcard: { findMany: vi.fn(async () => refs.cards ?? []) },
      buildScreenshot: { findMany: vi.fn(async () => refs.shots ?? []) },
      userBuild: { findMany: vi.fn(async () => refs.builds ?? []) },
      rMHark: { findMany: vi.fn(async (): Promise<Array<{ imageUrls: string[] }>> => []) },
      feedAnnouncement: { findMany: vi.fn(async (): Promise<Array<{ imageUrls: string[] }>> => []) },
      chatMessage: { findMany: vi.fn(async (): Promise<Array<{ imageUrls: string[] }>> => []) },
      scheduledChatMessage: { findMany: vi.fn(async (): Promise<Array<{ imageUrls: string[] }>> => []) },
    },
    deleteObject: vi.fn(async (_key: string) => {}),
    purgeFromCdn: vi.fn(async (_key: string) => {}),
    now: new Date('2026-06-22T00:00:00.000Z'),
  } satisfies SweepDeps;
}

type Query = { where: Record<string, unknown>; select: unknown };
/** The first call's argument of one of the mocked `findMany`s. */
const firstQuery = (fn: { mock: { calls: unknown[][] } }): Query => fn.mock.calls[0]![0] as Query;
type Branch = { status?: string; postId?: null; createdAt?: { lt?: unknown }; attachedAt?: unknown };

const media = (n: string): Target => ({
  id: `media_${n}`,
  key: `rmharks/${n}.png`,
  url: `https://cdn.test/rmharks/${n}.png`,
});

describe('sweepUnreferencedMedia', () => {
  it('deletes objects, purges CDN, and removes rows for each target', async () => {
    const deps = makeDeps([media('a'), media('b')]);
    const res = await sweepUnreferencedMedia(deps);

    expect(res).toEqual({ deleted: 2 });
    expect(deps.deleteObject).toHaveBeenCalledWith('rmharks/a.png');
    expect(deps.deleteObject).toHaveBeenCalledWith('rmharks/b.png');
    expect(deps.purgeFromCdn).toHaveBeenCalledTimes(2);
    expect(deps.prisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['media_a', 'media_b'] } } });

    // Sanity-check the selection query shape (OR of orphan + deleted-post + backstop).
    const where = firstQuery(deps.prisma.media.findMany).where as { OR: Branch[] };
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(3);
  });

  it('is a no-op when nothing matches', async () => {
    const deps = makeDeps([]);
    const res = await sweepUnreferencedMedia(deps);
    expect(res).toEqual({ deleted: 0 });
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(deps.prisma.media.deleteMany).not.toHaveBeenCalled();
    expect(deps.prisma.scheduledPost.findMany).not.toHaveBeenCalled();
  });

  it('skips a failing deleteObject, still deletes the other item and returns correct count', async () => {
    const deps = makeDeps([media('poison'), media('good')]);
    deps.deleteObject.mockImplementation(async (key: string) => {
      if (key === 'rmharks/poison.png') throw new Error('S3 error');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await sweepUnreferencedMedia(deps);
    consoleSpy.mockRestore();

    expect(res).toEqual({ deleted: 1 });
    expect(deps.prisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['media_good'] } } });
    expect(deps.purgeFromCdn).toHaveBeenCalledTimes(1);
    expect(deps.purgeFromCdn).toHaveBeenCalledWith('rmharks/good.png');
  });

  it('includes ATTACHED media whose post row is gone (third OR branch)', async () => {
    const deps = makeDeps([]);
    await sweepUnreferencedMedia(deps);
    const where = firstQuery(deps.prisma.media.findMany).where as { OR: Branch[] };
    const thirdBranch = where.OR[2]!;
    expect(thirdBranch).toMatchObject({ status: 'ATTACHED', postId: null });
    expect(thirdBranch.createdAt?.lt).toBeInstanceOf(Date);
    // Emoji-pack items are ATTACHED with no post and never get attachedAt;
    // the branch must exclude them or the sweep deletes every pack image.
    expect(thirdBranch.attachedAt).toEqual({ not: null });
  });

  describe('keeps media that something still references by URL', () => {
    const sched = media('sched');
    const front = media('front');
    const back = media('back');
    const shot = media('shot');
    const cover = media('cover');
    const orphan = media('orphan');

    it('keeps an unpublished scheduled post, a card side, a screenshot and a cover; deletes the orphan', async () => {
      const deps = makeDeps([sched, front, back, shot, cover, orphan], {
        scheduled: [{ imageUrls: [sched.url, 'https://cdn.test/other.png'] }],
        cards: [
          { frontImageUrl: front.url, backImageUrl: null },
          { frontImageUrl: null, backImageUrl: back.url },
        ],
        shots: [{ url: shot.url }],
        builds: [{ thumbnailUrl: cover.url }],
      });

      const res = await sweepUnreferencedMedia(deps);

      expect(res).toEqual({ deleted: 1 });
      expect(deps.deleteObject).toHaveBeenCalledTimes(1);
      expect(deps.deleteObject).toHaveBeenCalledWith(orphan.key);
      expect(deps.prisma.media.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [orphan.id] } } });
    });

    it('asks only about unpublished scheduled posts, and by the candidate URLs', async () => {
      const deps = makeDeps([sched, orphan]);
      await sweepUnreferencedMedia(deps);

      const urls = [sched.url, orphan.url];
      const schedArgs = firstQuery(deps.prisma.scheduledPost.findMany);
      expect(schedArgs.where).toEqual({ publishedId: null, imageUrls: { hasSome: urls } });
      const cardArgs = firstQuery(deps.prisma.flashcard.findMany);
      expect(cardArgs.where).toEqual({ OR: [{ frontImageUrl: { in: urls } }, { backImageUrl: { in: urls } }] });
      const shotArgs = firstQuery(deps.prisma.buildScreenshot.findMany);
      expect(shotArgs.where).toEqual({ url: { in: urls } });
      const buildArgs = firstQuery(deps.prisma.userBuild.findMany);
      expect(buildArgs.where).toEqual({ thumbnailUrl: { in: urls } });
      // The media query selects the URL the reference checks need.
      expect(firstQuery(deps.prisma.media.findMany).select).toEqual({ id: true, key: true, url: true });
    });

    it('deletes nothing when every candidate is referenced', async () => {
      const deps = makeDeps([sched], { scheduled: [{ imageUrls: [sched.url] }] });
      expect(await sweepUnreferencedMedia(deps)).toEqual({ deleted: 0 });
      expect(deps.deleteObject).not.toHaveBeenCalled();
      expect(deps.prisma.media.deleteMany).not.toHaveBeenCalled();
    });

    it('checks references in bounded chunks', async () => {
      const many = Array.from({ length: 1201 }, (_, i) => media(`m${i}`));
      const deps = makeDeps(many);
      await sweepUnreferencedMedia(deps);
      // 3 chunks of 500 while selecting, then one check per batch of 200 (7) just before its deletes.
      const calls = deps.prisma.scheduledPost.findMany.mock.calls as unknown as Array<
        [{ where: { imageUrls: { hasSome: string[] } } }]
      >;
      expect(calls).toHaveLength(3 + 7);
      for (const [args] of calls) expect(args.where.imageUrls.hasSome.length).toBeLessThanOrEqual(500);
      expect(deps.deleteObject).toHaveBeenCalledTimes(1201);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* s09-12: the cap, the order, the batches, the variants and the dry run      */
/* -------------------------------------------------------------------------- */

type Row = {
  id: string;
  key: string;
  url: string;
  status: 'PENDING' | 'ATTACHED';
  postId: string | null;
  createdAt: number;
};
type FindArgs = {
  where: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  cursor?: { id: string };
  skip?: number;
};

const row = (n: number, over: Partial<Row> = {}): Row => ({
  id: `m${String(n).padStart(5, '0')}`,
  key: `rmharks/u-${n}.webp`,
  url: `https://cdn.test/rmharks/u-${n}.webp`,
  status: 'PENDING',
  postId: null,
  createdAt: n,
  ...over,
});

/** An in-memory `Media` table that honours `orderBy`, `take`, `cursor`/`skip` and the id lookup the sweep makes. */
function tableDeps(
  rows: Row[],
  refs: { cardUrls?: Set<string>; scheduledUrls?: Set<string> } = {},
  withVariants = false,
) {
  const store = [...rows];
  const findMany = vi.fn(async (args: FindArgs) => {
    const ids = (args.where.id as { in?: string[] } | undefined)?.in;
    if (ids) return store.filter((r) => ids.includes(r.id));
    const sorted = [...store].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    let start = 0;
    if (args.cursor) start = sorted.findIndex((r) => r.id === args.cursor!.id) + (args.skip ?? 0);
    return sorted.slice(start, start + (args.take ?? sorted.length));
  });
  const deleteMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => {
    const gone = new Set(args.where.id.in);
    for (let i = store.length - 1; i >= 0; i--) if (gone.has(store[i]!.id)) store.splice(i, 1);
    return { count: gone.size };
  });
  const deps = {
    prisma: {
      media: { findMany, deleteMany },
      scheduledPost: {
        findMany: vi.fn(async (args: { where: { imageUrls: { hasSome: string[] } } }) => {
          const hit = args.where.imageUrls.hasSome.filter((u) => refs.scheduledUrls?.has(u));
          return hit.length ? [{ imageUrls: hit }] : [];
        }),
      },
      flashcard: {
        findMany: vi.fn(async (args: { where: { OR: Array<{ frontImageUrl: { in: string[] } }> } }) =>
          args.where.OR[0]!.frontImageUrl.in.filter((u) => refs.cardUrls?.has(u)).map((u) => ({
            frontImageUrl: u,
            backImageUrl: null,
          })),
        ),
      },
      buildScreenshot: { findMany: vi.fn(async () => []) },
      userBuild: { findMany: vi.fn(async () => []) },
      rMHark: { findMany: vi.fn(async () => []) },
      feedAnnouncement: { findMany: vi.fn(async () => []) },
      chatMessage: { findMany: vi.fn(async () => []) },
      scheduledChatMessage: { findMany: vi.fn(async () => []) },
    },
    deleteObject: vi.fn(async (_key: string) => {}),
    purgeFromCdn: vi.fn(async (_key: string) => {}),
    ...(withVariants ? { variantKeys: variantKeysFor } : {}),
    now: new Date('2026-06-22T00:00:00.000Z'),
  };
  // The doubles take the narrow argument each one reads; the sweep's own type says `where: unknown`, so the
  // intersection keeps both the mock API and the shape `sweepMedia` takes.
  return { deps: deps as typeof deps & SweepDeps, store };
}

describe('sweepMedia: bounded, ordered, batched', () => {
  it('takes at most 2000 rows, the oldest first, and deletes them 200 at a time', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    const { deps, store } = tableDeps(rows);

    const summary = await sweepMedia(deps);

    expect(SWEEP_ROW_CAP).toBe(2000);
    expect(SWEEP_BATCH).toBe(200);
    expect(summary).toMatchObject({ targets: 2000, deleted: 2000, failed: 0, capped: true });
    // The 500 newest remain, none of the oldest 2000.
    expect(store.map((r) => r.createdAt)).toEqual(Array.from({ length: 500 }, (_, i) => 2001 + i));
    const batches = deps.prisma.media.deleteMany.mock.calls.map((c) => c[0].where.id.in.length);
    expect(batches).toEqual(Array.from({ length: 10 }, () => 200));
    // Ordered: the first deleted object is the oldest row's.
    expect(deps.deleteObject.mock.calls[0]![0]).toBe('rmharks/u-1.webp');
  });

  it('asks for the oldest rows first, with a take', async () => {
    const { deps } = tableDeps([row(1)]);
    await sweepMedia(deps);
    const first = deps.prisma.media.findMany.mock.calls[0]![0];
    expect(first.take).toBe(2000);
    expect(first.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('is not starved by a backlog of rows that stay kept (flashcard pictures stay PENDING for good)', async () => {
    const kept = Array.from({ length: 2100 }, (_, i) => row(i + 1));
    const orphans = Array.from({ length: 50 }, (_, i) => row(5000 + i));
    const { deps, store } = tableDeps([...kept, ...orphans], { cardUrls: new Set(kept.map((r) => r.url)) });

    const summary = await sweepMedia(deps);

    expect(summary).toMatchObject({ targets: 50, deleted: 50, kept: 2100 });
    expect(store).toHaveLength(2100);
  });

  it('counts the targets per rule', async () => {
    const rows = [
      row(1),
      row(2),
      row(3, { status: 'ATTACHED', postId: 'post_a' }),
      row(4, { status: 'ATTACHED', postId: null }),
    ];
    const { deps } = tableDeps(rows);
    const summary = await sweepMedia(deps, { dryRun: true });
    expect(summary.byRule).toEqual({ 'orphan-pending': 2, 'soft-deleted-post': 1, 'hard-deleted-post': 1 });
  });

  it('keeps a row whose key is not in the feed space, or is empty, or climbs out of it', async () => {
    const rows = [
      row(1, { key: 'user-avatars/a.webp' }),
      row(2, { key: '' }),
      row(3, { key: 'rmharks/../secrets/x.webp' }),
      row(4, { key: 'rmharks/' }),
      row(5),
    ];
    const { deps } = tableDeps(rows);
    const summary = await sweepMedia(deps);
    expect(summary).toMatchObject({ targets: 1, deleted: 1, kept: 4 });
    expect(deps.deleteObject).toHaveBeenCalledTimes(1);
    expect(deps.deleteObject).toHaveBeenCalledWith('rmharks/u-5.webp');
  });
});

describe('sweepMedia: variants go with their row', () => {
  const full = 'rmharks/user1-1700000000000-42.webp';
  const small = 'rmharks/user1-1700000000000-42-400.webp';
  const flashcard = row(1, { key: full, url: `https://cdn.test/${full}` });

  it("deletes a swept flashcard row's -400 variant, before the full-size object, and purges both", async () => {
    const { deps, store } = tableDeps([flashcard], {}, true);
    expect(variantKeysFor(full)).toEqual([small]);

    const summary = await sweepMedia(deps);

    expect(summary.deleted).toBe(1);
    expect(deps.deleteObject.mock.calls.map((c) => c[0])).toEqual([small, full]);
    expect(deps.purgeFromCdn.mock.calls.map((c) => c[0]).sort()).toEqual([full, small].sort());
    expect(store).toHaveLength(0);
  });

  it('keeps the row when a variant fails to delete, and retries it the next run', async () => {
    const { deps, store } = tableDeps([flashcard], {}, true);
    deps.deleteObject.mockImplementationOnce(async () => {
      throw new Error('storage down');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await sweepMedia(deps);
    expect(first).toMatchObject({ deleted: 0, failed: 1 });
    expect(store).toHaveLength(1);
    // Nothing was logged but a class name: no key, no member.
    expect(JSON.stringify(spy.mock.calls)).not.toContain('user1');
    spy.mockRestore();

    const second = await sweepMedia(deps);
    expect(second).toMatchObject({ deleted: 1, failed: 0 });
    expect(store).toHaveLength(0);
  });

  it('derives album and flashcard variants from the policies, and nothing for an unknown prefix', () => {
    expect(variantKeysFor('albums/a1/x-9.webp')).toEqual(['albums/a1/x-9-400.webp', 'albums/a1/x-9-1600.webp']);
    expect(variantKeysFor('user-avatars/x.webp')).toEqual([]);
    expect(variantKeysFor('elsewhere/x.webp')).toEqual([]);
  });
});

describe('sweepMedia: dryRun', () => {
  it('deletes nothing and lists the keys a run then deletes, exclusions applied', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i + 1));
    const scheduled = rows[4]!;
    const refs = { scheduledUrls: new Set([scheduled.url]) };

    const dry = tableDeps(rows, refs);
    const preview = await sweepMedia(dry.deps, { dryRun: true });
    expect(preview).toMatchObject({ dryRun: true, targets: 29, deleted: 0, kept: 1 });
    expect(dry.deps.deleteObject).not.toHaveBeenCalled();
    expect(dry.deps.purgeFromCdn).not.toHaveBeenCalled();
    expect(dry.deps.prisma.media.deleteMany).not.toHaveBeenCalled();
    expect(dry.store).toHaveLength(30);
    expect(preview.sampleKeys).not.toContain(scheduled.key);

    const live = tableDeps(rows, refs);
    const run = await sweepMedia(live.deps);
    const deletedKeys = live.deps.deleteObject.mock.calls.map((c) => c[0]).filter((k) => !k.includes('-400'));
    expect(run.targets).toBe(preview.targets);
    expect(deletedKeys).toEqual(preview.sampleKeys);
    expect(run.sampleKeys).toEqual([]);
  });

  it('lists at most 50 keys', async () => {
    const { deps } = tableDeps(Array.from({ length: 80 }, (_, i) => row(i + 1)));
    const preview = await sweepMedia(deps, { dryRun: true });
    expect(preview.targets).toBe(80);
    expect(preview.sampleKeys).toHaveLength(50);
  });

  it('sweepUnreferencedMedia with dryRun reports 0 deleted and deletes nothing', async () => {
    const { deps } = tableDeps([row(1), row(2)]);
    expect(await sweepUnreferencedMedia(deps, { dryRun: true })).toEqual({ deleted: 0 });
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });
});

describe('sweepMedia: a row attached or referenced after selection survives', () => {
  it('re-checks each batch: a row that stopped matching, or got referenced, is not deleted', async () => {
    const a = row(1);
    const b = row(2);
    const c = row(3);
    const { deps, store } = tableDeps([a, b, c]);
    const original = deps.prisma.media.findMany;
    // After the selection, `a` is attached to a post (no longer matches) and `b` gains a live post that names it.
    (deps.prisma.media as { findMany: unknown }).findMany = vi.fn(async (args: FindArgs) => {
      const and = args.where.AND as Array<{ id?: { in: string[] } }> | undefined;
      if (and) return store.filter((r) => and[0]!.id!.in.includes(r.id) && r.id !== a.id);
      return original(args);
    });
    (deps.prisma.rMHark.findMany as unknown as { mockImplementation(f: unknown): void }).mockImplementation(
      // The first call is the selection's reference check; later ones are the per-batch re-check.
      async () => (deps.prisma.rMHark.findMany.mock.calls.length > 1 ? [{ imageUrls: [b.url] }] : []),
    );
    const res = await sweepMedia(deps);
    expect(res.deleted).toBe(1);
    expect(deps.deleteObject).toHaveBeenCalledTimes(1);
    expect(deps.deleteObject).toHaveBeenCalledWith(c.key);
  });

  it('keeps a row a live post, an announcement or a chat message names', async () => {
    const live = media('live');
    const deps = makeDeps([live, media('gone')]);
    deps.prisma.chatMessage.findMany.mockImplementation(async () => [{ imageUrls: [live.url] }]);
    const res = await sweepUnreferencedMedia(deps);
    expect(res).toEqual({ deleted: 1 });
    expect(deps.deleteObject).not.toHaveBeenCalledWith(live.key);
  });
});
