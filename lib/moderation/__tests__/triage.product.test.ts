import { describe, expect, it } from 'vitest';
import {
  groupReliability,
  isOpenQueueStatus,
  isReliable,
  nextOffset,
  parseReasons,
  parseTriageFilters,
  parseTriageSearch,
  reasonsByGroup,
  reporterRecord,
  searchToQuery,
  tallyReporters,
} from '@/lib/moderation/triage';

describe('filter parsing', () => {
  it('reads the defaults from an empty query', () => {
    expect(parseTriageFilters({})).toEqual({
      status: 'PENDING',
      reasons: [],
      entityType: null,
      min: 1,
      sort: 'most',
      offset: 0,
    });
  });

  it('parses a comma list of reasons, dropping unknown names and repeats, in the dialog order', () => {
    expect(parseReasons('HATE, SPAM,SPAM,nope,')).toEqual(['SPAM', 'HATE']);
    expect(parseReasons('')).toEqual([]);
    expect(parseReasons(undefined)).toEqual([]);
  });

  it('parses the minimum, the sort, the kind and the cursor', () => {
    expect(
      parseTriageFilters({
        status: 'RESOLVED',
        entityType: 'comment',
        min: '5',
        sort: 'oldest',
        cursor: '25',
      }),
    ).toMatchObject({
      status: 'RESOLVED',
      entityType: 'comment',
      min: 5,
      sort: 'oldest',
      offset: 25,
    });
    expect(
      parseTriageFilters({
        min: '0',
      }).min,
    ).toBe(1);
  });

  it('keeps only what differs from the defaults in the URL search params', () => {
    expect(
      parseTriageSearch({
        status: 'PENDING',
        sort: 'most',
        min: '1',
      }),
    ).toEqual({});
    expect(
      parseTriageSearch({
        status: 'DISMISSED',
        reasons: 'HATE,SPAM,x',
        type: 'rmhark',
        min: '3',
        sort: 'newest',
        flat: 'true',
      }),
    ).toEqual({
      status: 'DISMISSED',
      reasons: 'SPAM,HATE',
      type: 'rmhark',
      min: 3,
      sort: 'newest',
      flat: true,
    });
  });

  it('drops values it does not recognise instead of failing the page', () => {
    expect(
      parseTriageSearch({
        status: 'x',
        type: 'banana',
        min: 'lots',
        sort: 'random',
        reasons: 7,
      }),
    ).toEqual({});
  });

  it('turns a linked view into the API query and back without losing a filter', () => {
    const search = parseTriageSearch({
      reasons: 'SPAM',
      sort: 'most',
      min: 2,
    });
    expect(searchToQuery(search, '25')).toEqual({
      status: undefined,
      reasons: 'SPAM',
      entityType: undefined,
      min: '2',
      sort: undefined,
      cursor: '25',
    });
  });

  it('knows which statuses can be decided', () => {
    expect(['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'].map((s) => isOpenQueueStatus(s as never))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('grouping', () => {
  it('lists each target’s reasons by count, ties in the dialog order', () => {
    const map = reasonsByGroup([
      {
        entityType: 'rmhark',
        entityId: 'p1',
        reason: 'HATE',
        count: 2,
      },
      {
        entityType: 'rmhark',
        entityId: 'p1',
        reason: 'SPAM',
        count: 2,
      },
      {
        entityType: 'rmhark',
        entityId: 'p1',
        reason: 'OTHER',
        count: 9,
      },
      {
        entityType: 'comment',
        entityId: 'p1',
        reason: 'SPAM',
        count: 1,
      },
    ]);
    expect(map.get('rmhark:p1')?.map((r) => r.reason)).toEqual(['OTHER', 'SPAM', 'HATE']);
    expect(map.get('comment:p1')).toEqual([
      {
        reason: 'SPAM',
        count: 1,
      },
    ]);
  });

  it('sets the next cursor a page on, or none at the end', () => {
    expect(nextOffset(0, true)).toBe('25');
    expect(nextOffset(25, true)).toBe('50');
    expect(nextOffset(50, false)).toBeNull();
  });
});

describe('reporter reliability', () => {
  const tallies = tallyReporters([
    {
      reporterId: 'a',
      status: 'RESOLVED',
      count: 8,
    },
    {
      reporterId: 'a',
      status: 'DISMISSED',
      count: 2,
    },
    {
      reporterId: 'b',
      status: 'RESOLVED',
      count: 1,
    },
    {
      reporterId: 'b',
      status: 'DISMISSED',
      count: 4,
    },
    {
      reporterId: 'c',
      status: 'RESOLVED',
      count: 4,
    },
    {
      reporterId: 'c',
      status: 'PENDING',
      count: 30,
    },
    {
      reporterId: 'd',
      status: 'RESOLVED',
      count: 3,
    },
    {
      reporterId: 'd',
      status: 'DISMISSED',
      count: 2,
    },
  ]);

  it('counts only decided reports', () => {
    expect(tallies.get('a')).toEqual({
      upheld: 8,
      decided: 10,
    });
    expect(tallies.get('c')).toEqual({
      upheld: 4,
      decided: 4,
    });
  });

  it('shows a record only from five decided reports', () => {
    expect(reporterRecord(tallies.get('a'))).toEqual({
      upheld: 8,
      decided: 10,
    });
    expect(reporterRecord(tallies.get('b'))).toEqual({
      upheld: 1,
      decided: 5,
    });
    expect(reporterRecord(tallies.get('c'))).toBeNull();
    expect(reporterRecord(undefined)).toBeNull();
  });

  it('calls a reporter reliable from 70 % upheld', () => {
    expect(
      isReliable({
        upheld: 7,
        decided: 10,
      }),
    ).toBe(true);
    expect(
      isReliable({
        upheld: 6,
        decided: 10,
      }),
    ).toBe(false);
    expect(
      isReliable({
        upheld: 5,
        decided: 5,
      }),
    ).toBe(true);
    expect(
      isReliable({
        upheld: 3,
        decided: 5,
      }),
    ).toBe(false);
  });

  it('summarises a group as reliable reporters out of reporters with a record', () => {
    // a is reliable (80 %), b is not (20 %), d is at 60 %, c has no record yet, e is unknown.
    expect(groupReliability(['a', 'b', 'c', 'd', 'e', 'a'], tallies)).toEqual({
      reliable: 1,
      known: 3,
    });
    expect(groupReliability(['c', 'e'], tallies)).toEqual({
      reliable: 0,
      known: 0,
    });
  });
});
