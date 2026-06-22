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

    // Sanity-check the selection query shape (OR of orphan + deleted-post).
    const where = (deps.prisma.media.findMany.mock.calls as any[][])[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(2);
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
});
