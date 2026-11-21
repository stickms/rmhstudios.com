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

// Defined in ./key (client-safe) and re-exported so server callers keep one import.
export { FLAG_KEY_PATTERN } from './key';

/**
 * Stable 0–99 bucket for (flag, user). Salted with the key so one user is not in
 * every flag's first 10%, and stable across processes and deploys so a user does
 * not flicker in and out of a rollout.
 */
export function bucketFor(
  key: string,
  userId: string,
): number {
  const digest =
    createHash(
      'sha256',
    )
      .update(
        `${key}:${userId}`,
      )
      .digest();
  return (
    digest.readUInt32BE(
      0,
    ) %
    100
  );
}

/**
 * Per-member targeting for one flag (s04-20), as the evaluator reads it: sets, built once when the flag cache
 * loads. It lives beside {@link FlagRecord} rather than inside it so the record, which is the shape a client may
 * see, never carries a member id; the lists stay on the server.
 */
export interface FlagTargeting {
  /** Members the flag is always on for while it is enabled. */
  allow: ReadonlySet<string>;
  /** Members the flag is always off for. Beats `allow`. */
  deny: ReadonlySet<string>;
}

/** Why a flag resolved the way it did; the admin check tool turns this into a sentence. */
export type FlagReason =
  | { code: 'missing' }
  | { code: 'disabled' }
  | { code: 'denied' }
  | { code: 'allowed' }
  | { code: 'full' }
  | { code: 'anonymous'; percent: number }
  | { code: 'bucket'; bucket: number; percent: number };

export interface FlagExplanation {
  on: boolean;
  reason: FlagReason;
}

/**
 * Resolve a flag for a caller and say why. Order: not enabled -> off (the kill switch beats everything, the allow
 * list included); denied -> off; allowed -> on; 100% -> on; anonymous -> off; otherwise the (key, user) bucket.
 * Pure and client-safe: no I/O, so a failure to load the lists can only mean "no lists".
 */
export function explainFlag(
  flag: FlagRecord | undefined,
  userId?: string | null,
  targeting?: FlagTargeting,
): FlagExplanation {
  if (!flag) return { on: false, reason: { code: 'missing' } };
  if (!flag.enabled) return { on: false, reason: { code: 'disabled' } };
  if (userId && targeting?.deny.has(userId)) return { on: false, reason: { code: 'denied' } };
  if (userId && targeting?.allow.has(userId)) return { on: true, reason: { code: 'allowed' } };
  const percent = Math.min(100, Math.max(0, Math.trunc(flag.rolloutPercent)));
  if (percent >= 100) return { on: true, reason: { code: 'full' } };
  if (!userId) return { on: false, reason: { code: 'anonymous', percent } };
  const bucket = bucketFor(flag.key, userId);
  return { on: bucket < percent, reason: { code: 'bucket', bucket, percent } };
}

/**
 * Whether the flag is on for this caller. An anonymous caller has no stable identity to bucket (or to
 * target), so they only see a flag that is fully rolled out.
 */
export function evaluateFlag(
  flag: FlagRecord | undefined,
  userId?: string | null,
  targeting?: FlagTargeting,
): boolean {
  return explainFlag(flag, userId, targeting).on;
}
