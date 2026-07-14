import { describe, it, expect } from "vitest";
import { createRMHarkSchema, editRMHarkSchema } from "@/lib/rmhark-schema";

describe("createRMHarkSchema imageUrls", () => {
  it("accepts a post with only images (no text/poll/gif)", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["/api/feed/image/u1-1-2-pic.png"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects more than 4 images", () => {
    const r = createRMHarkSchema.safeParse({
      content: "hi",
      imageUrls: [
        "/api/feed/image/a.png",
        "/api/feed/image/b.png",
        "/api/feed/image/c.png",
        "/api/feed/image/d.png",
        "/api/feed/image/e.png",
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects image urls that are not feed-image paths", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["https://evil.example/x.png"],
    });
    expect(r.success).toBe(false);
  });

  it("still rejects a fully empty post", () => {
    const r = createRMHarkSchema.safeParse({ imageUrls: [] });
    expect(r.success).toBe(false);
  });
});

describe("createRMHarkSchema imageAlts (accessibility)", () => {
  it("accepts alt text aligned with images", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["/api/feed/image/a.png", "/api/feed/image/b.png"],
      imageAlts: ["a cat", "a dog"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts fewer alts than images (partial descriptions)", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["/api/feed/image/a.png", "/api/feed/image/b.png"],
      imageAlts: ["a cat"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects more alts than images", () => {
    const r = createRMHarkSchema.safeParse({
      imageUrls: ["/api/feed/image/a.png"],
      imageAlts: ["a cat", "a dog"],
    });
    expect(r.success).toBe(false);
  });
});

describe("editRMHarkSchema", () => {
  it("accepts content with a tenor gifUrl", () => {
    const r = editRMHarkSchema.safeParse({ content: "hi", gifUrl: "https://media.tenor.com/x/full.gif" });
    expect(r.success).toBe(true);
  });
  it("accepts null gifUrl (removing a gif)", () => {
    const r = editRMHarkSchema.safeParse({ content: "hi", gifUrl: null });
    expect(r.success).toBe(true);
  });
  it("rejects a non-media gifUrl", () => {
    const r = editRMHarkSchema.safeParse({ content: "hi", gifUrl: "https://evil.example/page" });
    expect(r.success).toBe(false);
  });
});
