import { describe, expect, it } from 'vitest';
import { LEASE_MS, isFanoutKind, leaseExpired, pageAfter, toldIds, withoutTold } from '@/lib/fanout/run';

const NOW = new Date('2026-12-01T12:00:00Z');
const beat = (msAgo: number) => new Date(NOW.getTime() - msAgo);

describe('leaseExpired', () => {
  it('is true only for a RUNNING run whose lease is older than two minutes', () => {
    expect(leaseExpired({ status: 'RUNNING', heartbeatAt: beat(LEASE_MS - 1) }, NOW)).toBe(false);
    expect(leaseExpired({ status: 'RUNNING', heartbeatAt: beat(LEASE_MS + 1) }, NOW)).toBe(true);
  });
  it('never touches a finished run', () => {
    expect(leaseExpired({ status: 'DONE', heartbeatAt: beat(10 * LEASE_MS) }, NOW)).toBe(false);
    expect(leaseExpired({ status: 'FAILED', heartbeatAt: beat(10 * LEASE_MS) }, NOW)).toBe(false);
  });
});

describe('the already-told filter', () => {
  it('keeps only the members whose notification is for this subject', () => {
    const told = toldIds(
      [
        {
          userId: 'a',
          link: '/u/ada/post/p1',
        },
        {
          userId: 'b',
          link: '/u/ada/post/p2',
        },
        {
          userId: 'c',
          link: null,
        },
      ],
      '/u/ada/post/p1',
    );
    expect([...told]).toEqual(['a']);
    expect(withoutTold(['a', 'b', 'c'], told)).toEqual(['b', 'c']);
  });
});

describe('pageAfter', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('walks the ids in pages after the cursor and reports the end', () => {
    expect(pageAfter(ids, null, 2)).toEqual({
      ids: ['a', 'b'],
      nextCursor: 'b',
    });
    expect(pageAfter(ids, 'b', 2)).toEqual({
      ids: ['c', 'd'],
      nextCursor: 'd',
    });
    expect(pageAfter(ids, 'd', 2)).toEqual({
      ids: ['e'],
      nextCursor: null,
    });
    expect(pageAfter(ids, 'e', 2)).toEqual({
      ids: [],
      nextCursor: null,
    });
  });
  it('an exact multiple ends on the last page', () => {
    expect(pageAfter(['a', 'b'], null, 2)).toEqual({
      ids: ['a', 'b'],
      nextCursor: null,
    });
  });
});

describe('isFanoutKind', () => {
  it('knows the two kinds', () => {
    expect(isFanoutKind('post-alert')).toBe(true);
    expect(isFanoutKind('event-update')).toBe(true);
    expect(isFanoutKind('digest')).toBe(false);
  });
});
