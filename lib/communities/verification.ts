/**
 * S2 — community verification levels (client-safe, pure).
 *
 * A community can require, before anyone posts or comments in it, one of:
 *  - `email`        a verified email address,
 *  - `account_age`  an account at least N days old,
 *  - `member_age`   membership of at least N minutes.
 *
 * `checkVerification` is the single decision function: the server calls it on
 * post/comment create (authoritative), the composer shows the same decision
 * (via the `/extras` payload) to explain a refusal before the member types a
 * word. Mods and admins are exempt — the caller decides that, since this module
 * knows nothing about roles.
 */

export const VERIFICATION_LEVELS = ['none', 'email', 'account_age', 'member_age'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const MAX_ACCOUNT_AGE_DAYS = 365;
export const MAX_MEMBER_AGE_MINUTES = 60 * 24 * 30;

export interface VerificationRule {
  level: VerificationLevel;
  /** Days for `account_age`, minutes for `member_age`; ignored otherwise. */
  value: number;
}

export interface VerificationSubject {
  emailVerified: boolean;
  accountCreatedAt: Date | string;
  /** When the member joined this community; null if they are not a member. */
  memberSince: Date | string | null;
}

export type VerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'email' | 'account_age' | 'member_age';
      /** Milliseconds until the requirement is met; null for `email`. */
      remainingMs: number | null;
      /** The configured threshold (days / minutes), for the message. */
      value: number;
      /** English fallback; the UI renders its own translated copy from `reason`. */
      message: string;
    };

export function isVerificationLevel(v: unknown): v is VerificationLevel {
  return typeof v === 'string' && (VERIFICATION_LEVELS as readonly string[]).includes(v);
}

/** Clamp a stored/posted value into the range its level allows. */
export function normalizeVerificationRule(
  level: VerificationLevel,
  value: number,
): VerificationRule {
  if (level === 'account_age') {
    return { level, value: Math.min(MAX_ACCOUNT_AGE_DAYS, Math.max(1, Math.floor(value) || 1)) };
  }
  if (level === 'member_age') {
    return { level, value: Math.min(MAX_MEMBER_AGE_MINUTES, Math.max(1, Math.floor(value) || 1)) };
  }
  return { level, value: 0 };
}

const toMs = (d: Date | string): number => (d instanceof Date ? d.getTime() : Date.parse(d));

export function checkVerification(
  rule: VerificationRule,
  subject: VerificationSubject,
  now: number = Date.now(),
): VerificationResult {
  switch (rule.level) {
    case 'email':
      return subject.emailVerified
        ? { ok: true }
        : {
            ok: false,
            reason: 'email',
            remainingMs: null,
            value: 0,
            message: 'This community requires a verified email address to post.',
          };
    case 'account_age': {
      const need = rule.value * 86_400_000;
      const created = toMs(subject.accountCreatedAt);
      const remaining = created + need - now;
      return remaining <= 0 || !Number.isFinite(created)
        ? { ok: true }
        : {
            ok: false,
            reason: 'account_age',
            remainingMs: remaining,
            value: rule.value,
            message: `This community requires an account at least ${rule.value} day${rule.value === 1 ? '' : 's'} old to post.`,
          };
    }
    case 'member_age': {
      const need = rule.value * 60_000;
      if (subject.memberSince == null) {
        return {
          ok: false,
          reason: 'member_age',
          remainingMs: need,
          value: rule.value,
          message: 'Join the community to post in it.',
        };
      }
      const remaining = toMs(subject.memberSince) + need - now;
      return remaining <= 0
        ? { ok: true }
        : {
            ok: false,
            reason: 'member_age',
            remainingMs: remaining,
            value: rule.value,
            message: `New members can post after ${rule.value} minute${rule.value === 1 ? '' : 's'} in the community.`,
          };
    }
    default:
      return { ok: true };
  }
}
