import { describe, expect, it } from 'vitest';
import {
  LEASE_MS,
  MAX_RECLAIMS,
  isFanoutKind,
  leaseExpired,
  pageAfter,
  shouldReclaim,
  toldIds,
  withoutTold,
} from '@/lib/fanout/run';

const NOW = new Date('2026-12-01T12:00:00Z');
const beat = (msAgo: number) => new Date(NOW.getTime() - msAgo);

describe('shouldReclaim', () => {
  it('keeps a live lease, re-queues after two minutes and fails after the fifth reclaim', () => {
    expect(LEASE_MS).toBe(120_000);
    expect(
      shouldReclaim(
        {
          status: 'RUNNING',
          heartbeatAt: beat(LEASE_MS - 1),
          reclaims: 0,
        },
        NOW,
      ),
    ).toBe('keep');
    expect(
      shouldReclaim(
        {
          status: 'RUNNING',
          heartbeatAt: beat(LEASE_MS + 1),
          reclaims: 0,
        },
        NOW,
      ),
    ).toBe('requeue');
    expect(
      shouldReclaim(
        {
          status: 'RUNNING',
          heartbeatAt: beat(LEASE_MS + 1),
          reclaims: MAX_RECLAIMS - 1,
        },
        NOW,
      ),
    ).toBe('requeue');
    expect(
      shouldReclaim(
        {
          status: 'RUNNING',
          heartbeatAt: beat(LEASE_MS + 1),
          reclaims: MAX_RECLAIMS,
        },
        NOW,
      ),
    ).toBe('fail');
  });
  it('never touches a finished run', () => {
    expect(
      shouldReclaim(
        {
          status: 'DONE',
          heartbeatAt: beat(10 * LEASE_MS),
          reclaims: 0,
        },
        NOW,
      ),
    ).toBe('keep');
    expect(
      leaseExpired(
        {
          status: 'FAILED',
          heartbeatAt: beat(10 * LEASE_MS),
        },
        NOW,
      ),
    ).toBe(false);
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
