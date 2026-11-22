import { describe, expect, it } from 'vitest';
import {
  PLAYLIST_FETCH_CAP,
  noticeKind,
  durationSecToMs,
  planPlaylistQueue,
  playlistFetchLimit,
  queueToPlaylistRows,
  remainingCapacity,
  toResult,
} from '../playlist-queue';

const yt = (n: number) => `https://www.youtube.com/watch?v=video${String(n).padStart(6, '0')}`;
const row = (n: number, over: Partial<{ url: string | null; durationMs: number | null }> = {}) => ({
  url: yt(n),
  title: `T${n}`,
  durationMs: null,
  thumbnail: null,
  ...over,
});

describe('capacity', () => {
  it('reads remaining plus an allowance, never more than the cap, never negative', () => {
    expect(playlistFetchLimit(10)).toBe(30);
    expect(playlistFetchLimit(190)).toBe(PLAYLIST_FETCH_CAP);
    expect(playlistFetchLimit(0)).toBe(20);
    expect(remainingCapacity(88, 100)).toBe(12);
    expect(remainingCapacity(120, 100)).toBe(0);
  });
});

describe('planPlaylistQueue', () => {
  it('keeps playlist order', () => {
    const plan = planPlaylistQueue([row(3), row(1), row(2)], 10, 3);
    expect(plan.accepted.map((a) => a.title)).toEqual(['T3', 'T1', 'T2']);
    expect(plan.full).toBe(false);
  });

  it('takes only what fits and flags the overflow', () => {
    const plan = planPlaylistQueue(
      Array.from({ length: 30 }, (_, i) => row(i)),
      12,
      30,
    );
    expect(plan.accepted).toHaveLength(12);
    expect(plan.full).toBe(true);
    expect(toResult(plan)).toEqual({ added: 12, total: 30, skipped: 0, full: true });
  });

  it('is not full when the last playable row takes the last seat', () => {
    const plan = planPlaylistQueue([row(1), row(2)], 2, 2);
    expect(plan.accepted).toHaveLength(2);
    expect(plan.full).toBe(false);
  });

  it('counts rows with no URL or an unplaceable link as skipped, and lets later rows use the seats', () => {
    const plan = planPlaylistQueue(
      [row(1, { url: null }), row(2, { url: 'https://example.com/signed/1' }), row(3), row(4)],
      2,
      4,
    );
    expect(plan.skipped).toBe(2);
    expect(plan.accepted.map((a) => a.title)).toEqual(['T3', 'T4']);
  });

  it("converts stored milliseconds to the queue's seconds", () => {
    const plan = planPlaylistQueue([row(1, { durationMs: 90_500 }), row(2, { durationMs: 0 })], 5, 2);
    expect(plan.accepted.map((a) => a.durationSec)).toEqual([91, null]);
  });

  it('never reports a total smaller than the rows read', () => {
    expect(planPlaylistQueue([row(1), row(2)], 5, 0).total).toBe(2);
  });
});

describe('noticeKind', () => {
  it('names the four outcomes', () => {
    expect(noticeKind({ added: 5, total: 5, skipped: 0, full: false })).toBe('all');
    expect(noticeKind({ added: 12, total: 30, skipped: 0, full: true })).toBe('partial-full');
    expect(noticeKind({ added: 0, total: 3, skipped: 3, full: false })).toBe('none-playable');
    expect(noticeKind({ added: 0, total: 3, skipped: 0, full: true })).toBe('none-full');
  });
});

describe('queueToPlaylistRows', () => {
  const item = (n: number, duration: number | null = null) => ({
    url: yt(n),
    title: `T${n}`,
    thumbnailUrl: null,
    addedByName: 'Dana',
    duration,
  });

  it('keeps queue order, de-dupes by URL and converts seconds to milliseconds', () => {
    const rows = queueToPlaylistRows([item(2, 61), item(1), item(2)]);
    expect(rows.map((r) => r.title)).toEqual(['T2', 'T1']);
    expect(rows[0]?.durationMs).toBe(61_000);
    expect(rows[0]?.externalId).toBe(yt(2));
  });

  it('caps the count', () => {
    const rows = queueToPlaylistRows(Array.from({ length: 250 }, (_, i) => item(i)));
    expect(rows).toHaveLength(200);
    expect(queueToPlaylistRows([item(1), item(2), item(3)], 2)).toHaveLength(2);
  });
});

describe('durationSecToMs', () => {
  it("converts the queue's seconds to the playlist's milliseconds", () => {
    expect(durationSecToMs(212)).toBe(212_000);
    expect(durationSecToMs(null)).toBeNull();
    expect(durationSecToMs(0)).toBeNull();
  });
});
