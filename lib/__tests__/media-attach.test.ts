import { describe, it, expect, vi } from "vitest";
import { resolveMediaForPost } from "@/lib/media/attach.server";

function deps(rows: Array<{ id: string; url: string; userId: string; status: string }>) {
  return {
    prisma: {
      media: {
        findMany: vi.fn(async () => rows),
        updateMany: vi.fn(async () => ({ count: rows.filter((r) => r.status === "PENDING").length })),
      },
    },
  };
}

describe("resolveMediaForPost", () => {
  it("resolves urls in input order and flips to ATTACHED", async () => {
    const d = deps([
      { id: "media_b", url: "/api/feed/image/u1-2.png", userId: "u1", status: "PENDING" },
      { id: "media_a", url: "/api/feed/image/u1-1.png", userId: "u1", status: "PENDING" },
    ]);
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["media_a", "media_b"], postId: "p1" });
    expect(res).toEqual({ ok: true, urls: ["/api/feed/image/u1-1.png", "/api/feed/image/u1-2.png"] });
    expect(d.prisma.media.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects more than 4 ids", async () => {
    const d = deps([]);
    const res = await resolveMediaForPost(d, {
      userId: "u1",
      mediaIds: ["media_1", "media_2", "media_3", "media_4", "media_5"],
      postId: "p1",
    });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/at most 4/i) });
    expect(d.prisma.media.findMany).not.toHaveBeenCalled();
  });

  it("rejects a foreign-owned id", async () => {
    const d = deps([{ id: "media_a", url: "/x", userId: "u2", status: "PENDING" }]);
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["media_a"], postId: "p1" });
    expect(res.ok).toBe(false);
  });

  it("rejects a missing id", async () => {
    const d = deps([]); // findMany returns nothing
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["media_a"], postId: "p1" });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not found/i) });
  });

  it("rejects a non-media-id string", async () => {
    const d = deps([]);
    const res = await resolveMediaForPost(d, { userId: "u1", mediaIds: ["nope"], postId: "p1" });
    expect(res.ok).toBe(false);
    expect(d.prisma.media.findMany).not.toHaveBeenCalled();
  });
});
