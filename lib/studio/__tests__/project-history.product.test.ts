import { describe, expect, it } from 'vitest';
import {
  MAX_VERSIONS_PER_PROJECT,
  MAX_VERSION_BYTES_PER_MEMBER,
  VERSION_WINDOW_MS,
  overflowByBytes,
  overflowByCount,
  shouldCapture,
  trackCountOf,
} from '@/lib/studio/project-history';

describe('shouldCapture', () => {
  const t = 1_000_000_000_000;
  it('keeps the first version of a project', () => {
    expect(shouldCapture(t, null, false)).toBe(true);
  });
  it('skips a version less than ten minutes after the newest kept one', () => {
    expect(shouldCapture(t + VERSION_WINDOW_MS - 1, t, false)).toBe(false);
  });
  it('keeps a version exactly ten minutes or more after the newest kept one', () => {
    expect(shouldCapture(t + VERSION_WINDOW_MS, t, false)).toBe(true);
    expect(shouldCapture(new Date(t + 3 * VERSION_WINDOW_MS), new Date(t), false)).toBe(true);
  });
  it('a restore always keeps', () => {
    expect(shouldCapture(t + 1, t, true)).toBe(true);
  });
  it('autosaving every minute for an hour keeps about six', () => {
    let kept: number | null = null;
    let count = 0;
    for (let minute = 0; minute < 60; minute++) {
      const savedAt = t + minute * 60_000;
      if (shouldCapture(savedAt, kept, false)) {
        kept = savedAt;
        count++;
      }
    }
    expect(count).toBe(6);
  });
});

describe('trackCountOf', () => {
  it('counts tracks and treats anything else as none', () => {
    expect(trackCountOf({ tracks: [{}, {}, {}] })).toBe(3);
    expect(trackCountOf({})).toBe(0);
    expect(trackCountOf(null)).toBe(0);
    expect(trackCountOf('x')).toBe(0);
    expect(trackCountOf({ tracks: 'no' })).toBe(0);
  });
});

describe('overflowByCount', () => {
  it('keeps the newest revisions and drops the oldest', () => {
    const rows = Array.from({ length: MAX_VERSIONS_PER_PROJECT + 2 }, (_, i) => ({ id: `v${i + 1}`, revision: i + 1 }));
    expect(overflowByCount(rows).sort()).toEqual(['v1', 'v2']);
    expect(overflowByCount(rows.slice(0, 20))).toEqual([]);
    expect(overflowByCount(rows, 3)).toHaveLength(rows.length - 3);
  });
});

describe('overflowByBytes', () => {
  const half = MAX_VERSION_BYTES_PER_MEMBER / 2;
  it('drops nothing under the cap', () => {
    expect(
      overflowByBytes([
        { id: 'a', sizeBytes: half, savedAt: 1 },
        { id: 'b', sizeBytes: half, savedAt: 2 },
      ]),
    ).toEqual([]);
  });
  it('drops the oldest across projects until under the cap', () => {
    const rows = [
      { id: 'new', sizeBytes: half, savedAt: 30 },
      { id: 'old', sizeBytes: half, savedAt: 10 },
      { id: 'mid', sizeBytes: 1000, savedAt: 20 },
    ];
    expect(overflowByBytes(rows)).toEqual(['old']);
    expect(overflowByBytes(rows, 100)).toEqual(['old', 'mid', 'new']);
  });
});
