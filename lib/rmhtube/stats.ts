/**
 * RMHTube watch statistics: the pure rules (client-safe, no I/O).
 *
 * The hub's recorder (server/rmhtube/stats-recorder.ts) and the web tier
 * (stats.server.ts) both read these, so "what counts" is written once.
 */
import { addDays, dayOf } from '../calendar/tz';

/** A queue item counts as watched once the member was present for this share of its known duration. */
export const VIDEO_WATCHED_FRACTION = 0.5;
/** When the duration is unknown (a live stream, a bare URL) two minutes of presence count. */
export const VIDEO_WATCHED_UNKNOWN_SECONDS = 120;
/** Per-day minutes are kept this many days. */
export const WATCH_DAY_RETENTION_DAYS = 90;
/** The panel's chart covers this many UTC days, today included. */
export const STATS_CHART_DAYS = 30;

/** The owner's counters, as the panel and the export show them. */
export interface WatchCounters {
  totalWatchTimeMinutes: number;
  videosWatched: number;
  roomsCreated: number;
  roomsJoined: number;
  messagesSent: number;
  reactionsUsed: number;
}

export interface WatchDayMinutes {
  /** "YYYY-MM-DD", UTC. */
  day: string;
  minutes: number;
}

export interface WatchStats {
  counters: WatchCounters;
  paused: boolean;
  /** Exactly STATS_CHART_DAYS entries, oldest first, ending today (UTC). */
  days: WatchDayMinutes[];
}

/**
 * True when a member who was present for `playedSeconds` of an item watched it: at least half of a known
 * duration, or two minutes when the duration is unknown or zero.
 */
export function isVideoWatched(playedSeconds: number, durationSeconds: number | null): boolean {
  if (!(playedSeconds > 0)) return false;
  if (durationSeconds === null || !(durationSeconds > 0)) {
    return playedSeconds >= VIDEO_WATCHED_UNKNOWN_SECONDS;
  }
  return playedSeconds >= durationSeconds * VIDEO_WATCHED_FRACTION;
}

/**
 * Whole minutes covered by a set of presence intervals (epoch ms). Overlaps count once, a reversed or empty
 * interval counts nothing, and the remainder under a minute is not rounded up.
 */
export function minutesFromIntervals(
  intervals: ReadonlyArray<{
    start: number;
    end: number;
  }>,
): number {
  const sorted = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map((i) => ({
      start: i.start,
      end: i.end,
    }))
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const i of sorted) {
    if (i.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = i.start;
      curEnd = i.end;
    } else if (i.end > curEnd) {
      curEnd = i.end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return Math.floor(total / 60_000);
}

/** The UTC day key ("YYYY-MM-DD") of an instant. */
export function utcDay(ms: number): string {
  return dayOf(ms, 'UTC');
}

/** The last 30 UTC days ending on `nowMs`'s day, oldest first, with a zero for every day that has no row. */
export function zeroFill30(rows: ReadonlyArray<WatchDayMinutes>, nowMs: number): WatchDayMinutes[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Math.max(0, r.minutes));
  const today = utcDay(nowMs);
  const out: WatchDayMinutes[] = [];
  for (let back = STATS_CHART_DAYS - 1; back >= 0; back -= 1) {
    const day = addDays(today, -back);
    out.push({
      day,
      minutes: byDay.get(day) ?? 0,
    });
  }
  return out;
}

/** The first UTC day shown in the chart; rows before it are not read. */
export function chartStartDay(nowMs: number): string {
  return addDays(utcDay(nowMs), -(STATS_CHART_DAYS - 1));
}

/** The oldest day a row may keep (`WATCH_DAY_RETENTION_DAYS` including today). */
export function retentionCutoffDay(nowMs: number): string {
  return addDays(utcDay(nowMs), -(WATCH_DAY_RETENTION_DAYS - 1));
}

/** True when the member has nothing recorded (every counter zero and no minutes in the window). */
export function isEmptyStats(stats: WatchStats): boolean {
  const c = stats.counters;
  return (
    c.totalWatchTimeMinutes === 0 &&
    c.videosWatched === 0 &&
    c.roomsCreated === 0 &&
    c.roomsJoined === 0 &&
    c.messagesSent === 0 &&
    c.reactionsUsed === 0 &&
    stats.days.every((d) => d.minutes === 0)
  );
}
