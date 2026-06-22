import { describe, it, expect, vi } from "vitest";
import { createMediaFromUpload } from "@/lib/media/upload.server";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

function makeDeps() {
  const created: any[] = [];
  const put: any[] = [];
  return {
    created,
    put,
    deps: {
      prisma: { media: { create: vi.fn(async ({ data }: any) => { created.push(data); return data; }) } },
      putObject: vi.fn(async (key: string, body: Buffer, ct: string) => { put.push({ key, body, ct }); }),
    },
  };
}

describe("createMediaFromUpload", () => {
  it("validates, stores, writes a PENDING row, returns id + expiry", async () => {
    const { deps, created, put } = makeDeps();
    const now = new Date("2026-06-22T00:00:00.000Z");
    const res = await createMediaFromUpload(deps, { userId: "u1", buffer: PNG, now });

    expect(res.id).toMatch(/^media_/);
    expect(res.expiresAt.toISOString()).toBe("2026-06-23T00:00:00.000Z"); // +24h

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: res.id,
      userId: "u1",
      status: "PENDING",
      contentType: "image/png",
      bytes: PNG.length,
    });
    expect(created[0].key).toMatch(/^rmharks\/u1-/);
    expect(created[0].url).toMatch(/^\/api\/feed\/image\/u1-/);

    expect(put).toHaveLength(1);
    expect(put[0].key).toBe(created[0].key);
    expect(put[0].ct).toBe("image/png");
  });

  it("throws a user-safe error on an unsupported format", async () => {
    const { deps } = makeDeps();
    await expect(
      createMediaFromUpload(deps, { userId: "u1", buffer: Buffer.from([0, 1, 2, 3]) })
    ).rejects.toThrow(/format|image/i);
  });
});
