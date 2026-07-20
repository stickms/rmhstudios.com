import { describe, it, expect } from 'vitest';
import {
  reviewUpsertSchema,
  reviewVoteSchema,
  guideCreateSchema,
  guideUpdateSchema,
} from '@/lib/games/reviews';

describe('review schemas', () => {
  it('validates star bounds', () => {
    expect(reviewUpsertSchema.safeParse({ stars: 5 }).success).toBe(true);
    expect(reviewUpsertSchema.safeParse({ stars: 3, body: 'fun' }).success).toBe(true);
    expect(reviewUpsertSchema.safeParse({ stars: 0 }).success).toBe(false);
    expect(reviewUpsertSchema.safeParse({ stars: 6 }).success).toBe(false);
    expect(reviewUpsertSchema.safeParse({ stars: 4, body: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('validates votes', () => {
    expect(reviewVoteSchema.safeParse({ helpful: true }).success).toBe(true);
    expect(reviewVoteSchema.safeParse({ helpful: 'yes' }).success).toBe(false);
  });
});

describe('guide schemas', () => {
  it('validates create + update', () => {
    expect(guideCreateSchema.safeParse({ gameId: 'altair', title: 'Openings', body: '# Hi' }).success).toBe(true);
    expect(guideCreateSchema.safeParse({ gameId: 'altair', title: 'no', body: 'x' }).success).toBe(false); // title too short
    expect(guideCreateSchema.safeParse({ gameId: 'altair', title: 'Openings', body: '' }).success).toBe(false);
    expect(guideUpdateSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
    expect(guideUpdateSchema.safeParse({}).success).toBe(true);
  });
});
