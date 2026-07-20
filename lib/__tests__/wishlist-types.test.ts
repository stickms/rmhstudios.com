import { describe, it, expect } from 'vitest';
import { wishlistEntrySchema, WISHLIST_ENTITY_TYPES } from '@/lib/wishlist/types';

describe('wishlistEntrySchema', () => {
  it('accepts each entity type with optional target price', () => {
    for (const entityType of WISHLIST_ENTITY_TYPES) {
      expect(wishlistEntrySchema.safeParse({ entityType, entityId: 'x' }).success).toBe(true);
    }
    expect(wishlistEntrySchema.safeParse({ entityType: 'market_cosmetic', entityId: 'i1', targetPrice: 500 }).success).toBe(true);
    expect(wishlistEntrySchema.safeParse({ entityType: 'shop_item', entityId: 'i1', targetPrice: null }).success).toBe(true);
  });

  it('rejects bad input', () => {
    expect(wishlistEntrySchema.safeParse({ entityType: 'nope', entityId: 'x' }).success).toBe(false);
    expect(wishlistEntrySchema.safeParse({ entityType: 'shop_item', entityId: '' }).success).toBe(false);
    expect(wishlistEntrySchema.safeParse({ entityType: 'shop_item', entityId: 'x', targetPrice: -1 }).success).toBe(false);
  });
});
