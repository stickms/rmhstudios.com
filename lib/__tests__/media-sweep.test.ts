import { describe, it, expect, vi } from "vitest";
import { sweepUnreferencedMedia } from "@/lib/media/sweep.server";

describe("sweepUnreferencedMedia", () => {
  it("deletes objects, purges CDN, and removes rows for each target", async () => {
    const targets = [
      { id: "media_1", key: "rmharks/a.png" },
      { id: "media_2", key: "rmharks/b.png" },
    ];
    const deps = {
      prisma: {
        media: {
          findMany: vi.fn(async () => targets),
          deleteMany: vi.fn(async () => ({ count: targets.length })),
        },
      },
      deleteObject: vi.fn(async () => {}),
      purgeFromCdn: vi.fn(async () => {}),
      now: new Date("2026-06-22T00:00:00.000Z"),
    };

    const res = await sweepUnreferencedMedia(deps);

    expect(res).toEqual({ deleted: 2 });
    expect(deps.deleteObject).toHaveBeenCalledWith("rmharks/a.png");
    expect(deps.deleteObject).toHaveBeenCalledWith("rmharks/b.png");
    expect(deps.purgeFromCdn).toHaveBeenCalledTimes(2);
    expect(deps.prisma.media.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["media_1", "media_2"] } },
    });

    // Sanity-check the selection query shape (OR of orphan + deleted-post + backstop).
    const where = (deps.prisma.media.findMany.mock.calls as any[][])[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(3);
  });

  it("is a no-op when nothing matches", async () => {
    const deps = {
      prisma: { media: { findMany: vi.fn(async () => []), deleteMany: vi.fn() } },
      deleteObject: vi.fn(),
      purgeFromCdn: vi.fn(),
    };
    const res = await sweepUnreferencedMedia(deps);
    expect(res).toEqual({ deleted: 0 });
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(deps.prisma.media.deleteMany).not.toHaveBeenCalled();
  });

  it("skips a failing deleteObject, still deletes the other item and returns correct count", async () => {
    const targets = [
      { id: "media_poison", key: "rmharks/poison.png" },
      { id: "media_good", key: "rmharks/good.png" },
    ];
    const deps = {
      prisma: {
        media: {
          findMany: vi.fn(async () => targets),
          deleteMany: vi.fn(async () => ({ count: 1 })),
        },
      },
      deleteObject: vi.fn(async (key: string) => {
        if (key === "rmharks/poison.png") throw new Error("S3 error");
      }),
      purgeFromCdn: vi.fn(async () => {}),
      now: new Date("2026-06-22T00:00:00.000Z"),
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await sweepUnreferencedMedia(deps);
    consoleSpy.mockRestore();

    // Only the successful item is counted and removed
    expect(res).toEqual({ deleted: 1 });
    expect(deps.prisma.media.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["media_good"] } },
    });
    // The poison key was attempted but not purged or row-deleted
    expect(deps.purgeFromCdn).toHaveBeenCalledTimes(1);
    expect(deps.purgeFromCdn).toHaveBeenCalledWith("rmharks/good.png");
  });

  it("includes ATTACHED media whose post row is gone (third OR branch)", async () => {
    const deps = {
      prisma: {
        media: {
          findMany: vi.fn(async () => []),
          deleteMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      deleteObject: vi.fn(async () => {}),
      purgeFromCdn: vi.fn(async () => {}),
      now: new Date("2026-06-22T00:00:00.000Z"),
    };

    await sweepUnreferencedMedia(deps);

    const where = (deps.prisma.media.findMany.mock.calls as any[][])[0][0].where;
    const thirdBranch = where.OR[2];
    expect(thirdBranch).toMatchObject({
      status: "ATTACHED",
      postId: null,
    });
    expect(thirdBranch.createdAt?.lt).toBeInstanceOf(Date);
  });
});
