import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MARKS_PER_BOOK,
  MAX_MARKS_PER_USER,
  TOMBSTONE_TTL_MS,
  adoptCanonical,
  admitNewMarks,
  applyRecords,
  clampEditTime,
  createThrottle,
  fingerprint,
  isValidClientId,
  mergeMarks,
  pendingRecords,
  percentRead,
  pickPlace,
  prepareForSync,
  stateToRecords,
  tombstoneOf,
  winner,
  type MarkRecord,
  type SyncableState,
} from '@/lib/library/reader-sync';

const NOW = 1_800_000_000_000;
const id = (n: number) => `mark-${String(n).padStart(20, '0')}`;

function rec(n: number, over: Partial<MarkRecord> = {}): MarkRecord {
  return {
    id: id(n),
    kind: 'bookmark',
    page: 10,
    label: 'Page 10',
    body: null,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    ...over,
  };
}

const ids = (rs: MarkRecord[]) => rs.map((r) => r.id);

describe('merge: union by id', () => {
  it('keeps marks that exist on only one side and asks to push the ones the server lacks', () => {
    const local = [rec(1), rec(2)];
    const remote = [
      rec(2),
      rec(3, {
        page: 30,
      }),
    ];
    const { merged, toPush } = mergeMarks(local, remote, NOW);
    expect(ids(merged).sort()).toEqual([id(1), id(2), id(3)]);
    expect(ids(toPush)).toEqual([id(1)]);
  });

  it('is empty for two empty sides and pushes nothing when the sides agree', () => {
    expect(mergeMarks([], [], NOW)).toEqual({
      merged: [],
      toPush: [],
    });
    const same = [rec(1), rec(2)];
    expect(mergeMarks(same, same, NOW).toPush).toEqual([]);
  });

  it('sorts by page then creation time then id so every device lists marks the same way', () => {
    const { merged } = mergeMarks(
      [
        rec(1, {
          page: 20,
        }),
        rec(2, {
          page: 5,
          createdAt: 9,
        }),
        rec(3, {
          page: 5,
          createdAt: 2,
        }),
      ],
      [],
      NOW,
    );
    expect(ids(merged)).toEqual([id(3), id(2), id(1)]);
  });
});

describe('merge: the newer edit wins', () => {
  it('takes the server edit when it is newer and pushes nothing', () => {
    const local = [
      rec(1, {
        label: 'old',
        updatedAt: 1000,
      }),
    ];
    const remote = [
      rec(1, {
        label: 'new',
        updatedAt: 2000,
      }),
    ];
    const { merged, toPush } = mergeMarks(local, remote, NOW);
    expect(merged[0]?.label).toBe('new');
    expect(toPush).toEqual([]);
  });

  it('keeps the device edit when it is newer and pushes it', () => {
    const local = [
      rec(1, {
        label: 'mine',
        updatedAt: 3000,
      }),
    ];
    const remote = [
      rec(1, {
        label: 'theirs',
        updatedAt: 2000,
      }),
    ];
    const { merged, toPush } = mergeMarks(local, remote, NOW);
    expect(merged[0]?.label).toBe('mine');
    expect(ids(toPush)).toEqual([id(1)]);
  });

  it('is the same answer whichever side is called local, including on an exact tie', () => {
    const a = rec(1, {
      label: 'apple',
      updatedAt: 5000,
    });
    const b = rec(1, {
      label: 'banana',
      updatedAt: 5000,
    });
    expect(winner(a, b)).toBe(winner(b, a));
    expect(mergeMarks([a], [b], NOW).merged[0]).toEqual(mergeMarks([b], [a], NOW).merged[0]);
  });
});

describe('merge: tombstones', () => {
  it('a deletion newer than an edit wins over it, on either side', () => {
    const edit = rec(1, {
      label: 'edited',
      updatedAt: NOW - 3000,
    });
    const del = tombstoneOf(
      rec(1, {
        updatedAt: NOW - 4000,
      }),
      NOW - 1000,
    );
    expect(del.updatedAt).toBe(NOW - 1000);
    for (const [local, remote] of [
      [[edit], [del]],
      [[del], [edit]],
    ] as const) {
      const { merged } = mergeMarks([...local], [...remote], NOW);
      expect(merged).toHaveLength(1);
      expect(merged[0]?.deletedAt).toBe(NOW - 1000);
    }
  });

  it('an edit newer than a deletion brings the mark back', () => {
    const del = tombstoneOf(
      rec(1, {
        updatedAt: NOW - 5000,
      }),
      NOW - 4000,
    );
    const edit = rec(1, {
      label: 'again',
      updatedAt: NOW - 1000,
    });
    const { merged } = mergeMarks([del], [edit], NOW);
    expect(merged[0]?.deletedAt).toBeNull();
    expect(merged[0]?.label).toBe('again');
  });

  it('on an exact tie the deletion wins', () => {
    const live = rec(1, {
      updatedAt: 2000,
    });
    const del = {
      ...live,
      label: null,
      deletedAt: 2000,
    };
    expect(winner(live, del)).toBe(del);
    expect(winner(del, live)).toBe(del);
  });

  it('a tombstone keeps no caption and no note text', () => {
    const note = rec(1, {
      kind: 'note',
      label: '#ffd479',
      body: 'private words',
    });
    const gone = tombstoneOf(note, 5000);
    expect(gone.body).toBeNull();
    expect(gone.label).toBeNull();
    expect(gone.deletedAt).toBe(gone.updatedAt);
  });

  it('a deletion is always later than the edit it deletes, even on a slow clock', () => {
    expect(
      tombstoneOf(
        rec(1, {
          updatedAt: 9000,
        }),
        100,
      ).updatedAt,
    ).toBe(9001);
  });

  it('forgets a deletion after 30 days and not before', () => {
    const fresh = {
      ...tombstoneOf(rec(1), NOW - TOMBSTONE_TTL_MS + 1000),
      id: id(1),
    };
    const stale = {
      ...tombstoneOf(rec(2), NOW - TOMBSTONE_TTL_MS - 1000),
      id: id(2),
    };
    expect(ids(mergeMarks([fresh, stale], [], NOW).merged)).toEqual([id(1)]);
  });

  it('the merged set splits into what the reader sees and what the device remembers', () => {
    const state: SyncableState = {
      page: 1,
      bookmarks: [],
      notes: [],
      tombstones: [],
    };
    const merged = mergeMarks(
      [],
      [
        rec(1),
        rec(2, {
          kind: 'note',
          label: '#fff',
          body: 'hi',
        }),
        tombstoneOf(rec(3), NOW - 2000),
      ],
      NOW,
    ).merged;
    const next = applyRecords(state, merged);
    expect(next.bookmarks.map((b) => b.id)).toEqual([id(1)]);
    expect(next.notes.map((n) => [n.id, n.text, n.color])).toEqual([[id(2), 'hi', '#fff']]);
    expect(next.tombstones?.map((t) => t.id)).toEqual([id(3)]);
  });

  it('a note that came without a colour gets the default one', () => {
    const next = applyRecords<SyncableState>(
      {
        page: 1,
        bookmarks: [],
        notes: [],
        tombstones: [],
      },
      [
        rec(1, {
          kind: 'note',
          label: null,
          body: 'x',
        }),
      ],
    );
    expect(next.notes[0]?.color).toBe('#ffd479');
  });
});

describe('place: whichever is newer', () => {
  it('opens on the server place when it is newer, and says so when it differs', () => {
    const pick = pickPlace(
      {
        page: 12,
        placeAt: 1000,
      },
      {
        page: 214,
        location: null,
        updatedAt: 2000,
      },
    );
    expect(pick).toMatchObject({
      source: 'server',
      page: 214,
      updatedAt: 2000,
      continued: true,
    });
  });

  it('keeps the device place when it is newer or equal, with no notice', () => {
    const newer = pickPlace(
      {
        page: 12,
        placeAt: 3000,
      },
      {
        page: 214,
        location: null,
        updatedAt: 2000,
      },
    );
    expect(newer).toMatchObject({
      source: 'device',
      page: 12,
      continued: false,
    });
    const tie = pickPlace(
      {
        page: 12,
        placeAt: 2000,
      },
      {
        page: 214,
        location: null,
        updatedAt: 2000,
      },
    );
    expect(tie.source).toBe('device');
  });

  it('a device that has never opened the book takes the server place', () => {
    const pick = pickPlace(
      {
        page: 0,
      },
      {
        page: 40,
        location: 'c3:2',
        updatedAt: 500,
      },
    );
    expect(pick).toMatchObject({
      source: 'server',
      page: 40,
      loc: 'c3:2',
      continued: true,
    });
  });

  it('does not announce a server place that matches where the device already is', () => {
    const pick = pickPlace(
      {
        page: 40,
        placeAt: 100,
      },
      {
        page: 40,
        location: null,
        updatedAt: 900,
      },
    );
    expect(pick).toMatchObject({
      source: 'server',
      continued: false,
    });
  });

  it('carries the EPUB location, and notices a changed location on the same page', () => {
    const pick = pickPlace(
      {
        page: 4,
        loc: 'c4:1',
        placeAt: 1,
      },
      {
        page: 4,
        location: 'c4:7',
        updatedAt: 9,
      },
    );
    expect(pick).toMatchObject({
      source: 'server',
      loc: 'c4:7',
      continued: true,
    });
  });

  it('keeps the device place when the server has none, or a nonsense one', () => {
    expect(
      pickPlace(
        {
          page: 7,
          placeAt: 5,
        },
        null,
      ).source,
    ).toBe('device');
    expect(
      pickPlace(
        {
          page: 7,
          placeAt: 5,
        },
        {
          page: 0,
          location: null,
          updatedAt: 99,
        },
      ).source,
    ).toBe('device');
    expect(
      pickPlace(
        {
          page: 0,
        },
        null,
      ),
    ).toMatchObject({
      source: 'device',
      page: 0,
      continued: false,
    });
  });
});

describe('caps', () => {
  it('admits new marks while there is room in the book and for the member', () => {
    expect(admitNewMarks([id(1), id(2), id(3)], 0, 0)).toEqual({
      accepted: [id(1), id(2), id(3)],
      rejected: [],
    });
  });
  it('stops at 500 per book and at 5,000 per member, whichever comes first, in arrival order', () => {
    expect(admitNewMarks([id(1), id(2), id(3)], MAX_MARKS_PER_BOOK - 1, 0)).toEqual({
      accepted: [id(1)],
      rejected: [id(2), id(3)],
    });
    expect(admitNewMarks([id(1), id(2)], 10, MAX_MARKS_PER_USER - 1)).toEqual({
      accepted: [id(1)],
      rejected: [id(2)],
    });
    expect(admitNewMarks([id(1)], MAX_MARKS_PER_BOOK, 0).accepted).toEqual([]);
    expect(admitNewMarks([id(1)], 0, MAX_MARKS_PER_USER + 7).accepted).toEqual([]);
  });
});

describe('what the device sends', () => {
  const state: SyncableState = {
    page: 5,
    bookmarks: [
      {
        id: id(1),
        page: 5,
        label: 'Page 5',
        createdAt: 100,
      },
    ],
    notes: [
      {
        id: id(2),
        page: 6,
        text: 'a note',
        color: '#abc',
        createdAt: 200,
        updatedAt: 300,
      },
    ],
    tombstones: [tombstoneOf(rec(3), 900)],
  };

  it('turns the device state into records, an old bookmark taking its creation time as its edit time', () => {
    const rs = stateToRecords(state);
    expect(rs.map((r) => [r.id, r.kind, r.updatedAt, r.deletedAt])).toEqual([
      [id(1), 'bookmark', 100, null],
      [id(2), 'note', 300, null],
      [id(3), 'bookmark', 1001, 1001],
    ]);
    expect(rs[1]).toMatchObject({
      label: '#abc',
      body: 'a note',
    });
  });

  it('sends only what the server has not acknowledged in its current form', () => {
    const rs = stateToRecords(state);
    const acked = new Map(rs.map((r) => [r.id, fingerprint(r)]));
    expect(pendingRecords(rs, acked)).toEqual([]);
    acked.delete(id(2));
    acked.set(id(1), 'stale');
    expect(ids(pendingRecords(rs, acked))).toEqual([id(1), id(2)]);
  });

  it('adopts the server answer for what was sent, but not over an edit made while it was out', () => {
    const sentRec = rec(1, {
      label: 'sent',
      updatedAt: 5000,
    });
    const answer = rec(1, {
      label: 'server',
      updatedAt: 6000,
    });
    expect(adoptCanonical([sentRec], [answer], [sentRec])).toEqual([answer]);
    const edited = rec(1, {
      label: 'edited meanwhile',
      updatedAt: 7000,
    });
    expect(adoptCanonical([edited], [answer], [sentRec])).toEqual([edited]);
  });

  it('does not invent marks the device does not have', () => {
    expect(adoptCanonical([], [rec(1)], [rec(1)])).toEqual([]);
  });

  it('gives marks from before sync a valid id once, and drops deletions past 30 days', () => {
    let n = 0;
    const old: SyncableState = {
      page: 1,
      bookmarks: [
        {
          id: 'abc-123',
          page: 1,
          label: 'x',
          createdAt: 1,
        },
      ],
      notes: [
        {
          id: id(9),
          page: 1,
          text: 't',
          color: '#fff',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tombstones: [tombstoneOf(rec(4), NOW - TOMBSTONE_TTL_MS - 5000)],
    };
    const next = prepareForSync(old, () => id(100 + n++), NOW);
    expect(next.bookmarks[0]?.id).toBe(id(100));
    expect(next.notes[0]?.id).toBe(id(9));
    expect(next.tombstones).toEqual([]);
    expect(n).toBe(1);
  });
});

describe('small rules', () => {
  it('a client id is a 21 to 40 character token', () => {
    expect(isValidClientId('a'.repeat(21))).toBe(true);
    expect(isValidClientId('a'.repeat(20))).toBe(false);
    expect(isValidClientId('a'.repeat(41))).toBe(false);
    expect(isValidClientId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidClientId('has a space in it!!!!!!')).toBe(false);
  });

  it('clamps an edit time to the server clock and away from negatives', () => {
    expect(clampEditTime(NOW + 99, NOW)).toBe(NOW);
    expect(clampEditTime(NOW - 99, NOW)).toBe(NOW - 99);
    expect(clampEditTime(-5, NOW)).toBe(0);
  });

  it('computes the percent read from a page and a page count', () => {
    expect(percentRead(46, 100)).toBe(46);
    expect(percentRead(1, 3)).toBe(33);
    expect(percentRead(500, 100)).toBe(100);
    expect(percentRead(0, 100)).toBe(0);
    expect(percentRead(5, 0)).toBe(0);
  });
});

describe('the place throttle', () => {
  afterEach(() => vi.useRealTimers());

  it('runs at once the first time, then at most once per interval, and holds no timer while idle', () => {
    vi.useFakeTimers();
    let t = 0;
    const run = vi.fn();
    const throttle = createThrottle(run, 10_000, {
      now: () => t,
    });
    throttle.poke();
    vi.advanceTimersByTime(0);
    expect(run).toHaveBeenCalledTimes(1);
    t = 3_000;
    throttle.poke();
    throttle.poke();
    vi.advanceTimersByTime(6_999);
    expect(run).toHaveBeenCalledTimes(1);
    t = 10_000;
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a cooled throttle waits a full interval before its first run', () => {
    vi.useFakeTimers();
    let t = 0;
    const run = vi.fn();
    const throttle = createThrottle(run, 10_000, {
      now: () => t,
      cooled: true,
    });
    throttle.poke();
    vi.advanceTimersByTime(9_999);
    expect(run).not.toHaveBeenCalled();
    t = 10_000;
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flushNow runs immediately and drops the pending run; cancel drops it without running', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const throttle = createThrottle(run, 10_000, {
      cooled: true,
    });
    throttle.poke();
    throttle.flushNow();
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    throttle.poke();
    throttle.cancel();
    vi.advanceTimersByTime(20_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
