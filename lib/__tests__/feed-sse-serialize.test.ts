import { describe, expect, it } from 'vitest';
import { serializeWithDelivery } from '@/lib/feed-sse-serialize';
import type { FeedSSEEvent } from '@/lib/feed-sse';

const event = {
  type: 'rmhark.created',
  rmharkId: 'p1',
  payload: { id: 'p1', content: 'hi "there"   ✓' },
  timestamp: '2026-01-01T00:00:00.000Z',
  authorId: 'a1',
  notification: undefined,
} as unknown as FeedSSEEvent;

describe('serializeWithDelivery', () => {
  it('is byte-identical to JSON.stringify({ ...event, delivery }) for every variant', () => {
    for (const followed of [true, false]) {
      for (const own of [true, false]) {
        const delivery = { followed, own };
        const expected = JSON.stringify({ ...event, delivery });
        expect(serializeWithDelivery(event, delivery)).toBe(expected);
        // second call hits the memo
        expect(serializeWithDelivery(event, delivery)).toBe(expected);
      }
    }
  });

  it('falls back when the event already has a delivery key', () => {
    const e = { ...event, delivery: { followed: true, own: true } } as unknown as FeedSSEEvent;
    const d = { followed: false, own: false };
    expect(serializeWithDelivery(e, d)).toBe(JSON.stringify({ ...e, delivery: d }));
  });
});
