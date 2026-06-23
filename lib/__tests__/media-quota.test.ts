import { describe, it, expect, vi } from "vitest";
import { DAILY_UPLOAD_QUOTA, checkDailyUploadQuota } from "@/lib/media/quota.server";

describe("daily upload quota", () => {
  it("quota map matches the spec", () => {
    expect(DAILY_UPLOAD_QUOTA).toEqual({ free: 0, starter: 200, pro: 1000, enterprise: 5000 });
  });

  it("limits per user with the tier's max over a 24h window", async () => {
    const limit = vi.fn(async () => ({ allowed: true, retryAfter: 0 }));
    const res = await checkDailyUploadQuota({ limit }, { userId: "u1", tier: "pro" });
    expect(res.allowed).toBe(true);
    expect(limit).toHaveBeenCalledWith("media-quota:u1", 1000, 24 * 60 * 60 * 1000);
  });

  it("propagates a deny", async () => {
    const limit = vi.fn(async () => ({ allowed: false, retryAfter: 3600 }));
    const res = await checkDailyUploadQuota({ limit }, { userId: "u1", tier: "starter" });
    expect(res).toEqual({ allowed: false, retryAfter: 3600 });
    expect(limit).toHaveBeenCalledWith("media-quota:u1", 200, 24 * 60 * 60 * 1000);
  });
});
