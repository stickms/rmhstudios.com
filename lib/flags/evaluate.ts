import { createHash } from 'node:crypto';

/**
 * A feature flag as stored (`feature_flag` table). Flags decouple deploy from
 * release: code ships dark, an admin turns it on for a percentage of users, and
 * turning it off again is a row update, not a rollback.
 */
export interface FlagRecord {
  key: string;
  enabled: boolean;
  /** 0–100. Only consulted while `enabled`. */
  rolloutPercent: number;
}

export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;

/**
 * Stable 0–99 bucket for (flag, user). Salted with the key so one user is not in
 * every flag's first 10%, and stable across processes and deploys so a user does
 * not flicker in and out of a rollout.
 */
export function bucketFor(key: string, userId: string): number {
  const digest = createHash('sha256').update(`${key}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

/**
 * Whether the flag is on for this caller. An anonymous caller has no stable
 * identity to bucket, so they only see a flag that is fully rolled out.
 */
export function evaluateFlag(flag: FlagRecord | undefined, userId?: string | null): boolean {
  if (!flag || !flag.enabled) return false;
  const percent = Math.min(100, Math.max(0, Math.trunc(flag.rolloutPercent)));
  if (percent >= 100) return true;
  if (percent <= 0 || !userId) return false;
  return bucketFor(flag.key, userId) < percent;
}
