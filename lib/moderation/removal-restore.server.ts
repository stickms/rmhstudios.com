/**
 * Undoing a report takedown, one branch per reversible type (sprint 15, feature 16). The list is
 * `REVERSIBLE_REMOVAL_TYPES` (`removal-reviews.ts`); `removal-restore-coverage.test.ts` holds that every entry has a
 * branch here and is a removable report type.
 *
 * A restore clears the stamp the takedown wrote (`moderatedAt`, and a pack's `autoHiddenAt`) and nothing else. It never
 * makes anything public on the owner's behalf: where the owner holds a visibility switch the takedown already set it
 * off (a deck and a persona `isPublic: false`, a pack `hidden: true`, a listing `status: 'REMOVED'`, a HUD and a
 * loadout `visibility: 'PRIVATE'`), and the restore leaves it off, so the owner republishes, unhides or relists. An item
 * with no switch (a review, a guide, a tip, a Versecraft story listing) comes back where it was: putting it back is the
 * decision being made.
 *
 * Each branch is one `updateMany` that repeats the condition (`moderatedAt: { not: null }`), so a second restore, or a
 * restore of an item the owner has since deleted, matches nothing and changes nothing.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import type { ReversibleRemovalType } from '@/lib/moderation/removal-reviews';

type Db = Prisma.TransactionClient | typeof prisma;

/** Clear the takedown of one item. Returns whether this call changed a row. */
export async function restoreRemovedItem(db: Db, type: ReversibleRemovalType, id: string): Promise<boolean> {
  const stamped = { id, moderatedAt: { not: null } } as const;
  const cleared = { moderatedAt: null } as const;
  switch (type) {
    case 'study-deck': {
      const done = await db.flashcardDeck.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'persona': {
      const done = await db.aiPersona.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'home-listing': {
      const done = await db.homeListing.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'rmhbox-pack': {
      const done = await db.rmhboxPack.updateMany({ where: stamped, data: { moderatedAt: null, autoHiddenAt: null } });
      return done.count === 1;
    }
    case 'game-review': {
      const done = await db.gameReview.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'game-guide': {
      const done = await db.gameGuide.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'achievement-tip': {
      const done = await db.achievementTip.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'tf2-hud': {
      const done = await db.tf2Hud.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'tf2-loadout': {
      const done = await db.tf2Loadout.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
    case 'versecraft-seed': {
      const done = await db.versecraftSeedListing.updateMany({ where: stamped, data: cleared });
      return done.count === 1;
    }
  }
}

/** What a restore leaves to do once its transaction has committed: a review's game rating is cached for a minute. */
export async function afterRestoredItem(type: ReversibleRemovalType, id: string): Promise<void> {
  if (type !== 'game-review') return;
  const row = await prisma.gameReview.findUnique({ where: { id }, select: { gameId: true } });
  if (!row) return;
  const { invalidateRatingCache } = await import('@/lib/games/meta.server');
  invalidateRatingCache(row.gameId);
}

/**
 * The titles of the removed items that still exist, keyed `type:id`. With `authorId` only that member's own items are
 * read (their own list); without it, any author's (an admin reading a review), whatever the item's state.
 */
export async function removedItemTitles(
  targets: readonly { entityType: string; entityId: string }[],
  authorId?: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const idsOf = (type: string): string[] => targets.filter((t) => t.entityType === type).map((t) => t.entityId);
  const key = (type: string, id: string): string => `${type}:${id}`;
  const [decks, personas, listings, packs, guides, huds, loadouts, seeds] = await Promise.all([
    idsOf('study-deck').length
      ? prisma.flashcardDeck.findMany({
          where: { id: { in: idsOf('study-deck') }, ...(authorId ? { userId: authorId } : {}) },
          select: { id: true, title: true },
        })
      : [],
    idsOf('persona').length
      ? prisma.aiPersona.findMany({
          where: { id: { in: idsOf('persona') }, ...(authorId ? { ownerId: authorId } : {}) },
          select: { id: true, name: true },
        })
      : [],
    idsOf('home-listing').length
      ? prisma.homeListing.findMany({
          where: { id: { in: idsOf('home-listing') }, ...(authorId ? { authorId } : {}) },
          select: { id: true, title: true },
        })
      : [],
    idsOf('rmhbox-pack').length
      ? prisma.rmhboxPack.findMany({
          where: { id: { in: idsOf('rmhbox-pack') }, ...(authorId ? { ownerId: authorId } : {}) },
          select: { id: true, name: true },
        })
      : [],
    idsOf('game-guide').length
      ? prisma.gameGuide.findMany({
          where: { id: { in: idsOf('game-guide') }, ...(authorId ? { authorId } : {}) },
          select: { id: true, title: true },
        })
      : [],
    idsOf('tf2-hud').length
      ? prisma.tf2Hud.findMany({
          where: { id: { in: idsOf('tf2-hud') }, ...(authorId ? { ownerId: authorId } : {}) },
          select: { id: true, title: true },
        })
      : [],
    idsOf('tf2-loadout').length
      ? prisma.tf2Loadout.findMany({
          where: { id: { in: idsOf('tf2-loadout') }, ...(authorId ? { ownerId: authorId } : {}) },
          select: { id: true, title: true },
        })
      : [],
    idsOf('versecraft-seed').length
      ? prisma.versecraftSeedListing.findMany({
          where: { id: { in: idsOf('versecraft-seed') }, ...(authorId ? { authorId } : {}) },
          select: { id: true, title: true },
        })
      : [],
  ]);
  for (const r of decks) out.set(key('study-deck', r.id), r.title);
  for (const r of personas) out.set(key('persona', r.id), r.name);
  for (const r of listings) out.set(key('home-listing', r.id), r.title);
  for (const r of packs) out.set(key('rmhbox-pack', r.id), r.name);
  for (const r of guides) out.set(key('game-guide', r.id), r.title);
  for (const r of huds) out.set(key('tf2-hud', r.id), r.title);
  for (const r of loadouts) out.set(key('tf2-loadout', r.id), r.title);
  for (const r of seeds) out.set(key('versecraft-seed', r.id), r.title);
  return out;
}
