/**
 * Account-recovery policy (I3) — every threshold and state transition, as pure
 * logic, so the rules that decide whether an account changes hands can be
 * tested without a database.
 *
 * Recovery is the cheapest route into an account that holds coins, a
 * membership, purchase history and a storefront. The design is therefore
 * deliberately **slow and loud**: a mandatory delay, a window, a quorum, a
 * notification to every existing session, and a hold on the economy afterwards.
 * Every one of those exists because without it the flow is a
 * social-engineering vector rather than a recovery path.
 */

const HOUR_MS = 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Recovery codes                                                             */
/* -------------------------------------------------------------------------- */

/** Ten single-use codes, shown once. The 80% fix (I3 §1). */
export const RECOVERY_CODE_COUNT = 10;

/** Characters per code, before grouping. 10 × 5 bits = 50 bits of entropy. */
export const RECOVERY_CODE_LENGTH = 10;

/**
 * Crockford base32: no `I`, `L`, `O` or `U`. The first three are removed
 * because a code is read off a screen and typed on a phone; `U` because it is
 * how base32 alphabets accidentally spell words.
 */
export const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Canonical form of a code as the user typed it: uppercase, punctuation and
 * spaces removed, and the four Crockford substitutions applied so `O`→`0`,
 * `I`/`L`→`1` and `U`→`V`. Without this, a correct code transcribed by a human
 * fails perhaps a fifth of the time, and the user concludes recovery is broken.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

/** Display form — `A1B2C-D3E4F`, which is materially easier to read aloud. */
export function formatRecoveryCode(code: string): string {
  const clean = normalizeRecoveryCode(code);
  const half = Math.ceil(clean.length / 2);
  return `${clean.slice(0, half)}-${clean.slice(half)}`;
}

/** Shape check only — says nothing about whether a code is real or unused. */
export function isWellFormedRecoveryCode(input: string): boolean {
  const clean = normalizeRecoveryCode(input);
  if (clean.length !== RECOVERY_CODE_LENGTH) return false;
  return [...clean].every((ch) => RECOVERY_CODE_ALPHABET.includes(ch));
}

/* -------------------------------------------------------------------------- */
/* Trusted contacts                                                           */
/* -------------------------------------------------------------------------- */

/** Nominate three (I3 §3, Facebook's design). */
export const MAX_TRUSTED_CONTACTS = 3;

/** Two of three. One vouching friend is one compromised friend. */
export const REQUIRED_APPROVALS = 2;

/**
 * Fewer than this many *confirmed* contacts and a request can never reach
 * quorum, so starting one would only teach an attacker that the account exists.
 */
export const MIN_CONTACTS_TO_START = REQUIRED_APPROVALS;

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

/** Approvals must land within 72 hours (I3 §3). */
export const RECOVERY_WINDOW_MS = 72 * HOUR_MS;

/**
 * The mandatory delay. Even a fully-approved request cannot be completed for a
 * day, so the real owner — who is notified in every session and by email the
 * moment a request opens — has time to cancel it.
 */
export const RECOVERY_MIN_DELAY_MS = 24 * HOUR_MS;

/**
 * After a completed recovery, the account cannot move coins, change payout
 * details, or file a `RedemptionRequest` for 72 hours.
 *
 * This is not belt-and-braces. Without it, recovery is simply the cheapest
 * route into the economy: the attacker's whole objective is reachable inside
 * the minutes after a takeover, and every other control here only slows the
 * takeover down.
 */
export const RECOVERY_HOLD_MS = 72 * HOUR_MS;

/* -------------------------------------------------------------------------- */
/* Request state                                                              */
/* -------------------------------------------------------------------------- */

export type RecoveryStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'USED';

/** The fields of a `RecoveryRequest` this module reasons about. */
export interface RecoveryRequestState {
  status: string;
  approvals: number;
  approvedBy: readonly string[];
  createdAt: Date;
  expiresAt: Date;
}

export type RecoveryPhase =
  /** Open, still collecting approvals. */
  | 'collecting'
  /** Quorum reached, but the mandatory delay has not elapsed. */
  | 'waiting'
  /** Quorum reached and the delay elapsed — the token may be redeemed. */
  | 'ready'
  /** The window closed (with or without quorum). */
  | 'expired'
  /** The account owner cancelled it. */
  | 'rejected'
  /** Already redeemed. A recovery token is single-use. */
  | 'used';

export interface RecoveryEvaluation {
  phase: RecoveryPhase;
  approvals: number;
  approvalsNeeded: number;
  /** When the token becomes redeemable; null once that no longer applies. */
  unlocksAt: Date | null;
  expiresAt: Date;
  redeemable: boolean;
}

/** The expiry the request is created with. */
export function recoveryExpiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RECOVERY_WINDOW_MS);
}

/** The earliest moment a fully-approved request may be redeemed. */
export function recoveryUnlockFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RECOVERY_MIN_DELAY_MS);
}

/**
 * Where a request stands.
 *
 * Terminal statuses win over the clock: a `USED` request stays `used` after its
 * window closes, because "expired" would suggest nothing happened.
 */
export function evaluateRecoveryRequest(
  request: RecoveryRequestState,
  now: Date = new Date(),
): RecoveryEvaluation {
  const unlocksAt = recoveryUnlockFrom(request.createdAt);
  const base = {
    approvals: request.approvals,
    approvalsNeeded: Math.max(0, REQUIRED_APPROVALS - request.approvals),
    expiresAt: request.expiresAt,
  };

  if (request.status === 'USED') {
    return { ...base, phase: 'used', unlocksAt: null, redeemable: false };
  }
  if (request.status === 'REJECTED') {
    return { ...base, phase: 'rejected', unlocksAt: null, redeemable: false };
  }
  if (request.status === 'EXPIRED' || now.getTime() >= request.expiresAt.getTime()) {
    return { ...base, phase: 'expired', unlocksAt: null, redeemable: false };
  }
  if (request.approvals < REQUIRED_APPROVALS) {
    return { ...base, phase: 'collecting', unlocksAt, redeemable: false };
  }
  if (now.getTime() < unlocksAt.getTime()) {
    return { ...base, phase: 'waiting', unlocksAt, redeemable: false };
  }
  return { ...base, phase: 'ready', unlocksAt, redeemable: true };
}

/** Convenience: may this request's token be redeemed right now? */
export function isRedeemable(request: RecoveryRequestState, now: Date = new Date()): boolean {
  return evaluateRecoveryRequest(request, now).redeemable;
}

export type ApprovalRefusal =
  'not-a-contact' | 'already-approved' | 'not-open' | 'self' | 'unconfirmed-contact';

export type ApprovalDecision = { ok: true } | { ok: false; reason: ApprovalRefusal };

/**
 * May `contactId` vouch for this request?
 *
 * The quorum is only meaningful if every vote is a *distinct, confirmed*
 * contact who is not the account itself — so all three checks live here rather
 * than being re-derived at the call site.
 */
export function canApprove(
  request: RecoveryRequestState & { userId: string },
  contact: { id: string; confirmed: boolean; isTrustedContact: boolean },
  now: Date = new Date(),
): ApprovalDecision {
  const evaluation = evaluateRecoveryRequest(request, now);
  if (
    evaluation.phase === 'expired' ||
    evaluation.phase === 'rejected' ||
    evaluation.phase === 'used'
  ) {
    return { ok: false, reason: 'not-open' };
  }
  if (contact.id === request.userId) return { ok: false, reason: 'self' };
  if (!contact.isTrustedContact) return { ok: false, reason: 'not-a-contact' };
  if (!contact.confirmed) return { ok: false, reason: 'unconfirmed-contact' };
  if (request.approvedBy.includes(contact.id)) return { ok: false, reason: 'already-approved' };
  return { ok: true };
}

/**
 * Apply one approval, returning the next `(approvals, approvedBy, status)`.
 *
 * `approvals` is derived from the de-duplicated approver list rather than being
 * incremented, so a double-write can never inflate the count past the number of
 * distinct people who actually vouched.
 */
export function applyApproval(
  request: RecoveryRequestState,
  contactId: string,
): { approvals: number; approvedBy: string[]; status: RecoveryStatus } {
  const approvedBy = [...new Set([...request.approvedBy, contactId])];
  return {
    approvals: approvedBy.length,
    approvedBy,
    status: approvedBy.length >= REQUIRED_APPROVALS ? 'APPROVED' : 'PENDING',
  };
}

/** Mask an email for display to third parties: `al***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(1, local.length - head.length))}@${domain}`;
}
