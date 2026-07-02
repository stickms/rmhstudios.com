// lib/__tests__/storage-keys.test.ts
import { describe, it, expect } from "vitest";
import {
  FEED_IMAGE_PREFIX,
  isSafeFilename,
  contentTypeForFilename,
  feedImageKey,
  feedImageUrl,
  ownsFeedImageUrl,
  withImageDimensions,
  parseImageDimensions,
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

describe("ownsFeedImageUrl", () => {
  it("returns true when the filename belongs to the given user", () => {
    expect(ownsFeedImageUrl("/api/feed/image/user1-123-456.png", "user1")).toBe(true);
  });

  it("returns false when the filename belongs to a different user", () => {
    expect(ownsFeedImageUrl("/api/feed/image/user2-123-456.png", "user1")).toBe(false);
  });

  it("returns false for non-feed URLs", () => {
    expect(ownsFeedImageUrl("https://evil.example/x.png", "user1")).toBe(false);
  });

  it("returns false for prefix-collision: user1 must not match user12's image", () => {
    expect(ownsFeedImageUrl("/api/feed/image/user12-9-9.png", "user1")).toBe(false);
  });
});

describe("image dimension tagging", () => {
  it("inserts a -WxH tag before the extension", () => {
    expect(withImageDimensions("u1-123-456.webp", 1200, 800)).toBe("u1-123-456-1200x800.webp");
  });

  it("leaves the filename unchanged when dimensions are missing or invalid", () => {
    expect(withImageDimensions("u1-123.webp")).toBe("u1-123.webp");
    expect(withImageDimensions("u1-123.webp", 0, 800)).toBe("u1-123.webp");
    expect(withImageDimensions("u1-123.webp", 1200, 999999)).toBe("u1-123.webp");
    expect(withImageDimensions("noext", 10, 10)).toBe("noext");
  });

  it("keeps tagged filenames safe and round-trips the dimensions", () => {
    const tagged = withImageDimensions("u1-123-456.webp", 1200, 800);
    expect(isSafeFilename(tagged)).toBe(true);
    expect(parseImageDimensions(tagged)).toEqual({ width: 1200, height: 800 });
  });

  it("parses dimensions from a full URL, ignoring the query string", () => {
    expect(parseImageDimensions("/api/feed/image/u1-1-2-640x360.webp?w=320")).toEqual({
      width: 640,
      height: 360,
    });
    expect(parseImageDimensions("https://cdn.example/rmharks/u1-1-2-1920x1080.webp")).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("returns null for legacy/untagged names", () => {
    expect(parseImageDimensions("u1-123-456.webp")).toBeNull();
    // A trailing numeric id that isn't a WxH pair must not be mistaken for one.
    expect(parseImageDimensions("u1-123-456789.webp")).toBeNull();
  });
});
