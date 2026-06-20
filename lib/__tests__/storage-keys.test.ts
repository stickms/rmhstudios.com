// lib/__tests__/storage-keys.test.ts
import { describe, it, expect } from "vitest";
import {
  FEED_IMAGE_PREFIX,
  isSafeFilename,
  contentTypeForFilename,
  feedImageKey,
  feedImageUrl,
} from "@/lib/storage/keys";

describe("storage keys", () => {
  it("accepts safe filenames and rejects traversal/slashes", () => {
    expect(isSafeFilename("u1-123-456-pic.png")).toBe(true);
    expect(isSafeFilename("a_b.webp")).toBe(true);
    expect(isSafeFilename("../etc/passwd")).toBe(false);
    expect(isSafeFilename("dir/file.png")).toBe(false);
    expect(isSafeFilename("..")).toBe(false);
    expect(isSafeFilename("")).toBe(false);
  });

  it("maps extensions to content types", () => {
    expect(contentTypeForFilename("x.png")).toBe("image/png");
    expect(contentTypeForFilename("x.JPG")).toBe("image/jpeg");
    expect(contentTypeForFilename("x.jpeg")).toBe("image/jpeg");
    expect(contentTypeForFilename("x.webp")).toBe("image/webp");
    expect(contentTypeForFilename("x.gif")).toBe("image/gif");
    expect(contentTypeForFilename("x.bin")).toBe("application/octet-stream");
  });

  it("builds bucket keys and public urls", () => {
    expect(FEED_IMAGE_PREFIX).toBe("rmharks/");
    expect(feedImageKey("u1-1-2-p.png")).toBe("rmharks/u1-1-2-p.png");
    expect(feedImageUrl("u1-1-2-p.png")).toBe("/api/feed/image/u1-1-2-p.png");
  });
});
