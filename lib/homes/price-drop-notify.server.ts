/**
 * RMHHomes — the drop fan-out (server only, no app-wide imports).
 *
 * Tells the favouriters of a listing that its price dropped. It takes its database and its delivery as
 * arguments so the web tier (through `createNotification`) and the homes worker (which keeps a small bundle
 * and its own client) share one set of rules: skip the author, members blocked by or blocking the author and
 * banned accounts; honour the switch; at most one notice per listing per member per 7 days, claimed with a
 * conditional update so two drops at once cannot both tell the same member; at most 1,000 favouriters.
 */

import { mapWithConcurrency } from '@/lib/async-pool';
import { notice } from '@/lib/notifications/notice-keys';
import { MAX_NOTIFIED_FAVOURITERS, noticeCutoff } from './prices';

type Args = Record<string, unknown>;

export interface DropPrisma {
  homeFavorite: {
    findMany(args: Args): Promise<Array<{ id: string; userId: string }>>;
    updateMany(args: Args): Promise<{ count: number }>;
  };
  userBlock: {
    findMany(args: Args): Promise<Array<{ blockerId: string; blockedId: string }>>;
  };
}

export interface PriceDrop {
  listingId: string;
  authorId: string | null;
  title: string;
  city: string;
  state: string;
  oldCents: number;
  newCents: number;
}

export type DeliverDropNotice = (
  userId: string,
  drop: PriceDrop,
  preview: ReturnType<typeof dropNotice>,
) => Promise<void>;

const dollars = (cents: number) => Math.round(cents / 100).toLocaleString('en-US');

/** The notice a favouriter gets (a key and its params; the reader's language fills the sentence). */
export function dropNotice(drop: PriceDrop) {
  return notice('home-price-drop', {
    title: drop.title,
    city: drop.city,
    state: drop.state,
    was: dollars(drop.oldCents),
    now: dollars(drop.newCents),
  });
}

/** The link a drop notice opens. */
export function dropLink(listingId: string): string {
  return `/homes/listing/${listingId}`;
}

/** Returns how many members were told. Never throws: a failed delivery is skipped. */
export async function notifyPriceDrop(
  deps: { prisma: DropPrisma; deliver: DeliverDropNotice; concurrency?: number },
  drop: PriceDrop,
  now: Date = new Date(),
): Promise<number> {
  try {
    const cutoff = noticeCutoff(now);
    const claimable = { OR: [{ priceNoticeAt: null }, { priceNoticeAt: { lte: cutoff } }] };
    const favs = await deps.prisma.homeFavorite.findMany({
      where: {
        listingId: drop.listingId,
        priceAlerts: true,
        // s12-16: a listing that is not live (or that a moderator removed) tells nobody about its price.
        listing: { status: 'ACTIVE', moderatedAt: null },
        ...claimable,
        ...(drop.authorId ? { userId: { not: drop.authorId } } : {}),
        user: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] },
      },
      select: { id: true, userId: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_NOTIFIED_FAVOURITERS,
    });
    if (favs.length === 0) return 0;

    const refused = new Set<string>();
    if (drop.authorId) {
      const ids = favs.map((f) => f.userId);
      const blocks = await deps.prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: drop.authorId, blockedId: { in: ids } },
            { blockedId: drop.authorId, blockerId: { in: ids } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      });
      for (const b of blocks) refused.add(b.blockerId === drop.authorId ? b.blockedId : b.blockerId);
    }

    const preview = dropNotice(drop);
    const sent = await mapWithConcurrency(
      favs.filter((f) => !refused.has(f.userId)),
      deps.concurrency ?? 8,
      async (fav) => {
        try {
          // Claim the week before sending: the loser of a race sends nothing.
          const claim = await deps.prisma.homeFavorite.updateMany({
            where: { id: fav.id, priceAlerts: true, ...claimable },
            data: { priceNoticeAt: now },
          });
          if (claim.count !== 1) return 0;
          await deps.deliver(fav.userId, drop, preview);
          return 1;
        } catch (err) {
          console.error('notifyPriceDrop: one delivery failed:', err);
          return 0;
        }
      },
    );
    return sent.reduce<number>((a, b) => a + b, 0);
  } catch (err) {
    console.error('notifyPriceDrop failed:', err);
    return 0;
  }
}
