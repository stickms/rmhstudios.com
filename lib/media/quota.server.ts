import type { Tier } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { redisRateLimit } from "@/lib/redis.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DAILY_UPLOAD_QUOTA: Record<Tier, number> = {
  free: 0,
  starter: 200,
  pro: 1000,
  enterprise: 5000,
};

/** Cross-instance limiter (Redis) with per-instance fallback. */
export async function keyedLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter: number }> {
  const viaRedis = await redisRateLimit(key, max, windowMs);
  if (viaRedis) return viaRedis;
  return rateLimit(key, { limit: max, windowMs });
}

export interface QuotaDeps {
  limit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; retryAfter: number }>;
}

export async function checkDailyUploadQuota(
  deps: QuotaDeps,
  args: { userId: string; tier: Tier }
): Promise<{ allowed: boolean; retryAfter: number }> {
  return deps.limit(`media-quota:${args.userId}`, DAILY_UPLOAD_QUOTA[args.tier], DAY_MS);
}
