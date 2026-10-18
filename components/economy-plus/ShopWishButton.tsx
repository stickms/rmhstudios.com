'use client';

import { useQuery } from '@tanstack/react-query';
import { WishButton } from '@/components/wishlist/WishButton';
import { useIdleReady } from '@/hooks/useIdleReady';
import { apiJson } from './api';

/**
 * A wishlist heart for a shop item (C8: the daily job alerts on these). The
 * member's wishlist is fetched once and shared across every heart on the page,
 * after first idle, so a catalog of hundreds of cards costs one small request.
 */
export function ShopWishButton({ itemId }: { itemId: string }) {
  const idle = useIdleReady();
  const { data } = useQuery({
    queryKey: ['economy-plus', 'wishlist-shop-ids'],
    queryFn: async () => {
      const r = await apiJson<{ items: { entityType: string; entityId: string }[] }>(
        '/api/wishlist',
      );
      return new Set(r.items.filter((i) => i.entityType === 'shop_item').map((i) => i.entityId));
    },
    enabled: idle,
    staleTime: 5 * 60_000,
  });
  // Until the wishlist is known the heart would guess its own state; show nothing instead.
  if (!data) return null;
  return <WishButton entityType="shop_item" entityId={itemId} initialWished={data.has(itemId)} />;
}
