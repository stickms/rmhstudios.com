import { describe, it, expect } from "vitest";
import { MEDIA_ID_PREFIX, newMediaId, isMediaId } from "@/lib/media/id";

describe("media id", () => {
  it("newMediaId is prefixed and unique", () => {
    const a = newMediaId();
    const b = newMediaId();
    expect(a.startsWith(MEDIA_ID_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThan(MEDIA_ID_PREFIX.length);
    expect(a).not.toBe(b);
  });

  it("isMediaId accepts our ids and rejects junk", () => {
    expect(isMediaId(newMediaId())).toBe(true);
    expect(isMediaId("media_")).toBe(true);
    expect(isMediaId("nope")).toBe(false);
    expect(isMediaId("")).toBe(false);
    expect(isMediaId(null)).toBe(false);
    expect(isMediaId(123)).toBe(false);
  });
});
