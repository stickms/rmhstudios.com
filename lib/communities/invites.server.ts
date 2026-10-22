/**
 * Invite links for private communities (server-only).
 *
 * A code is 192 random bits (`crypto.randomBytes`, base64url) and is the whole
 * credential: whoever holds a valid one may join without a moderator's approval.
 *
 * **Accepting is one conditional UPDATE** (`uses = uses + 1 WHERE <still valid>`)
 * in the same transaction that creates the membership, so `maxUses` cannot be
 * overshot by concurrent accepts and a revoked or expired code cannot be
 * consumed. Every way a code can be unusable — unknown, revoked, expired,
 * exhausted, or for a different community — yields the same `invalid` result, so
 * codes cannot be probed for which state they are in.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';

/** Bounds on what a moderator may create. */
export const INVITE_LIMITS = {
  /** Highest `maxUses` a link may carry. */
  maxUsesCap: 1000,
  /** Longest expiry a link may carry, in days. */
  maxExpiryDays: 90,
  /** Non-revoked, non-expired links one community may hold at once. */
  activePerCommunity: 50,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 24 random bytes = 192 bits, 32 URL-safe characters. */
export function generateInviteCode(): string {
  return randomBytes(24).toString('base64url');
}

export interface InviteDTO {
  id: string;
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; handle: string | null };
  /** `active` can still be used; the others are shown greyed to moderators. */
  state: 'active' | 'expired' | 'exhausted';
}

export type CreateInviteResult =
  | { ok: true; invite: InviteDTO }
  | { ok: false; reason: 'limit' };

function stateOf(row: { maxUses: number | null; uses: number; expiresAt: Date | null }, now: Date) {
  if (row.expiresAt && row.expiresAt <= now) return 'expired' as const;
  if (row.maxUses !== null && row.uses >= row.maxUses) return 'exhausted' as const;
  return 'active' as const;
}

const SELECT = {
  id: true,
  code: true,
  maxUses: true,
  uses: true,
  expiresAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true, handle: true } },
} as const;

function toDTO(
  row: {
    id: bigint;
    code: string;
    maxUses: number | null;
    uses: number;
    expiresAt: Date | null;
    createdAt: Date;
    createdBy: { id: string; name: string | null; handle: string | null };
  },
  now = new Date(),
): InviteDTO {
  return {
    id: row.id.toString(),
    code: row.code,
    maxUses: row.maxUses,
    uses: row.uses,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    state: stateOf(row, now),
  };
}

export async function createInvite(
  communityId: string,
  createdById: string,
  opts: { maxUses?: number | null; expiresInDays?: number | null },
): Promise<CreateInviteResult> {
  const now = new Date();
  const active = await prisma.communityInvite.count({
    where: {
      communityId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (active >= INVITE_LIMITS.activePerCommunity) return { ok: false, reason: 'limit' };

  const row = await prisma.communityInvite.create({
    data: {
      communityId,
      createdById,
      code: generateInviteCode(),
      maxUses: opts.maxUses ?? null,
      expiresAt: opts.expiresInDays ? new Date(now.getTime() + opts.expiresInDays * DAY_MS) : null,
    },
    select: SELECT,
  });
  return { ok: true, invite: toDTO(row, now) };
}

/** Non-revoked links, newest first (bounded). Moderators only — codes are secrets. */
export async function listInvites(communityId: string): Promise<InviteDTO[]> {
  const now = new Date();
  const rows = await prisma.communityInvite.findMany({
    where: { communityId, revokedAt: null },
    orderBy: { id: 'desc' },
    take: 100,
    select: SELECT,
  });
  return rows.map((r) => toDTO(r, now));
}

/** Revoke one link. Idempotent: `false` when it was already revoked or is not this community's. */
export async function revokeInvite(communityId: string, id: bigint): Promise<boolean> {
  const res = await prisma.communityInvite.updateMany({
    where: { id, communityId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}

export type AcceptInviteResult =
  | { ok: true; alreadyMember: boolean }
  /** Unknown, revoked, expired, exhausted or another community's code — deliberately indistinguishable. */
  | { ok: false; reason: 'invalid' };

class RolledBack extends Error {}

/**
 * Join `communityId` with `code`. Idempotent for an existing member (no use is
 * consumed, nothing is double-counted).
 */
export async function acceptInvite(
  communityId: string,
  userId: string,
  code: string,
): Promise<AcceptInviteResult> {
  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { id: true },
  });
  if (existing) return { ok: true, alreadyMember: true };

  // A member a moderator removed does not walk back in on a live link (a
  // multi-use code can outlive the removal by months); they ask again instead.
  // Same generic result as any other unusable code.
  const removed = await prisma.communityJoinRequest.findFirst({
    where: { communityId, userId, status: 'REMOVED' },
    select: { id: true },
  });
  if (removed) return { ok: false, reason: 'invalid' };

  try {
    return await prisma.$transaction(async (tx) => {
      // Validate AND consume in one statement; the row lock this takes is what
      // serialises concurrent accepts of the same code.
      const consumed = await tx.$executeRaw`
        UPDATE "community_invite"
        SET "uses" = "uses" + 1
        WHERE "code" = ${code}
          AND "communityId" = ${communityId}
          AND "revokedAt" IS NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > now())
          AND ("maxUses" IS NULL OR "uses" < "maxUses")`;
      if (consumed === 0) return { ok: false as const, reason: 'invalid' as const };

      const created = await tx.communityMember.createMany({
        data: [{ communityId, userId }],
        skipDuplicates: true,
      });
      if (created.count === 0) {
        // Became a member between the check above and here (a concurrent
        // accept of another code, or an approval): undo the consumed use.
        throw new RolledBack();
      }
      await tx.community.update({
        where: { id: communityId },
        data: { memberCount: { increment: 1 } },
      });
      // A pending request is answered by being let in.
      await tx.communityJoinRequest.updateMany({
        where: { communityId, userId, status: 'PENDING' },
        data: { status: 'APPROVED', decidedAt: new Date() },
      });
      return { ok: true as const, alreadyMember: false };
    });
  } catch (e) {
    if (e instanceof RolledBack) return { ok: true, alreadyMember: true };
    throw e;
  }
}

/** Whether `code` names a currently usable link for this community (for the invite page; consumes nothing). */
export async function isInviteUsable(communityId: string, code: string): Promise<boolean> {
  const row = await prisma.communityInvite.findFirst({
    where: {
      code,
      communityId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { maxUses: true, uses: true },
  });
  return !!row && (row.maxUses === null || row.uses < row.maxUses);
}
