/**
 * Reports of a TF2 HUD, a TF2 loadout and a Versecraft story (sprint 15, feature 04), server half. The types, the
 * registry of readers and the account filter are in `lib/moderation/workshop-moderation.ts`.
 *
 * - `workshopReportAuthor`: whose item a report is about, `null` for anything a member may not report (missing, a
 *   private HUD or loadout, one a moderator already removed), so the report flow never confirms a hidden item exists.
 *   An unlisted HUD or loadout is reportable: a reporter can open it by its link.
 * - `takeDownWorkshopItem`: a moderator's removal. One `updateMany` that repeats the condition (`moderatedAt: null`),
 *   so a second decision never moves the stamp. A HUD or a loadout is made `PRIVATE` in the same write; a content-
 *   addressed HUD blob is never touched, other HUDs may share it, and a story's world stays.
 * - `workshopPreviews`: what a moderator reads in the queue (kind, title, author, visibility, text), whatever the
 *   item's state.
 * - `workshopTargets`: what the reporter sees of their own report in Your reports.
 */
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { notBannedWhere, type WorkshopReportType } from '@/lib/moderation/workshop-moderation';

/** The member whose item a report is about, or `null` when the item may not be reported. */
export async function workshopReportAuthor(type: WorkshopReportType, id: string): Promise<string | null> {
  switch (type) {
    case 'tf2-hud': {
      const row = await prisma.tf2Hud.findUnique({
        where: { id },
        select: { ownerId: true, visibility: true, moderatedAt: true },
      });
      return row && row.visibility !== 'PRIVATE' && !row.moderatedAt ? row.ownerId : null;
    }
    case 'tf2-loadout': {
      const row = await prisma.tf2Loadout.findUnique({
        where: { id },
        select: { ownerId: true, visibility: true, moderatedAt: true },
      });
      return row && row.visibility !== 'PRIVATE' && !row.moderatedAt ? row.ownerId : null;
    }
    case 'versecraft-seed': {
      const row = await prisma.versecraftSeedListing.findUnique({
        where: { id },
        select: { authorId: true, moderatedAt: true },
      });
      return row && !row.moderatedAt ? row.authorId : null;
    }
  }
}

/** A moderator's removal; idempotent (an item already removed keeps its first stamp). Returns whether this call did it. */
export async function takeDownWorkshopItem(
  type: WorkshopReportType,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  switch (type) {
    case 'tf2-hud': {
      const done = await prisma.tf2Hud.updateMany({
        where: { id, moderatedAt: null },
        data: { moderatedAt: now, visibility: 'PRIVATE' },
      });
      return done.count === 1;
    }
    case 'tf2-loadout': {
      const done = await prisma.tf2Loadout.updateMany({
        where: { id, moderatedAt: null },
        data: { moderatedAt: now, visibility: 'PRIVATE' },
      });
      return done.count === 1;
    }
    case 'versecraft-seed': {
      const done = await prisma.versecraftSeedListing.updateMany({
        where: { id, moderatedAt: null },
        data: { moderatedAt: now },
      });
      return done.count === 1;
    }
  }
}

const KIND_LABEL: Record<WorkshopReportType, string> = {
  'tf2-hud': 'TF2 HUD',
  'tf2-loadout': 'TF2 loadout',
  'versecraft-seed': 'Versecraft story',
};

function previewLine(
  type: WorkshopReportType,
  row: { title: string; description?: string; author: string; visibility?: string },
): string {
  const head = `${KIND_LABEL[type]} "${row.title}" by ${row.author}${row.visibility ? ` (${row.visibility.toLowerCase()})` : ''}`;
  return row.description?.trim() ? `${head}: ${row.description.trim()}` : head;
}

/** The moderator's view of each reported item, keyed `type:id`, whatever the item's state. */
export async function workshopPreviews(
  byType: Partial<Record<WorkshopReportType, readonly string[]>>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const hudIds = byType['tf2-hud'] ?? [];
  const loadoutIds = byType['tf2-loadout'] ?? [];
  const seedIds = byType['versecraft-seed'] ?? [];
  const [huds, loadouts, seeds] = await Promise.all([
    hudIds.length
      ? prisma.tf2Hud.findMany({
          where: { id: { in: [...hudIds] } },
          select: { id: true, title: true, description: true, visibility: true, owner: { select: userDisplaySelect } },
        })
      : [],
    loadoutIds.length
      ? prisma.tf2Loadout.findMany({
          where: { id: { in: [...loadoutIds] } },
          select: { id: true, title: true, description: true, visibility: true, owner: { select: userDisplaySelect } },
        })
      : [],
    seedIds.length
      ? prisma.versecraftSeedListing.findMany({
          where: { id: { in: [...seedIds] } },
          select: { id: true, title: true, author: { select: userDisplaySelect } },
        })
      : [],
  ]);
  for (const r of huds) {
    out.set(`tf2-hud:${r.id}`, previewLine('tf2-hud', { ...r, author: resolveUser(r.owner).name ?? 'Unknown' }));
  }
  for (const r of loadouts) {
    out.set(
      `tf2-loadout:${r.id}`,
      previewLine('tf2-loadout', { ...r, author: resolveUser(r.owner).name ?? 'Unknown' }),
    );
  }
  for (const r of seeds) {
    out.set(
      `versecraft-seed:${r.id}`,
      previewLine('versecraft-seed', { ...r, author: resolveUser(r.author).name ?? 'Unknown' }),
    );
  }
  return out;
}

export interface WorkshopTarget {
  type: WorkshopReportType;
  id: string;
  title: string;
  /** The page the reporter can open, `null` where the item has none (a story is read in the game). */
  href: string | null;
}

/**
 * What the reporter may still see of their reported items: only items that are not removed, are not private (an
 * unlisted one the reporter opened by link counts), and whose author the reporter has not blocked and who is not
 * banned. Anything else reads as unavailable.
 */
export async function workshopTargets(
  byType: Partial<Record<WorkshopReportType, readonly string[]>>,
  hiddenAuthorIds: readonly string[],
  now: Date = new Date(),
): Promise<WorkshopTarget[]> {
  const hudIds = byType['tf2-hud'] ?? [];
  const loadoutIds = byType['tf2-loadout'] ?? [];
  const seedIds = byType['versecraft-seed'] ?? [];
  const notBanned = notBannedWhere(now);
  const hidden = [...hiddenAuthorIds];
  const [huds, loadouts, seeds] = await Promise.all([
    hudIds.length
      ? prisma.tf2Hud.findMany({
          where: {
            id: { in: [...hudIds] },
            moderatedAt: null,
            visibility: { not: 'PRIVATE' },
            ownerId: { notIn: hidden },
            owner: notBanned,
          },
          select: { id: true, slug: true, title: true },
        })
      : [],
    loadoutIds.length
      ? prisma.tf2Loadout.findMany({
          where: {
            id: { in: [...loadoutIds] },
            moderatedAt: null,
            visibility: { not: 'PRIVATE' },
            ownerId: { notIn: hidden },
            owner: notBanned,
          },
          select: { id: true, slug: true, title: true },
        })
      : [],
    seedIds.length
      ? prisma.versecraftSeedListing.findMany({
          where: { id: { in: [...seedIds] }, moderatedAt: null, authorId: { notIn: hidden }, author: notBanned },
          select: { id: true, title: true },
        })
      : [],
  ]);
  return [
    ...huds.map((r) => ({
      type: 'tf2-hud' as const,
      id: r.id,
      title: r.title,
      href: `/tf2/hud-editor/h/${r.slug}`,
    })),
    ...loadouts.map((r) => ({
      type: 'tf2-loadout' as const,
      id: r.id,
      title: r.title,
      href: `/tf2/loadout/l/${r.slug}`,
    })),
    ...seeds.map((r) => ({ type: 'versecraft-seed' as const, id: r.id, title: r.title, href: null })),
  ];
}
