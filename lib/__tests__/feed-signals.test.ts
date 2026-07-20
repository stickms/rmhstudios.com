import { describe, it, expect } from 'vitest';
import { feedSignalSchema, normalizeTag, FEED_SIGNAL_KINDS, mutedTagWhere } from '@/lib/feed/signals';


describe('feed signals', () => {
  it('validates each kind', () => {
    for (const kind of FEED_SIGNAL_KINDS) {
      expect(feedSignalSchema.safeParse({ kind, targetId: 'x' }).success).toBe(true);
    }
    expect(feedSignalSchema.safeParse({ kind: 'nope', targetId: 'x' }).success).toBe(false);
    expect(feedSignalSchema.safeParse({ kind: 'mute_tag', targetId: '' }).success).toBe(false);
  });

  it('normalizes tags', () => {
    expect(normalizeTag('#Altair')).toBe('altair');
    expect(normalizeTag('  GameDev ')).toBe('gamedev');
  });

  it('builds a muted-tag filter only when there are tags', () => {
    expect(mutedTagWhere([])).toEqual({});
    expect(mutedTagWhere(['altair'])).toEqual({
      NOT: { hashtags: { some: { hashtag: { tag: { in: ['altair'] } } } } },
    });
  });
});
