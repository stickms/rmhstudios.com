import { describe, it, expect, vi } from "vitest";
import { createMediaFromUpload } from "@/lib/media/upload.server";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

function makeDeps() {
  const created: any[] = [];
  const put: any[] = [];
  const deleted: any[] = [];
  return {
    created,
    put,
    deleted,
    deps: {
      prisma: {
        media: {
          create: vi.fn(async ({ data }: any) => { created.push(data); return data; }),
          delete: vi.fn(async ({ where }: any) => { deleted.push(where); return {}; }),
        },
      },
      putObject: vi.fn(async (key: string, body: Buffer, ct: string) => { put.push({ key, body, ct }); }),
    },
  };
}

describe("createMediaFromUpload", () => {
  it("creates a PENDING row FIRST, then stores the object, returns id + expiry", async () => {
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

    // create must have been called before putObject
    const createOrder = (deps.prisma.media.create as any).mock.invocationCallOrder[0];
    const putOrder = (deps.putObject as any).mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(putOrder);
  });

  it("throws a user-safe error on an unsupported format", async () => {
    const { deps } = makeDeps();
    await expect(
      createMediaFromUpload(deps, { userId: "u1", buffer: Buffer.from([0, 1, 2, 3]) })
    ).rejects.toThrow(/format|image/i);
  });

  it("cleans up the DB row and rethrows when putObject fails", async () => {
    const { deps, created, deleted } = makeDeps();
    const putError = new Error("S3 upload failed");
    (deps.putObject as any).mockRejectedValueOnce(putError);

    const now = new Date("2026-06-22T00:00:00.000Z");
    await expect(
      createMediaFromUpload(deps, { userId: "u1", buffer: PNG, now })
    ).rejects.toThrow("S3 upload failed");

    // Row was created then cleaned up
    expect(created).toHaveLength(1);
    expect(deps.prisma.media.delete).toHaveBeenCalledWith({
      where: { id: created[0].id },
    });
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(created[0].id);
  });
});
