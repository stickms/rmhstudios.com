import { describe, it, expect } from 'vitest';
import { REVIEW_BODY_MAX, reviewUpsertSchema } from '@/lib/games/reviews';

describe('review body limit', () => {
  it('is 2000 characters', () => {
    expect(REVIEW_BODY_MAX).toBe(2000);
  });

  it('the schema accepts a body at the limit and rejects one past it', () => {
    const at = reviewUpsertSchema.safeParse({ stars: 5, body: 'x'.repeat(REVIEW_BODY_MAX) });
    const over = reviewUpsertSchema.safeParse({ stars: 5, body: 'x'.repeat(REVIEW_BODY_MAX + 1) });
    expect(at.success).toBe(true);
    expect(over.success).toBe(false);
  });
});
