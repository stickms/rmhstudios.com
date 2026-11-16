/**
 * The rules that decide whether an empty account may be joined to another, as
 * pure functions so every refusal is unit-tested (`merge-rules.test.ts`).
 * `consolidation.server.ts` does the I/O and calls these.
 *
 * The flow (design: docs/superpowers/specs/2026-11-16-account-consolidation-design.md):
 *   1. Signed in as the new, empty account B, the person starts a merge. The
 *      server stores `sha256(token)` with B's id and puts the token in a signed,
 *      HttpOnly cookie in THIS browser, then ends every session of B.
 *   2. They sign in to their existing account A in the same browser.
 *   3. Signed in as A, they confirm. The server re-checks everything below and
 *      moves B's sign-in methods to A, then deletes B.
 *
 * What makes it safe: the intent lives in one browser's cookie, never in a link,
 * so an attacker who starts a merge from their own account cannot have a victim
 * finish it; and A must have signed in AFTER the intent was created, so an old
 * session sitting in a shared browser cannot be the target either.
 */
import { CREDENTIAL_PROVIDER_ID, FRESH_SESSION_MS } from './providers';

/** How long a started merge stays open. */
export const MERGE_INTENT_TTL_MS = 15 * 60 * 1000;

/** Prefix of the `verification.identifier` that stores a merge intent. */
export const MERGE_INTENT_PREFIX = 'account-merge:';

/** The cookie (before Better Auth's prefix) that carries the intent token. */
export const MERGE_COOKIE = 'account_merge';

export interface MergeIntent {
  /** The empty account whose sign-in methods move. */
  fromUserId: string;
  createdAt: number;
  expiresAt: number;
}

export interface SignInRecord {
  providerId: string;
}

export type MergeEligibility =
  | { eligible: true; methods: string[] }
  | { eligible: false; reason: MergeIneligibleReason };

export type MergeIneligibleReason =
  /** Its only way in is a password, which belongs to its email and does not move. */
  | 'no_movable_method'
  /** It has posts, coins, games or anything else beyond what sign-up creates. */
  | 'has_history'
  /** The history check could not finish (timeout, database error): fail closed. */
  | 'history_unknown';

/**
 * Whether account B may be offered the merge. `history` is the list of tables
 * that hold B's rows beyond the automatic ones, or `null` if the check failed.
 */
export function mergeEligibility(accounts: SignInRecord[], history: string[] | null): MergeEligibility {
  const methods = movableProviderIds(accounts);
  if (methods.length === 0) return { eligible: false, reason: 'no_movable_method' };
  if (history === null) return { eligible: false, reason: 'history_unknown' };
  if (history.length > 0) return { eligible: false, reason: 'has_history' };
  return { eligible: true, methods };
}

/** Provider sign-ins move; an email-and-password credential never does. */
export function movableProviderIds(accounts: SignInRecord[]): string[] {
  return accounts.map((a) => a.providerId).filter((id) => id !== CREDENTIAL_PROVIDER_ID);
}

export type MergeConfirmError =
  | 'no_intent'
  | 'expired'
  | 'same_account'
  | 'stale_sign_in';

/**
 * Whether the signed-in account A may complete this intent now.
 * `targetSessionCreatedAt` is when A's current session was created.
 */
export function checkMergeConfirm(input: {
  intent: MergeIntent | null;
  targetUserId: string;
  targetSessionCreatedAt: number;
  now: number;
}): { ok: true } | { ok: false; error: MergeConfirmError } {
  const { intent, targetUserId, targetSessionCreatedAt, now } = input;
  if (!intent) return { ok: false, error: 'no_intent' };
  if (now >= intent.expiresAt) return { ok: false, error: 'expired' };
  if (intent.fromUserId === targetUserId) return { ok: false, error: 'same_account' };
  // A must have signed in during this flow: after the intent existed, and
  // recently. An already-open session for some other account in this browser
  // is not proof that the person in front of it owns that account.
  if (targetSessionCreatedAt < intent.createdAt) return { ok: false, error: 'stale_sign_in' };
  if (now - targetSessionCreatedAt > FRESH_SESSION_MS) return { ok: false, error: 'stale_sign_in' };
  return { ok: true };
}

/** Read a stored intent back, refusing anything malformed. */
export function parseMergeIntent(value: string): MergeIntent | null {
  try {
    const parsed = JSON.parse(value) as Partial<MergeIntent>;
    if (
      typeof parsed.fromUserId !== 'string' ||
      parsed.fromUserId.length === 0 ||
      typeof parsed.createdAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return { fromUserId: parsed.fromUserId, createdAt: parsed.createdAt, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

/** True when a session is recent enough to change how the account signs in. */
export function isFreshSession(sessionCreatedAt: number, now: number): boolean {
  return now - sessionCreatedAt <= FRESH_SESSION_MS;
}
