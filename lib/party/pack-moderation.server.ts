/**
 * RMHBox prompt packs in the site's report queue (s13-16).
 *
 * - `filePackReport`: files the `ContentReport` and, when enough distinct members have an open report, hides the pack.
 *   The duplicate check, the insert, the count and the hide run in one transaction under one lock, so two reports
 *   racing at the threshold hide once and a reporter cannot file twice.
 * - `packReportAuthor`: whose pack a report is about; null for a missing or already removed pack, so the report flow
 *   never confirms a removed pack exists.
 * - `takeDownPack`: a moderator's removal. It stamps `moderatedAt`, which nobody but a moderator's decision sets and
 *   no pack write clears: the owner and `adminSetPack` can neither unhide nor feature the pack again.
 * - `restoreReportedPack`: dismissing the last open report of a pack the reports hid (`autoHiddenAt`) brings it back.
 *   A pack an admin hid by hand has no `autoHiddenAt` and stays hidden.
 * - `packPreviews`: what a moderator reads (name, game, prompt count and the first prompts).
 */
import type { ReportReason } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { PACK_AUTOHIDE_REPORTS } from '@/lib/party/packs';

export const PACK_REPORT_TYPE = 'rmhbox-pack';
/** How many prompts a moderator reads in the queue. */
export const PACK_PREVIEW_PROMPTS = 20;

const OPEN = ['PENDING', 'REVIEWING'] as const;

export type FilePackReportResult =
  { ok: true; duplicate: boolean; hidden: boolean } | { ok: false; reason: 'not-found' | 'own-pack' };

/** The owner of a pack a member may report: it exists and a moderator has not already removed it. */
export async function packReportAuthor(packId: string): Promise<string | null> {
  const row = await prisma.rmhboxPack.findUnique({
    where: { id: packId },
    select: { ownerId: true, moderatedAt: true },
  });
  return row && !row.moderatedAt ? row.ownerId : null;
}

export async function filePackReport(input: {
  reporterId: string;
  packId: string;
  reason: ReportReason;
  details: string | null;
  now?: Date;
}): Promise<FilePackReportResult> {
  const { reporterId, packId, reason, details } = input;
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `pack-report:${packId}`);
    const pack = await tx.rmhboxPack.findUnique({
      where: { id: packId },
      select: { ownerId: true, hidden: true, moderatedAt: true },
    });
    if (!pack || pack.moderatedAt) return { ok: false as const, reason: 'not-found' as const };
    if (pack.ownerId === reporterId) return { ok: false as const, reason: 'own-pack' as const };
    const mine = await tx.contentReport.findFirst({
      where: { reporterId, entityType: PACK_REPORT_TYPE, entityId: packId, status: { in: [...OPEN] } },
      select: { id: true },
    });
    if (mine) return { ok: true as const, duplicate: true, hidden: pack.hidden };
    await tx.contentReport.create({
      data: { reporterId, entityType: PACK_REPORT_TYPE, entityId: packId, reason, details, targetUserId: pack.ownerId },
    });
    const open = await tx.contentReport.findMany({
      where: { entityType: PACK_REPORT_TYPE, entityId: packId, status: { in: [...OPEN] } },
      select: { reporterId: true },
    });
    const distinct = new Set(open.map((r) => r.reporterId)).size;
    if (distinct >= PACK_AUTOHIDE_REPORTS && !pack.hidden) {
      // Compare-and-set: only the call that finds the pack still shown hides it, and stamps that the reports did.
      await tx.rmhboxPack.updateMany({
        where: { id: packId, hidden: false },
        data: { hidden: true, featured: false, autoHiddenAt: now, reportCount: distinct },
      });
      return { ok: true as const, duplicate: false, hidden: true };
    }
    await tx.rmhboxPack.update({ where: { id: packId }, data: { reportCount: distinct } });
    return { ok: true as const, duplicate: false, hidden: pack.hidden };
  });
}

/** A moderator's removal. Idempotent: a pack already removed keeps its first stamp. Returns whether this call did it. */
export async function takeDownPack(packId: string, now: Date = new Date()): Promise<boolean> {
  const done = await prisma.rmhboxPack.updateMany({
    where: { id: packId, moderatedAt: null },
    data: { moderatedAt: now, hidden: true, featured: false, autoHiddenAt: null },
  });
  return done.count === 1;
}

/**
 * After a dismissal: bring back a pack the reports hid when no open report of it remains. Never a removed pack, and
 * never one an admin hid by hand. Returns whether the pack was restored.
 */
export async function restoreReportedPack(packId: string): Promise<boolean> {
  // Under the same lock as filing, so a report arriving as the last one is dismissed or withdrawn is either counted
  // here (the pack stays hidden) or filed after the restore (and counted from zero).
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `pack-report:${packId}`);
    const stillOpen = await tx.contentReport.count({
      where: { entityType: PACK_REPORT_TYPE, entityId: packId, status: { in: [...OPEN] } },
    });
    if (stillOpen > 0) return false;
    const done = await tx.rmhboxPack.updateMany({
      where: { id: packId, autoHiddenAt: { not: null }, moderatedAt: null },
      data: { hidden: false, autoHiddenAt: null, reportCount: 0 },
    });
    return done.count === 1;
  });
}

/** The moderator's view of each reported pack, keyed by pack id. */
export async function packPreviews(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await prisma.rmhboxPack.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      name: true,
      game: true,
      promptCount: true,
      prompts: true,
      autoHiddenAt: true,
      moderatedAt: true,
    },
  });
  for (const r of rows) {
    const prompts = (Array.isArray(r.prompts) ? r.prompts : [])
      .filter((p): p is string => typeof p === 'string')
      .slice(0, PACK_PREVIEW_PROMPTS);
    const state = r.moderatedAt ? ' [removed]' : r.autoHiddenAt ? ' [hidden by reports, waiting for review]' : '';
    out.set(
      r.id,
      `${r.name} (${r.game}, ${r.promptCount} prompts)${state}\n${prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
    );
  }
  return out;
}
