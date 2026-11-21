/**
 * The one season clock, and the three systems on it. Stored season ids are
 * user data (battle pass `UserSeasonProgress.seasonId`, `RankedSeasonRating.season`),
 * so these pin that no stored id changes meaning.
 */
import { describe, expect, it } from 'vitest';
import { SEASON_EPOCH, SEASON_MS, seasonBounds, seasonNumberAt, seasonWindowAt } from '@/lib/seasons/clock';
import { buildSeason, currentSeasonId } from '@/lib/battlepass/season';
import {
  LAST_LEGACY_SEASON,
  RANKED_CUTOVER,
  SEASON_EPOCH as RANKED_LEGACY_EPOCH,
  seasonFor,
  seasonWindow,
} from '@/lib/ranked/season';
import { seasonDates } from '@/lib/forecasting/season-dates';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('the season clock', () => {
  it('starts season 1 on 2026-07-07 and ends it on 2026-09-01, as the battle pass always had', () => {
    expect(iso(SEASON_EPOCH)).toBe('2026-07-07T00:00:00.000Z');
    expect(iso(seasonBounds(1).end)).toBe('2026-09-01T00:00:00.000Z');
    expect(seasonNumberAt(SEASON_EPOCH - 1)).toBe(1);
    expect(seasonNumberAt(seasonBounds(1).end - 1)).toBe(1);
    expect(seasonNumberAt(seasonBounds(1).end)).toBe(2);
  });

  it('gives windows that abut', () => {
    for (let n = 1; n < 20; n++) expect(seasonBounds(n + 1).start).toBe(seasonBounds(n).end);
    expect(seasonBounds(3).end - seasonBounds(3).start).toBe(SEASON_MS);
  });

  it('reports the window containing an instant', () => {
    const w = seasonWindowAt(Date.UTC(2026, 10, 19));
    expect(w.number).toBe(3);
    expect(w.start.toISOString()).toBe('2026-10-27T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-12-22T00:00:00.000Z');
  });
});

describe('battle pass on the clock', () => {
  it('keeps its stored season ids', () => {
    expect(currentSeasonId(Date.UTC(2026, 7, 31))).toBe('S1');
    expect(currentSeasonId(Date.UTC(2026, 8, 1))).toBe('S2');
    expect(currentSeasonId(Date.UTC(2026, 10, 19))).toBe('S3');
  });

  it('builds each season on the clock window', () => {
    for (const n of [1, 2, 3, 7]) {
      const s = buildSeason(n);
      expect(s.startsAt).toBe(iso(seasonBounds(n).start));
      expect(s.endsAt).toBe(iso(seasonBounds(n).end));
    }
  });
});

describe('ranked on the clock', () => {
  it('keeps every legacy season number for the instants already played', () => {
    // Season 1 started 5 January 2026; seasons 1..5 keep their 56-day windows.
    for (let n = 1; n < LAST_LEGACY_SEASON; n++) {
      const start = RANKED_LEGACY_EPOCH + (n - 1) * 56 * DAY;
      expect(seasonWindow(n).start.getTime()).toBe(start);
      expect(seasonWindow(n).end.getTime()).toBe(start + 56 * DAY);
      expect(seasonFor(new Date(start))).toBe(n);
      expect(seasonFor(new Date(start + 56 * DAY - 1))).toBe(n);
    }
    // Season 6 began 12 October 2026, and today is still season 6.
    expect(seasonWindow(6).start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(seasonFor(new Date(Date.UTC(2026, 9, 12)))).toBe(6);
    expect(seasonFor(new Date(Date.UTC(2026, 10, 19)))).toBe(6);
  });

  it('runs season 6 on to the shared boundary instead of opening a legacy season 7', () => {
    expect(iso(RANKED_CUTOVER)).toBe('2026-12-22T00:00:00.000Z');
    expect(RANKED_CUTOVER).toBe(seasonBounds(seasonNumberAt(RANKED_CUTOVER)).start);
    expect(seasonWindow(6).end.getTime()).toBe(RANKED_CUTOVER);
    // 7 December would have been legacy season 7.
    expect(seasonFor(new Date(Date.UTC(2026, 11, 7)))).toBe(6);
    expect(seasonFor(new Date(RANKED_CUTOVER - 1))).toBe(6);
    expect(seasonFor(new Date(RANKED_CUTOVER))).toBe(7);
  });

  it('rolls over at the same instant as the battle pass from the cutover on', () => {
    for (let n = 7; n < 30; n++) {
      const w = seasonWindow(n);
      expect(w.start.getTime()).toBe(seasonWindow(n - 1).end.getTime());
      expect(seasonNumberAt(w.start)).not.toBe(seasonNumberAt(w.start.getTime() - 1));
      expect(seasonFor(w.start)).toBe(n);
      expect(seasonFor(new Date(w.end.getTime() - 1))).toBe(n);
      expect(w.end.getTime() - w.start.getTime()).toBe(SEASON_MS);
    }
  });
});

describe('forecasting on the clock', () => {
  it('keeps admin dates', () => {
    const d = seasonDates({ startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' });
    expect(d.startsAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(d.endsAt.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('defaults to the current clock season', () => {
    const d = seasonDates({}, new Date(Date.UTC(2026, 10, 19)));
    expect(d.startsAt.toISOString()).toBe('2026-10-27T00:00:00.000Z');
    expect(d.endsAt.toISOString()).toBe('2026-12-22T00:00:00.000Z');
  });
});
