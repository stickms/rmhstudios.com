import { describe, expect, it } from 'vitest';
import { postCardShowsContent } from '../post-visibility';

const live = { audience: 'PUBLIC', deletedAt: null, unlockPrice: 0, isSensitive: false, community: null };

describe('postCardShowsContent (the one rule for card / embed / oEmbed / indexing)', () => {
  it('shows a live public free post', () => {
    expect(postCardShowsContent(live)).toBe(true);
    expect(postCardShowsContent({ ...live, expiresAt: new Date(Date.now() + 60_000) })).toBe(true);
  });

  it('hides a sensitive post', () => {
    expect(postCardShowsContent({ ...live, isSensitive: true })).toBe(false);
  });

  it('hides a post past its TTL (Date or ISO string), before the sweep deletes it', () => {
    expect(postCardShowsContent({ ...live, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
    expect(postCardShowsContent({ ...live, expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });

  it('still hides the older cases', () => {
    expect(postCardShowsContent({ ...live, audience: 'FOLLOWERS' })).toBe(false);
    expect(postCardShowsContent({ ...live, deletedAt: new Date() })).toBe(false);
    expect(postCardShowsContent({ ...live, unlockPrice: 5 })).toBe(false);
    expect(postCardShowsContent({ ...live, community: { isPrivate: true } })).toBe(false);
    expect(postCardShowsContent(null)).toBe(false);
  });
});
