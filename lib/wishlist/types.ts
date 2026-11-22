/**
 * Wishlists — client-safe types + zod (§8 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 */
import { z } from 'zod';

export const WISHLIST_ENTITY_TYPES = ['shop_item', 'market_cosmetic', 'creator_builds'] as const;
export type WishlistEntityType = (typeof WISHLIST_ENTITY_TYPES)[number];

export const wishlistEntrySchema = z.object({
  entityType: z.enum(WISHLIST_ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  targetPrice: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

export type WishlistEntryInput = z.infer<typeof wishlistEntrySchema>;

export interface WishlistItemView {
  id: string;
  entityType: WishlistEntityType;
  entityId: string;
  targetPrice: number | null;
  createdAt: string;
  title: string;
  href: string | null;
}
