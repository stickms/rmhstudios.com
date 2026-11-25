/**
 * Studio shares (`StudioProjectShare`): a snapshot of one of the member's cloud projects behind a random link.
 *
 * - The snapshot is made from the SERVER's copy of the cloud project (owner only) and sanitised here
 *   (`sanitizeForShare`): no device sample id or sample name is ever stored. A client never sends project JSON.
 * - The token is `randomBytes(16)` as base64url (22 characters, 128 bits). It is the only way to a share and is never
 *   logged; no endpoint takes a share id.
 * - At most `MAX_LIVE_SHARES` live shares per member: the count and the insert run in one transaction under the
 *   member's advisory lock (`studio-shares:<userId>`).
 * - A revoked, taken-down, hidden (the sharer banned, or blocked either way with the reader) or unknown token reads
 *   as the same `null`, so the answer cannot tell them apart and a token cannot be probed.
 * - A revoke clears `data` at once and keeps the row for the owner's list.
 */
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { getCloudProject } from '@/lib/studio/cloud-projects.server';
import { MAX_PROJECT_BYTES, studioProjectSchema } from '@/lib/studio/project-schema';
import { MAX_LIVE_SHARES, sanitizeForShare } from '@/lib/studio/share';
import type { SharedProject, ShareSummary } from '@/lib/studio/share.contract';

/** Revoked rows kept for the list beyond this many are pruned when a new share is made. */
const KEEP_REVOKED = 50;
/** The list never returns more rows than this. */
const LIST_LIMIT = MAX_LIVE_SHARES + KEEP_REVOKED;

/** A fresh share token: 128 random bits, 22 base64url characters. */
export function newShareToken(): string {
  return randomBytes(16).toString('base64url');
}

const SUMMARY_SELECT = {
  token: true,
  name: true,
  trackCount: true,
  missingSamples: true,
  openCount: true,
  createdAt: true,
  revokedAt: true,
} as const;

interface SummaryRow {
  token: string;
  name: string;
  trackCount: number;
  missingSamples: number;
  openCount: number;
  createdAt: Date;
  revokedAt: Date | null;
}

function toSummary(row: SummaryRow): ShareSummary {
  return {
    token: row.token,
    name: row.name,
    trackCount: row.trackCount,
    missingSamples: row.missingSamples,
    openCount: row.openCount,
    createdAt: row.createdAt.toISOString(),
    revoked: row.revokedAt !== null,
  };
}

/** The member's shares, newest first, without their JSON. */
export async function listShares(userId: string): Promise<ShareSummary[]> {
  const rows = await prisma.studioProjectShare.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: SUMMARY_SELECT,
  });
  return rows.map(toSummary);
}

export type CreateShareResult =
  | { ok: true; share: ShareSummary }
  | { ok: false; reason: 'not-found' | 'too-large' }
  | { ok: false; reason: 'limit'; max: number };

/** Share a snapshot of one of the member's cloud projects. Another member's (or no) project is `not-found`. */
export async function createShare(userId: string, projectId: string): Promise<CreateShareResult> {
  const project = await getCloudProject(userId, projectId);
  if (!project) return { ok: false, reason: 'not-found' };

  const { project: copy, missingSamples } = sanitizeForShare(project.data);
  const json = JSON.stringify(copy);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  if (sizeBytes > MAX_PROJECT_BYTES) return { ok: false, reason: 'too-large' };
  // JSON.parse returns `any`, which is what Prisma's Json input wants; the value is the validated, sanitised copy.
  const data = JSON.parse(json);

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `studio-shares:${userId}`);
    const live = await tx.studioProjectShare.count({ where: { userId, revokedAt: null } });
    if (live >= MAX_LIVE_SHARES) return { ok: false, reason: 'limit', max: MAX_LIVE_SHARES } as const;
    const row = await tx.studioProjectShare.create({
      data: {
        token: newShareToken(),
        userId,
        projectId,
        name: project.name,
        data,
        sizeBytes,
        trackCount: copy.tracks.length,
        missingSamples,
      },
      select: SUMMARY_SELECT,
    });
    // Keep the list bounded: the oldest revoked rows go once more than KEEP_REVOKED are held.
    const stale = await tx.studioProjectShare.findMany({
      where: { userId, revokedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      skip: KEEP_REVOKED,
      select: { id: true },
    });
    if (Array.isArray(stale) && stale.length > 0) {
      await tx.studioProjectShare.deleteMany({ where: { userId, id: { in: stale.map((s) => s.id) } } });
    }
    return { ok: true, share: toSummary(row) } as const;
  });
}

/** Stop sharing: clears `data` and stamps the revoke. False when the member has no live share with this token. */
export async function revokeShare(userId: string, token: string): Promise<boolean> {
  const { count } = await prisma.studioProjectShare.updateMany({
    where: { token, userId, revokedAt: null },
    data: { revokedAt: new Date(), data: Prisma.DbNull },
  });
  return count > 0;
}

/** A moderator takedown: the same revoke without the owner check (reports name the share by its token). */
export async function takedownShare(token: string): Promise<void> {
  await prisma.studioProjectShare.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date(), data: Prisma.DbNull },
  });
}

/**
 * Read a share by its token for a visitor (`viewerId` null when signed out), or null. The answer is the same null
 * for an unknown, revoked, taken-down or hidden share. The snapshot is validated through the project schema and
 * sanitised again before it leaves. The opened count rises once per signed-in member (first opening) and once per
 * read for a signed-out visitor.
 */
export async function readShare(token: string, viewerId: string | null): Promise<SharedProject | null> {
  const row = await prisma.studioProjectShare.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      name: true,
      data: true,
      revokedAt: true,
      user: { select: { ...userDisplaySelect, bannedUntil: true } },
    },
  });
  if (!row || row.revokedAt !== null || row.data === null) return null;
  if (row.user.bannedUntil && row.user.bannedUntil.getTime() > Date.now()) return null;
  if (viewerId && viewerId !== row.userId && (await getBlockedAuthorIds(viewerId)).includes(row.userId)) return null;

  const parsed = studioProjectSchema.safeParse(row.data);
  if (!parsed.success) return null;
  const { project, missingSamples } = sanitizeForShare(parsed.data);

  if (viewerId) {
    const first = await prisma.studioProjectShareOpen.createMany({
      data: [{ shareId: row.id, userId: viewerId }],
      skipDuplicates: true,
    });
    if (first.count === 1)
      await prisma.studioProjectShare.update({ where: { id: row.id }, data: { openCount: { increment: 1 } } });
  } else {
    await prisma.studioProjectShare.update({ where: { id: row.id }, data: { openCount: { increment: 1 } } });
  }

  return {
    name: row.name,
    sharerName: resolveUser(row.user).name,
    trackCount: project.tracks.length,
    missingSamples,
    data: project,
  };
}

/** Erasure: the member's shares (their opened marks cascade) and the marks they left on other members' shares. */
export function studioShareErasureOps(userId: string) {
  return [
    prisma.studioProjectShareOpen.deleteMany({ where: { userId } }),
    prisma.studioProjectShare.deleteMany({ where: { userId } }),
  ];
}

export interface StudioShareExport {
  name: string;
  createdAt: string;
  revoked: boolean;
  openCount: number;
}

/** The account export's section: each share's name, creation, whether it was revoked and its opened count. No token. */
export async function exportStudioShares(userId: string): Promise<StudioShareExport[]> {
  const rows = await prisma.studioProjectShare.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { name: true, createdAt: true, revokedAt: true, openCount: true },
  });
  return rows.map((row) => ({
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    revoked: row.revokedAt !== null,
    openCount: row.openCount,
  }));
}
