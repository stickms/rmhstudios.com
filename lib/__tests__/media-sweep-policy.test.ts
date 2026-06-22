import { describe, it, expect } from "vitest";
import {
  ORPHAN_TTL_MS,
  DELETED_POST_GRACE_MS,
  mediaExpiresAt,
  orphanCutoff,
  deletedPostCutoff,
} from "@/lib/media/sweep-policy";

const now = new Date("2026-06-22T00:00:00.000Z");

describe("sweep policy", () => {
  it("constants are 24h and 7d", () => {
    expect(ORPHAN_TTL_MS).toBe(86_400_000);
    expect(DELETED_POST_GRACE_MS).toBe(604_800_000);
  });
  it("mediaExpiresAt adds 24h", () => {
    expect(mediaExpiresAt(now).toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });
  it("orphanCutoff subtracts 24h", () => {
    expect(orphanCutoff(now).toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });
  it("deletedPostCutoff subtracts 7d", () => {
    expect(deletedPostCutoff(now).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});
