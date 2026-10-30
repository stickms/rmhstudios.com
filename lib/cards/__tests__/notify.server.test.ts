import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => ({ fn: vi.fn(async (_input: Record<string, unknown>) => {}) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: create.fn }));

import {
  notifyCardSold,
  notifyHubReply,
  notifyTradeOffered,
  notifyTradeResolved,
} from '@/lib/cards/notify.server';

beforeEach(() => create.fn.mockClear());

describe('notification shapes', () => {
  it('a trade offer links to the trades page and names the actor', async () => {
    await notifyTradeOffered({ actorId: 'a', userId: 'b', tradeId: 't1' });
    expect(create.fn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'b', actorId: 'a', entityType: 'card-trade', entityId: 't1', link: '/games/trades' }),
    );
  });

  it('a resolved trade says which way it went', async () => {
    await notifyTradeResolved({ actorId: 'b', userId: 'a', tradeId: 't1', outcome: 'declined' });
    expect(create.fn.mock.calls[0][0]).toMatchObject({ preview: 'declined your trade offer' });
    await notifyTradeResolved({ actorId: 'b', userId: 'a', tradeId: 't1', outcome: 'accepted' });
    expect(create.fn.mock.calls[1][0]).toMatchObject({ preview: 'accepted your trade offer' });
  });

  it('a sale tells the seller what they received', async () => {
    await notifyCardSold({ sellerId: 's', buyerId: 'b', listingId: 'l', gameId: 'altair', cardIndex: 0, proceeds: 90 });
    const arg = create.fn.mock.calls[0][0] as unknown as { preview: string; userId: string; link: string };
    expect(arg.userId).toBe('s');
    expect(arg.preview).toMatch(/for 90 coins$/);
    expect(arg.link).toBe('/games/market');
  });

  it('a hub reply links to the thread and collapses repeats', async () => {
    await notifyHubReply({ threadAuthorId: 'a', replierId: 'b', gameId: 'altair', threadId: 'th', threadTitle: 'x'.repeat(200) });
    const arg = create.fn.mock.calls[0][0] as unknown as { preview: string; link: string; dedupeUnread: boolean; type: string };
    expect(arg.link).toBe('/games/hub/altair/t/th');
    expect(arg.dedupeUnread).toBe(true);
    expect(arg.type).toBe('REPLY');
    expect(arg.preview.length).toBeLessThan(100);
  });
});
