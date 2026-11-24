/**
 * Q&A limit requests (plan R19): a member who needs more than the free daily limit asks, an admin approves or declines,
 * and an approval puts the member in the `approved` tier (`resolveQaTier` in `qa/budget.server.ts` reads the APPROVED
 * row; this module is the only writer). The shape is `lib/library/quota.server.ts`'s: one open request at a time, a
 * compare-and-set on the status so two admins cannot both decide, an audit line per decision.
 *
 * A request holds the applicant's optional reason (500 characters at most) and an admin's optional reply. It never holds
 * a question or an answer. Lives beside, not inside, `api/qa/`, whose files the privacy pins hold to "writes only
 * reservation rows".
 */
import { logAdminAction } from '@/lib/admin-audit.server';
import { AppError } from '@/lib/errors/codes';
import { notice } from '@/lib/notifications/notice-keys';
import { createNotification } from '@/lib/notifications.server';
import { prisma } from '@/lib/prisma.server';
import { QA_LIMIT_NOTE_MAX, QA_LIMIT_REQUEST_COOLDOWN_DAYS } from '../ai-budget';
import type { MedQaLimitRequestRowDto, MedQaLimitRequestStateRes, MedQaTier } from '../medschools.contract';
import { resolveQaTier } from './qa/budget.server';

const DAY_MS = 86_400_000;
const RECENT = 50;

const clip = (s: string | undefined): string => (s ?? '').trim().slice(0, QA_LIMIT_NOTE_MAX);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

interface Row {
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED';
  createdAt: Date;
  decidedAt: Date | null;
  adminNote: string;
  revokedAt?: Date | null;
  revokeNote?: string;
}

const noRequest = (tier: MedQaTier, state: 'none' | 'not-needed'): MedQaLimitRequestStateRes => ({
  state,
  tier,
  requestedAt: null,
  decidedAt: null,
  adminNote: '',
  reapplyOn: null,
});

/** The state the member sees, from their tier and latest request. Pure, so the wait rule is one tested function. */
export function limitState(tier: MedQaTier, latest: Row | null, now: Date): MedQaLimitRequestStateRes {
  if (tier === 'admin' || tier === 'member') return noRequest(tier, 'not-needed');
  if (!latest) return noRequest(tier, 'none');
  const revoked = latest.status === 'REVOKED';
  // A revoke is its own event: the approval's fields stay as they were, the member is shown the revoke.
  const decidedAt = revoked ? (latest.revokedAt ?? latest.decidedAt) : latest.decidedAt;
  const base = {
    tier,
    requestedAt: iso(latest.createdAt),
    decidedAt: iso(decidedAt),
    adminNote: revoked ? (latest.revokeNote ?? '') : latest.adminNote,
  };
  if (latest.status === 'PENDING') return { ...base, state: 'pending', reapplyOn: null };
  if (latest.status === 'APPROVED') return { ...base, state: 'approved', reapplyOn: null };
  // DECLINED and REVOKED both start the wait, from the decline or the revoke.
  const reapply = new Date((decidedAt ?? latest.createdAt).getTime() + QA_LIMIT_REQUEST_COOLDOWN_DAYS * DAY_MS);
  if (reapply.getTime() <= now.getTime()) return noRequest(tier, 'none');
  return { ...base, state: 'declined', reapplyOn: reapply.toISOString() };
}

async function latestRequest(userId: string): Promise<Row | null> {
  return prisma.medQaLimitRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true, decidedAt: true, adminNote: true, revokedAt: true, revokeNote: true },
  });
}

export async function getLimitRequestState(
  userId: string,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<MedQaLimitRequestStateRes> {
  const tier = await resolveQaTier(userId, { isAdmin });
  if (tier === 'admin' || tier === 'member') return noRequest(tier, 'not-needed');
  return limitState(tier, await latestRequest(userId), now);
}

const isUniqueViolation = (e: unknown): boolean => (e as { code?: string } | null)?.code === 'P2002';

/**
 * File a request. Refused (409) for an admin or a paying member, for a member who has the approved tier already, while
 * one is pending, and during the wait after a decline or a revoke. The one-pending rule is also a partial unique index,
 * so two simultaneous submissions end with one row.
 */
export async function submitLimitRequest(
  userId: string,
  isAdmin: boolean,
  note: string | undefined,
  now: Date = new Date(),
): Promise<MedQaLimitRequestStateRes> {
  const current = await getLimitRequestState(userId, isAdmin, now);
  if (current.state === 'not-needed' || current.state === 'approved')
    throw new AppError('MEDSCHOOLS_QA_LIMIT_NOT_NEEDED');
  if (current.state === 'pending') throw new AppError('MEDSCHOOLS_QA_LIMIT_PENDING');
  if (current.state === 'declined') throw new AppError('MEDSCHOOLS_QA_LIMIT_WAIT');
  try {
    await prisma.medQaLimitRequest.create({ data: { userId, note: clip(note) } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('MEDSCHOOLS_QA_LIMIT_PENDING');
    throw e;
  }
  return getLimitRequestState(userId, isAdmin, now);
}

const ROW_SELECT = {
  id: true,
  status: true,
  note: true,
  adminNote: true,
  createdAt: true,
  decidedAt: true,
  revokedAt: true,
  revokeNote: true,
  user: { select: { id: true, handle: true, name: true } },
} as const;

type DbRow = {
  id: string;
  status: MedQaLimitRequestRowDto['status'];
  note: string;
  adminNote: string;
  createdAt: Date;
  decidedAt: Date | null;
  revokedAt: Date | null;
  revokeNote: string;
  user: { id: string; handle: string | null; name: string | null };
};

const toDto = (r: DbRow): MedQaLimitRequestRowDto => ({
  id: r.id,
  status: r.status,
  note: r.note,
  adminNote: r.adminNote,
  createdAt: r.createdAt.toISOString(),
  decidedAt: iso(r.decidedAt),
  revokedAt: iso(r.revokedAt),
  revokeNote: r.revokeNote,
  user: { id: r.user.id, handle: r.user.handle, name: r.user.name },
});

/**
 * Admin review list: every pending request (oldest first), every approval still in force (so none can fall out of view
 * and become impossible to revoke), and the most recent declines and revokes.
 */
export async function listLimitRequests(): Promise<{
  pending: MedQaLimitRequestRowDto[];
  active: MedQaLimitRequestRowDto[];
  recent: MedQaLimitRequestRowDto[];
}> {
  const [pending, active, declined, revoked] = await Promise.all([
    prisma.medQaLimitRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: ROW_SELECT,
    }),
    prisma.medQaLimitRequest.findMany({
      where: { status: 'APPROVED' },
      orderBy: { decidedAt: 'desc' },
      select: ROW_SELECT,
    }),
    prisma.medQaLimitRequest.findMany({
      where: { status: 'DECLINED' },
      orderBy: { decidedAt: 'desc' },
      take: RECENT,
      select: ROW_SELECT,
    }),
    prisma.medQaLimitRequest.findMany({
      where: { status: 'REVOKED' },
      orderBy: { revokedAt: 'desc' },
      take: RECENT,
      select: ROW_SELECT,
    }),
  ]);
  const when = (r: DbRow) => (r.revokedAt ?? r.decidedAt ?? r.createdAt).getTime();
  const recent = ([...declined, ...revoked] as DbRow[]).sort((a, b) => when(b) - when(a)).slice(0, RECENT);
  return {
    pending: (pending as DbRow[]).map(toDto),
    active: (active as DbRow[]).map(toDto),
    recent: recent.map(toDto),
  };
}

export type LimitAction = 'approve' | 'decline' | 'revoke';

const AFTER: Record<LimitAction, { from: 'PENDING' | 'APPROVED'; to: 'APPROVED' | 'DECLINED' | 'REVOKED' }> = {
  approve: { from: 'PENDING', to: 'APPROVED' },
  decline: { from: 'PENDING', to: 'DECLINED' },
  revoke: { from: 'APPROVED', to: 'REVOKED' },
};

/**
 * Approve or decline a pending request, or revoke an approval. A compare-and-set on the status: two admins deciding at
 * once leave one decision (the other gets 409), and only the winner changes the member's tier. 404 for an unknown id.
 */
export async function decideLimitRequest(
  adminId: string,
  input: { id: string; action: LimitAction; adminNote?: string | undefined },
  now: Date = new Date(),
): Promise<void> {
  const row = await prisma.medQaLimitRequest.findUnique({ where: { id: input.id }, select: { userId: true } });
  if (!row) throw new AppError('NOT_FOUND');
  const { from, to } = AFTER[input.action];
  let claimed: { count: number };
  try {
    claimed = await prisma.medQaLimitRequest.updateMany({
      where: { id: input.id, status: from },
      // A revoke is recorded beside the approval, which stays as it was; approve and decline are the decision.
      data:
        input.action === 'revoke'
          ? { status: to, revokedAt: now, revokedBy: adminId, revokeNote: clip(input.adminNote) }
          : { status: to, decidedAt: now, decidedBy: adminId, adminNote: clip(input.adminNote) },
    });
  } catch (e) {
    // An approval the member somehow already holds (the one-approved index): same answer as a lost race.
    if (isUniqueViolation(e)) throw new AppError('CONFLICT');
    throw e;
  }
  if (claimed.count === 0) throw new AppError('CONFLICT');
  void logAdminAction(adminId, `medschools.qa-limit.${input.action}`, { targetType: 'User', targetId: row.userId });
  // A decision tells the applicant (owner, 2026-11-23). Best-effort: the decision stands if the notice cannot be written.
  const note = clip(input.adminNote);
  const key = `medschools-qa-limit-${to.toLowerCase() as 'approved' | 'declined' | 'revoked'}` as const;
  void Promise.resolve(
    createNotification({
      userId: row.userId,
      type: 'SYSTEM',
      entityType: 'medschools-qa-limit',
      entityId: input.id,
      preview: note ? notice(`${key}-note`, { note }) : notice(key, {}),
      link: '/med/ask',
    }),
  ).catch(() => {});
}
