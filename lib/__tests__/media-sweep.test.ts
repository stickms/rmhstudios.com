import { describe, it, expect, vi } from 'vitest';
import { sweepUnreferencedMedia, type SweepDeps } from '@/lib/media/sweep.server';

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
      expect(deps.prisma.scheduledPost.findMany).toHaveBeenCalledTimes(3);
      expect(deps.deleteObject).toHaveBeenCalledTimes(1201);
    });
  });
});
