import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLLOW_QUERY,
  INACTIVE_DAYS,
  MAX_QUERY_LENGTH,
  cleanIds,
  decodeFollowCursor,
  encodeFollowCursor,
  escapeLike,
  followQueryToSearch,
  inactiveCutoff,
  isInactive,
  normalizeSearch,
  parseFollowQuery,
} from '@/lib/social/follow-filters';

describe('parseFollowQuery', () => {
  it('falls back to the defaults for nothing and for junk', () => {
    expect(parseFollowQuery({})).toEqual(DEFAULT_FOLLOW_QUERY);
    expect(parseFollowQuery({ tab: 'x', filter: 3, sort: null, q: {} })).toEqual(DEFAULT_FOLLOW_QUERY);
  });

  it('keeps valid values', () => {
    expect(parseFollowQuery({ tab: 'followers', filter: 'not-mutual', sort: 'active', q: ' ann ' })).toEqual({
      tab: 'followers',
      filter: 'not-mutual',
      sort: 'active',
      q: 'ann',
    });
  });

  it('bounds and cleans the search string', () => {
    expect(normalizeSearch('a'.repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
    expect(normalizeSearch('a\u0000b\nc')).toBe('a b c');
  });
});

describe('followQueryToSearch', () => {
  it('writes only what differs from the defaults', () => {
    expect(followQueryToSearch(DEFAULT_FOLLOW_QUERY)).toEqual({});
    expect(followQueryToSearch({ ...DEFAULT_FOLLOW_QUERY, tab: 'followers', sort: 'name' })).toEqual({
      tab: 'followers',
      sort: 'name',
    });
  });

  it('round-trips through parseFollowQuery', () => {
    const q = { tab: 'followers', filter: 'inactive', q: 'bo', sort: 'active' } as const;
    expect(parseFollowQuery(followQueryToSearch(q))).toEqual(q);
  });
});

describe('inactivity', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  it('cuts off 90 days back', () => {
    expect(inactiveCutoff(now).toISOString()).toBe('2026-08-23T12:00:00.000Z');
    expect(INACTIVE_DAYS).toBe(90);
  });
  it('treats no activity and old activity as inactive, recent as active', () => {
    expect(isInactive(null, now)).toBe(true);
    expect(isInactive('2026-08-01T00:00:00Z', now)).toBe(true);
    expect(isInactive('2026-09-01T00:00:00Z', now)).toBe(false);
    expect(isInactive(now, now)).toBe(false);
  });
});

describe('escapeLike', () => {
  it('makes wildcard characters literal', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('cleanIds', () => {
  it('trims, drops blanks and de-duplicates in order', () => {
    expect(cleanIds([' a', 'b', '', 'a ', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('cursor', () => {
  it('round-trips, including awkward names', () => {
    const c = { k: 'zoë "the" & co', id: 'edge_1' };
    expect(decodeFollowCursor(encodeFollowCursor(c))).toEqual(c);
  });
  it('reads a malformed or missing cursor as the first page', () => {
    expect(decodeFollowCursor(undefined)).toBeNull();
    expect(decodeFollowCursor('')).toBeNull();
    expect(decodeFollowCursor('not json')).toBeNull();
    expect(decodeFollowCursor('{"k":1}')).toBeNull();
  });
});
