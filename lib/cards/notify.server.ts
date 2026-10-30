/**
 * Notifications for the Steam-style community features: someone offers you a trade,
 * answers or declines yours, buys your card, or replies to your discussion.
 *
 * Always best-effort and always AFTER the transaction commits: `createNotification`
 * swallows its own failures, and a notification must never undo a sale or a trade.
 * They are SYSTEM notifications (the user's "system" preference governs them) with an
 * entity type, so the list can group and link them.
 */

import { createNotification } from '@/lib/notifications.server';
import { cardName } from '@/lib/cards/cards';

type Who = { actorId: string; userId: string };

export async function notifyTradeOffered(w: Who & { tradeId: string }) {
  await createNotification({
    type: 'SYSTEM',
    userId: w.userId,
    actorId: w.actorId,
    entityType: 'card-trade',
    entityId: w.tradeId,
    preview: 'sent you a trade offer',
    link: '/games/trades',
  });
}

export async function notifyTradeResolved(w: Who & { tradeId: string; outcome: 'accepted' | 'declined' }) {
  await createNotification({
    type: 'SYSTEM',
    userId: w.userId,
    actorId: w.actorId,
    entityType: 'card-trade',
    entityId: w.tradeId,
    preview: w.outcome === 'accepted' ? 'accepted your trade offer' : 'declined your trade offer',
    link: '/games/trades',
  });
}

export async function notifyCardSold(w: {
  sellerId: string;
  buyerId: string;
  listingId: string;
  gameId: string;
  cardIndex: number;
  proceeds: number;
}) {
  await createNotification({
    type: 'SYSTEM',
    userId: w.sellerId,
    actorId: w.buyerId,
    entityType: 'card-sale',
    entityId: w.listingId,
    preview: `bought your ${cardName(w.gameId, w.cardIndex)} card for ${w.proceeds} coins`,
    link: '/games/market',
  });
}

export async function notifyHubReply(w: {
  threadAuthorId: string;
  replierId: string;
  gameId: string;
  threadId: string;
  threadTitle: string;
}) {
  await createNotification({
    type: 'REPLY',
    userId: w.threadAuthorId,
    actorId: w.replierId,
    entityType: 'hub-thread',
    entityId: w.threadId,
    preview: `replied to “${w.threadTitle.slice(0, 80)}”`,
    link: `/games/hub/${w.gameId}/t/${w.threadId}`,
    dedupeUnread: true,
  });
}
