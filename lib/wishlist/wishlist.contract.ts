/** Contracts for adding to / removing from the wishlist (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { WishlistEntryInput, WishlistItemView } from '@/lib/wishlist/types';

export const addWishApi = endpoint<{ body: WishlistEntryInput; res: { wished: true } }>()({
  method: 'POST',
  path: '/api/wishlist',
});

export const removeWishApi = endpoint<{ body: WishlistEntryInput; res: { wished: false } }>()({
  method: 'DELETE',
  path: '/api/wishlist',
});

/** Another member's public wishlist; 404 when it is private. */
export const getPublicWishlistApi = endpoint<{ res: { items: WishlistItemView[] } }>()({
  method: 'GET',
  path: '/api/users/$id/wishlist',
});
