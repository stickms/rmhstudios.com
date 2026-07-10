import { describe, it, expect } from "vitest";
import { buildGifSearchPath } from "@/lib/gif-search";

describe("buildGifSearchPath", () => {
  it("omits q and pos when empty", () => {
    expect(buildGifSearchPath("", null)).toBe("/api/gif/search");
  });
  it("includes q when present", () => {
    expect(buildGifSearchPath("happy cat", null)).toBe("/api/gif/search?q=happy+cat");
  });
  it("includes q and pos when both present", () => {
    expect(buildGifSearchPath("cat", "20")).toBe("/api/gif/search?q=cat&pos=20");
  });
});
