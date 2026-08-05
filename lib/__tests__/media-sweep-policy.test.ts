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
  it("constants are 24h and 90d", () => {
    expect(ORPHAN_TTL_MS).toBe(86_400_000);
    // Was 7d, which predated the recycle bin: a post stayed restorable for 30
    // (free) or 90 (member) days while its images were reclaimed on day 7, so
    // a restore on day 20 returned the post without its pictures. The grace
    // now covers the longest retention window — see lib/media/sweep-policy.ts
    // and the cross-check in lib/__tests__/trash.test.ts.
    expect(DELETED_POST_GRACE_MS).toBe(7_776_000_000);
  });
  it("mediaExpiresAt adds 24h", () => {
    expect(mediaExpiresAt(now).toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });
  it("orphanCutoff subtracts 24h", () => {
    expect(orphanCutoff(now).toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });
  it("deletedPostCutoff subtracts 90d", () => {
    expect(deletedPostCutoff(now).toISOString()).toBe("2026-03-24T00:00:00.000Z");
  });
});
