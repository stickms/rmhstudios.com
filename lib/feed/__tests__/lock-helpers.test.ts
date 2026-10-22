/** The REAL isLocked / applyLock / notLockedWhere (other tests mock this module). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] }));

import { isLocked, applyLock, notLockedWhere } from '../map-feed-item.server';
import type { FeedItem } from '@/lib/feed-types';

const priced = { userId: 'author', unlockPrice: 25, unlocks: [] as { id: string }[] };
const item = {
  id: 'p',
  content: 'secret',
  imageUrls: ['a.png'],
  imageAlts: ['a'],
  gifUrl: 'g.gif',
  poll: { id: 'x' },
} as unknown as FeedItem;

describe('isLocked', () => {
  it('locks a priced post for strangers and anonymous viewers', () => {
    expect(isLocked(priced, 'stranger')).toBe(true);
    expect(isLocked(priced, null)).toBe(true);
  });
  it('does not lock free posts (null, 0), own posts, or unlocked posts', () => {
    expect(isLocked({ ...priced, unlockPrice: null }, 'stranger')).toBe(false);
    expect(isLocked({ ...priced, unlockPrice: 0 }, 'stranger')).toBe(false);
    expect(isLocked(priced, 'author')).toBe(false);
    expect(isLocked({ ...priced, unlocks: [{ id: 'u' }] }, 'stranger')).toBe(false);
    expect(isLocked({ userId: 'a', unlockPrice: 5 }, 'b')).toBe(true); // no unlocks relation loaded
  });
});

describe('applyLock', () => {
  it('blanks content and media and flags the teaser when locked', () => {
    const out = applyLock(item, priced, 'stranger');
    expect(out).toMatchObject({ content: '', locked: true, unlockPrice: 25 });
    expect(out.imageUrls).toBeUndefined();
    expect(out.imageAlts).toBeUndefined();
    expect(out.gifUrl).toBeUndefined();
    expect(out.poll).toBeUndefined();
  });
  it('returns the item untouched for the author, an unlocker, or a free post', () => {
    expect(applyLock(item, priced, 'author')).toBe(item);
    expect(applyLock(item, { ...priced, unlocks: [{ id: 'u' }] }, 'b')).toBe(item);
    expect(applyLock(item, { ...priced, unlockPrice: null }, 'b')).toBe(item);
  });
});

describe('notLockedWhere', () => {
  it('anonymous: only free posts; signed-in: also own and unlocked', () => {
    expect(notLockedWhere(null).OR).toEqual([{ unlockPrice: null }, { unlockPrice: { lte: 0 } }]);
    const or = notLockedWhere('me').OR;
    expect(or).toContainEqual({ userId: 'me' });
    expect(or).toContainEqual({ unlocks: { some: { userId: 'me' } } });
  });
});
