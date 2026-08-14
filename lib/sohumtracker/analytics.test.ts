import { describe, expect, it } from 'vitest';
import { inferSleep } from './analytics';
import type { WatchDayDTO } from './types';

/**
 * Sleep inference, and specifically the bug it shipped with.
 *
 * The card reported nothing at all on real data. `firstSeenAt`/`lastSeenAt` are
 * touched by status sessions, and a status session closes only when Discord says
 * "offline" — idle keeps it open. Someone who leaves the desktop client running
 * is therefore "seen" from 00:00 to 23:59 every single day, so the gap between
 * one day's last sighting and the next day's first is zero, every night falls
 * under the 3h floor, and the strip renders its empty state forever.
 *
 * The tests below are written so that a return to presence-based inference fails
 * them: every fixture has first/lastSeen pinned to the day's edges, which is what
 * the real rows look like.
 */

/** A day with no activity anywhere, and presence spanning the whole day. */
function day(dateKey: string, overrides: Partial<WatchDayDTO> = {}): WatchDayDTO {
  return {
    dateKey,
    voiceSec: 0,
    voiceSessions: 0,
    longestVoiceSec: 0,
    mutedSec: 0,
    deafenedSec: 0,
    streamingSec: 0,
    videoSec: 0,
    aloneSec: 0,
    lateNightSec: 0,
    onlineSec: 0,
    idleSec: 0,
    dndSec: 0,
    desktopSec: 0,
    mobileSec: 0,
    webSec: 0,
    messages: 0,
    words: 0,
    characters: 0,
    attachments: 0,
    links: 0,
    mentions: 0,
    emoji: 0,
    stickers: 0,
    replies: 0,
    questions: 0,
    lateNightMessages: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
    gamingSec: 0,
    gameSessions: 0,
    topGame: null,
    topGameSec: 0,
    topChannel: null,
    topChannelMessages: 0,
    hourlyMessages: null,
    hourlyVoiceSec: null,
    hourlyGamingSec: null,
    // Exactly what the tracker writes for someone who never quits Discord, and
    // exactly what made the old implementation find zero nights.
    firstSeenAt: `${dateKey}T04:00:00.000Z`,
    lastSeenAt: `${dateKey}T03:59:59.000Z`,
    summary: null,
    ...overrides,
  } as WatchDayDTO;
}

/** 24 buckets with `value` in each listed local hour. */
function hours(active: number[], value = 600): number[] {
  const series = new Array<number>(24).fill(0);
  for (const hour of active) series[hour] = value;
  return series;
}

/** Inclusive range helper, so fixtures read as "awake from 10 to 23". */
function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe('inferSleep', () => {
  it('finds a night even though Discord was signed in the whole time', () => {
    // Awake 10:00–01:00, quiet 02:00–10:59, back at 11:00. This is the shape the
    // card was showing nothing for.
    const days = [
      day('2026-08-11', { hourlyVoiceSec: hours([...range(10, 23)]) }),
      day('2026-08-12', {
        hourlyVoiceSec: hours([0, 1, ...range(11, 23)]),
      }),
    ];

    const sleep = inferSleep(days);

    expect(sleep.nights).toHaveLength(1);
    const [night] = sleep.nights;
    expect(night.nightOf).toBe('2026-08-11');
    expect(night.sleptHour).toBe(2);
    expect(night.wokeHour).toBe(11);
    expect(night.hours).toBe(9);
  });

  it('does not mistake a long gaming session for sleep', () => {
    // Silent from 20:00, but in a game until 03:00 — the reason gaming needed its
    // own histogram. Without it this reports a seven-hour head start on the night.
    const days = [
      day('2026-08-11', {
        hourlyMessages: hours(range(10, 19), 3),
        hourlyGamingSec: hours(range(20, 23), 3600),
      }),
      day('2026-08-12', {
        hourlyGamingSec: hours([0, 1, 2], 3600),
        hourlyMessages: hours(range(12, 23), 3),
      }),
    ];

    const sleep = inferSleep(days);

    expect(sleep.nights).toHaveLength(1);
    expect(sleep.nights[0].sleptHour).toBe(3);
    expect(sleep.nights[0].hours).toBe(9);
  });

  it('takes the longest quiet run, not the first', () => {
    // A two-hour break at 19:00 (dinner) then the real night from 01:00.
    const days = [
      day('2026-08-11', {
        hourlyVoiceSec: hours([...range(14, 18), ...range(21, 23)]),
      }),
      day('2026-08-12', { hourlyVoiceSec: hours([0, ...range(9, 23)]) }),
    ];

    const sleep = inferSleep(days);

    expect(sleep.nights).toHaveLength(1);
    expect(sleep.nights[0].sleptHour).toBe(1);
    expect(sleep.nights[0].hours).toBe(8);
  });

  it('reports nights from only two days of data', () => {
    // The reported symptom. Two days is the minimum, and it has to work.
    const days = [
      day('2026-08-11', { hourlyMessages: hours(range(12, 23), 2) }),
      day('2026-08-12', { hourlyMessages: hours(range(9, 23), 2) }),
    ];

    expect(inferSleep(days).nights).toHaveLength(1);
    expect(inferSleep(days).nights[0].hours).toBe(9);
  });

  it('ignores a day with no histograms rather than calling it a 24h night', () => {
    // An outage is missing data, not a record-breaking lie-in.
    const days = [day('2026-08-11'), day('2026-08-12')];
    expect(inferSleep(days).nights).toEqual([]);
  });

  it('skips non-consecutive days', () => {
    const days = [
      day('2026-08-11', { hourlyVoiceSec: hours(range(10, 23)) }),
      day('2026-08-13', { hourlyVoiceSec: hours(range(10, 23)) }),
    ];
    expect(inferSleep(days).nights).toEqual([]);
  });

  it('discards gaps outside the 3h–15h bounds', () => {
    // Awake right up to 23:00 and back at 01:00: a two-hour gap is a shower,
    // not a night.
    const short = [
      day('2026-08-11', { hourlyVoiceSec: hours(range(8, 23)) }),
      day('2026-08-12', { hourlyVoiceSec: hours([...range(1, 23)]) }),
    ];
    expect(inferSleep(short).nights).toEqual([]);

    // One active hour in the evening and one the following afternoon is a day
    // away from the keyboard, not an eighteen-hour sleep.
    const long = [
      day('2026-08-11', { hourlyVoiceSec: hours([18]) }),
      day('2026-08-12', { hourlyVoiceSec: hours([17]) }),
    ];
    expect(inferSleep(long).nights).toEqual([]);
  });

  it('treats a 4am bedtime as later than an 11pm one', () => {
    const days = [
      day('2026-08-11', { hourlyVoiceSec: hours(range(12, 22)) }), // down at 23:00
      day('2026-08-12', {
        hourlyVoiceSec: hours([...range(8, 23)]),
      }),
      day('2026-08-13', { hourlyVoiceSec: hours([0, 1, 2, 3, ...range(14, 23)]) }), // down at 04:00
      day('2026-08-14', { hourlyVoiceSec: hours(range(13, 23)) }),
    ];

    const sleep = inferSleep(days);

    expect(sleep.nights.length).toBeGreaterThanOrEqual(2);
    // On a plain clock 4 < 23; on the 18:00-anchored axis the card uses, it is
    // the later night, and that is the one "latest he has gone down" must show.
    expect(sleep.latest?.sleptHour).toBe(4);
  });

  it('states the night as real instants in the tracking zone', () => {
    const days = [
      day('2026-08-11', { hourlyVoiceSec: hours(range(10, 23)) }),
      day('2026-08-12', { hourlyVoiceSec: hours(range(11, 23)) }),
    ];

    const [night] = inferSleep(days).nights;

    // 00:00 EDT on the 12th is 04:00Z; waking at 11:00 EDT is 15:00Z.
    expect(night.sleptAt).toBe('2026-08-12T04:00:00.000Z');
    expect(night.wokeAt).toBe('2026-08-12T15:00:00.000Z');
    expect(night.hours).toBe(11);
  });
});
