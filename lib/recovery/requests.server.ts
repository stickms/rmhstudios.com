/**
 * Trusted-contact account recovery (I3 §3) — the request lifecycle.
 *
 * The shape of the flow, and why each step is there:
 *
 *  1. **Start** (anonymous). The initiator names the account's handle and the
 *     address they want access sent to. A single-use token is emailed to that
 *     address — never returned in the HTTP response — so the endpoint answers
 *     identically whether or not the account exists, and starting a request
 *     already requires control of the destination inbox.
 *  2. **Notify**, immediately: the owner in-app and at their current primary
 *     address, and every confirmed trusted contact. This is the step that makes
 *     the flow a recovery path instead of a social-engineering vector.
 *  3. **Approve**: two of three confirmed contacts, inside 72 hours. The
 *     destination address is shown (masked) to each contact, so they are
 *     approving a specific destination, not an abstraction.
 *  4. **Wait**: a mandatory 24 hours from the request, even when quorum lands
 *     in the first minute. This is the owner's window to cancel.
 *  5. **Complete**: the token is redeemed once. The account's sign-in address
 *     becomes the destination, **every session and every `DeveloperApiKey` is
 *     invalidated**, an `AdminAuditLog` row is written, and the 72-hour economy
 *     hold (`hold.server.ts`) starts.
 *
 * The token is bound to the destination address (`sha256(token \n email)`), so
 * a token cannot be replayed against a different destination than the one the
 * contacts were shown and approved.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import {
  MIN_CONTACTS_TO_START,
  applyApproval,
  canApprove,
  evaluateRecoveryRequest,
  maskEmail,
  recoveryExpiryFrom,
  type ApprovalRefusal,
  type RecoveryEvaluation,
} from '@/lib/recovery/policy';
import { RECOVERY_COMPLETED_ACTION } from '@/lib/recovery/hold.server';
import {
  notifyContactOfRecoveryRequest,
  notifyOldEmailOfCompletion,
  notifyOwnerOfRecoveryStart,
  sendRecoveryToken,
} from '@/lib/recovery/notify.server';

/* -------------------------------------------------------------------------- */
/* Token                                                                      */
/* -------------------------------------------------------------------------- */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Bind the token to its destination address, so it cannot be re-aimed. */
function hashToken(token: string, email: string): string {
  return createHash('sha256')
    .update(`${token}\n${normalizeEmail(email)}`)
    .digest('hex');
}

function tokenMatches(token: string, email: string, storedHash: string): boolean {
  const computed = Buffer.from(hashToken(token, email), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Open a recovery request.
 *
 * Returns nothing on purpose. Every caller answers `{ ok: true }` regardless,
 * so an unauthenticated endpoint cannot be used to enumerate handles, discover
 * who has trusted contacts configured, or probe how many they have.
 */
export async function startRecoveryRequest(input: {
  handle: string;
  destinationEmail: string;
}): Promise<void> {
  const handle = input.handle.trim().toLowerCase().replace(/^@/, '');
  const destinationEmail = normalizeEmail(input.destinationEmail);

  const user = await prisma.user.findUnique({
    where: { handle },
    select: { id: true, email: true, name: true, handle: true },
  });
  if (!user) return;

  const contacts = await prisma.trustedContact.findMany({
    where: { userId: user.id, confirmedAt: { not: null } },
    select: { contactId: true },
  });
  if (contacts.length < MIN_CONTACTS_TO_START) return;

  // One live request at a time. Otherwise "start a request" is a free way to
  // spam the owner and their contacts with alarming notifications.
  const now = new Date();
  const open = await prisma.recoveryRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: ['PENDING', 'APPROVED'] },
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (open) return;

  const token = randomBytes(32).toString('base64url');
  const request = await prisma.recoveryRequest.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token, destinationEmail),
      expiresAt: recoveryExpiryFrom(now),
    },
    select: { id: true },
  });

  await sendRecoveryToken({ to: destinationEmail, requestId: request.id, token });
  await notifyOwnerOfRecoveryStart({
    userId: user.id,
    email: user.email,
    requestId: request.id,
    destinationEmail,
  });
  await Promise.all(
    contacts.map((contact) =>
      notifyContactOfRecoveryRequest({
        contactId: contact.contactId,
        ownerId: user.id,
        ownerName: user.name ?? `@${user.handle ?? handle}`,
        requestId: request.id,
        destinationEmail,
      }),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Read                                                                       */
/* -------------------------------------------------------------------------- */

export interface RecoveryRequestDTO {
  id: string;
  createdAt: string;
  expiresAt: string;
  unlocksAt: string | null;
  phase: RecoveryEvaluation['phase'];
  approvals: number;
  approvalsNeeded: number;
  /** Only present on requests the caller can vouch for. */
  owner?: ResolvedUser;
  /** Has the caller already approved this one? */
  approvedByMe?: boolean;
}

function toDTO(
  request: {
    id: string;
    status: string;
    approvals: number;
    approvedBy: string[];
    createdAt: Date;
    expiresAt: Date;
  },
  now: Date,
): RecoveryRequestDTO {
  const evaluation = evaluateRecoveryRequest(request, now);
  return {
    id: request.id,
    createdAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    unlocksAt: evaluation.unlocksAt ? evaluation.unlocksAt.toISOString() : null,
    phase: evaluation.phase,
    approvals: evaluation.approvals,
    approvalsNeeded: evaluation.approvalsNeeded,
  };
}

/** Requests opened against the caller's OWN account — the cancel surface. */
export async function listOwnRecoveryRequests(
  userId: string,
  now: Date = new Date(),
): Promise<RecoveryRequestDTO[]> {
  const rows = await prisma.recoveryRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  return rows.map((row) => toDTO(row, now));
}

/** Open requests the caller can vouch for, as a confirmed trusted contact. */
export async function listApprovableRequests(
  contactId: string,
  now: Date = new Date(),
): Promise<RecoveryRequestDTO[]> {
  const nominations = await prisma.trustedContact.findMany({
    where: { contactId, confirmedAt: { not: null } },
    select: { userId: true },
  });
  if (nominations.length === 0) return [];

  const rows = await prisma.recoveryRequest.findMany({
    where: {
      userId: { in: nominations.map((n) => n.userId) },
      status: { in: ['PENDING', 'APPROVED'] },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: userDisplaySelect } },
  });

  return rows.map((row) => ({
    ...toDTO(row, now),
    owner: resolveUser(row.user),
    approvedByMe: row.approvedBy.includes(contactId),
  }));
}

/* -------------------------------------------------------------------------- */
/* Approve / cancel                                                           */
/* -------------------------------------------------------------------------- */

export type ApproveResult =
  | { ok: true; approvals: number; phase: RecoveryEvaluation['phase'] }
  | { ok: false; reason: ApprovalRefusal | 'not-found'; message: string };

const APPROVAL_MESSAGES: Record<ApprovalRefusal | 'not-found', string> = {
  'not-found': 'Recovery request not found',
  'not-a-contact': 'You are not a trusted contact for that account',
  'unconfirmed-contact': 'Accept the trusted-contact request first',
  'already-approved': 'You have already approved this request',
  'not-open': 'That recovery request is no longer open',
  self: 'You cannot approve your own recovery request',
};

/**
 * Vouch for a request as a confirmed trusted contact.
 *
 * `attempt` bounds the compare-and-set retry below. With at most three
 * approvers the loop cannot realistically run twice, but an unbounded retry in
 * the code path that grants account access is not a thing to leave to
 * "realistically".
 */
export async function approveRecoveryRequest(
  contactId: string,
  requestId: string,
  now: Date = new Date(),
  attempt = 0,
): Promise<ApproveResult> {
  const request = await prisma.recoveryRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, reason: 'not-found', message: APPROVAL_MESSAGES['not-found'] };

  const nomination = await prisma.trustedContact.findUnique({
    where: { userId_contactId: { userId: request.userId, contactId } },
    select: { confirmedAt: true },
  });

  const decision = canApprove(
    request,
    {
      id: contactId,
      isTrustedContact: nomination !== null,
      confirmed: nomination?.confirmedAt != null,
    },
    now,
  );
  if (!decision.ok) {
    return { ok: false, reason: decision.reason, message: APPROVAL_MESSAGES[decision.reason] };
  }

  const next = applyApproval(request, contactId);
  // Guarded on the approver list we read, so two contacts approving at the same
  // instant cannot both write a stale list and lose one of the votes.
  const { count } = await prisma.recoveryRequest.updateMany({
    where: { id: request.id, approvals: request.approvals },
    data: { approvals: next.approvals, approvedBy: next.approvedBy, status: next.status },
  });
  if (count !== 1) {
    // Lost the race — re-read and answer from the winning state.
    const fresh = await prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!fresh) return { ok: false, reason: 'not-found', message: APPROVAL_MESSAGES['not-found'] };
    if (fresh.approvedBy.includes(contactId)) {
      return {
        ok: true,
        approvals: fresh.approvals,
        phase: evaluateRecoveryRequest(fresh, now).phase,
      };
    }
    if (attempt >= 3) {
      return { ok: false, reason: 'not-open', message: APPROVAL_MESSAGES['not-open'] };
    }
    return approveRecoveryRequest(contactId, requestId, now, attempt + 1);
  }

  return {
    ok: true,
    approvals: next.approvals,
    phase: evaluateRecoveryRequest({ ...request, ...next }, now).phase,
  };
}

/**
 * The owner cancels a request against their own account.
 *
 * This is what the mandatory delay buys, and it is why every session and the
 * primary email are told the moment a request opens.
 */
export async function cancelRecoveryRequest(userId: string, requestId: string): Promise<boolean> {
  const { count } = await prisma.recoveryRequest.updateMany({
    where: { id: requestId, userId, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'REJECTED' },
  });
  return count === 1;
}

/* -------------------------------------------------------------------------- */
/* Complete                                                                   */
/* -------------------------------------------------------------------------- */

export type CompleteFailure = 'not-found' | 'invalid-token' | 'not-ready' | 'email-taken';

export type CompleteResult =
  { ok: true; userId: string } | { ok: false; reason: CompleteFailure; message: string };

/**
 * Redeem a recovery token.
 *
 * Everything that must be true is re-checked here, never trusted from whatever
 * the client thinks: quorum, the mandatory delay, the window, the token, and
 * that the destination address is not already somebody else's sign-in address.
 *
 * On success, in one transaction:
 *   - the account's sign-in address becomes the destination, unverified (the
 *     verification email that follows is what proves it);
 *   - **every session row is deleted** — the takeover, if that is what this
 *     was, does not get to keep a live browser;
 *   - **every `DeveloperApiKey` is revoked** — an API key outlives a session
 *     and is the obvious way to keep access after being signed out;
 *   - the request is marked `USED`, and any other open request on the account
 *     is rejected.
 *
 * Then, outside the transaction: the audit row (which is also what starts the
 * 72-hour economy hold), a final email to the old address, and Better Auth's
 * own verification + password-reset mails to the new one.
 */
export async function completeRecoveryRequest(input: {
  requestId: string;
  token: string;
  destinationEmail: string;
  now?: Date;
}): Promise<CompleteResult> {
  const now = input.now ?? new Date();
  const destinationEmail = normalizeEmail(input.destinationEmail);

  const request = await prisma.recoveryRequest.findUnique({ where: { id: input.requestId } });
  if (!request) return { ok: false, reason: 'not-found', message: 'Recovery request not found' };

  // Token first: a caller who does not hold it learns nothing about the state.
  if (!tokenMatches(input.token, destinationEmail, request.tokenHash)) {
    return { ok: false, reason: 'invalid-token', message: 'That recovery link is not valid' };
  }

  const evaluation = evaluateRecoveryRequest(request, now);
  if (!evaluation.redeemable) {
    return {
      ok: false,
      reason: 'not-ready',
      message:
        evaluation.phase === 'collecting'
          ? 'Not enough trusted contacts have approved yet'
          : evaluation.phase === 'waiting'
            ? 'Approved. The mandatory 24-hour wait has not finished yet.'
            : 'That recovery request is no longer valid',
    };
  }

  const [owner, emailOwner] = await Promise.all([
    prisma.user.findUnique({ where: { id: request.userId }, select: { id: true, email: true } }),
    prisma.user.findUnique({ where: { email: destinationEmail }, select: { id: true } }),
  ]);
  if (!owner) return { ok: false, reason: 'not-found', message: 'Account not found' };
  if (emailOwner && emailOwner.id !== owner.id) {
    return {
      ok: false,
      reason: 'email-taken',
      message: 'That address already belongs to another account',
    };
  }

  // Told at the old address BEFORE it is replaced — afterwards we no longer
  // know where to send it.
  await notifyOldEmailOfCompletion({ email: owner.email, newEmail: destinationEmail });

  let claimedByUs = false;
  await prisma.$transaction(async (tx) => {
    // Single-use, enforced by the guarded update rather than by having read the
    // row a moment ago: if another caller redeemed it in between, this writes
    // nothing and the rest of the transaction is skipped.
    const claimed = await tx.recoveryRequest.updateMany({
      where: { id: request.id, status: { in: ['PENDING', 'APPROVED'] } },
      data: { status: 'USED' },
    });
    if (claimed.count !== 1) return;
    claimedByUs = true;

    await tx.user.update({
      where: { id: owner.id },
      data: { email: destinationEmail, emailVerified: false },
    });
    await tx.session.deleteMany({ where: { userId: owner.id } });
    await tx.developerApiKey.updateMany({
      where: { userId: owner.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.recoveryRequest.updateMany({
      where: { userId: owner.id, status: { in: ['PENDING', 'APPROVED'] } },
      data: { status: 'REJECTED' },
    });
  });

  if (!claimedByUs) {
    return { ok: false, reason: 'not-ready', message: 'That recovery link has already been used' };
  }

  // The audit row is mandatory (I3) AND is what the 72-hour economy hold is
  // derived from, so the trail and the hold can never disagree. `adminId` is
  // the recovered account: no admin acted, and the FK needs a real user.
  await logAdminAction(owner.id, RECOVERY_COMPLETED_ACTION, {
    targetType: 'user',
    targetId: owner.id,
    detail: `recovery ${request.id} completed with ${request.approvals} approvals → ${maskEmail(destinationEmail)}`,
  });

  // Best-effort: a mail failure must not leave the account half-recovered.
  await auth.api
    .sendVerificationEmail({ body: { email: destinationEmail, callbackURL: '/settings/security' } })
    .catch(() => {});
  await auth.api
    .requestPasswordReset({ body: { email: destinationEmail, redirectTo: '/login' } })
    .catch(() => {});

  return { ok: true, userId: owner.id };
}
