/** Contracts for adding to / removing from the wishlist (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { WishlistEntryInput } from '@/lib/wishlist/types';

export const addWishApi = endpoint<{ body: WishlistEntryInput; res: { wished: true } }>()({
  method: 'POST',
  path: '/api/wishlist',
});

export const removeWishApi = endpoint<{ body: WishlistEntryInput; res: { wished: false } }>()({
  method: 'DELETE',
  path: '/api/wishlist',
});
