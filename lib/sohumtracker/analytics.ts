/**
 * The derived readings of `/sohumtracker` — everything the page says that is not
 * a column in `discord_watch_day`.
 *
 * Client-safe and pure: no Prisma, no `node:*`, no clock of its own. Every
 * function takes the day list the page was already given and folds it, which is
 * what lets the punch card, the sleep estimate, the records and the projection
 * live beside the figures they are drawn from instead of costing four queries.
 *
 * # Why these are derivations and not columns
 *
 * The tracker writes what it MEASURES. A weekday × hour grid, a bedtime, a
 * personal best and a projection to 2030 are all re-readings of those
 * measurements, and re-reading is cheap (120 rows) while a stored derivation is
 * a second thing to keep correct when the definition moves. So the rule for this
 * file is: if it can be recomputed from `WatchDayDTO[]`, it lives here.
 *
 * The one thing that cannot be — which local hour an instant fell in — is done
 * with `Intl` against the tracking zone, never the viewer's. A reader in Berlin
 * must see the same bedtime as a reader in Rochester, because it is HIS bedtime.
 */

import { zonedTimeToUtc } from '@/lib/pf2ecal/zoned-time';
import { TRACKING_TIME_ZONE } from './config';
import { dateKeyToUtc, daysBetween, isoWeekKey, mondayIndex, shiftDateKey } from './dates';
import type { WatchDayDTO } from './types';

/* -------------------------------------------------------------------------- */
/* Punch card                                                                 */
/* -------------------------------------------------------------------------- */

/** One weekday × hour bucket, folded across every day in the window. */
export interface PunchCell {
  /** 0 = Monday … 6 = Sunday, matching `mondayIndex`. */
  weekday: number;
  /** 0–23, local to the tracking zone. */
  hour: number;
  voiceSec: number;
  messages: number;
}

export interface PunchCard {
  /** 168 cells, ordered weekday-major then hour. Always the full grid. */
  cells: PunchCell[];
  maxVoiceSec: number;
  maxMessages: number;
  /** How many days carried hourly histograms — the grid's real sample size. */
  sampledDays: number;
  /** The single busiest bucket by voice time, or null when the grid is empty. */
  busiest: PunchCell | null;
}

/**
 * Fold the per-day hourly histograms into one 7 × 24 grid.
 *
 * The histograms are already bucketed in the tracking zone by the rollup, so
 * this is addition and nothing else — no instant is re-interpreted here, which
 * is exactly why the grid can be built on the client.
 *
 * Days whose histograms are null (rows written before the columns existed) are
 * skipped rather than counted as zero: a stretch of empty Tuesdays and a stretch
 * of unrecorded Tuesdays look identical on a heatmap, and only one of them is a
 * fact about him.
 */
export function buildPunchCard(days: WatchDayDTO[]): PunchCard {
  const cells: PunchCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({ weekday, hour, voiceSec: 0, messages: 0 });
    }
  }

  let sampledDays = 0;
  for (const day of days) {
    if (!day.hourlyVoiceSec && !day.hourlyMessages) continue;
    sampledDays += 1;
    const base = mondayIndex(day.dateKey) * 24;
    for (let hour = 0; hour < 24; hour += 1) {
      const cell = cells[base + hour];
      cell.voiceSec += day.hourlyVoiceSec?.[hour] ?? 0;
      cell.messages += day.hourlyMessages?.[hour] ?? 0;
    }
  }

  let maxVoiceSec = 0;
  let maxMessages = 0;
  let busiest: PunchCell | null = null;
  for (const cell of cells) {
    if (cell.voiceSec > maxVoiceSec) {
      maxVoiceSec = cell.voiceSec;
      busiest = cell;
    }
    if (cell.messages > maxMessages) maxMessages = cell.messages;
  }

  return { cells, maxVoiceSec, maxMessages, sampledDays, busiest };
}

/* -------------------------------------------------------------------------- */
/* Sleep                                                                      */
/* -------------------------------------------------------------------------- */

/** One inferred night: the gap between the last trace of him and the next. */
export interface SleepWindow {
  /** The day the night STARTED on — `2026-08-11` is the night of the 11th. */
  nightOf: string;
  sleptAt: string;
  wokeAt: string;
  hours: number;
  /** Fractional local hour, e.g. 2.75 = 02:45. */
  sleptHour: number;
  wokeHour: number;
}

export interface SleepPattern {
  nights: SleepWindow[];
  /** Median gap length, in hours. Median, not mean: one 40h gap is a holiday. */
  medianHours: number;
  /** Fractional local hours, circular-median'd — see `circularMedian`. */
  medianSleptHour: number;
  medianWokeHour: number;
  /** The night he went to bed latest, and the shortest gap on record. */
  latest: SleepWindow | null;
  shortest: SleepWindow | null;
}

/**
 * A gap has to be at least this long to be sleep rather than dinner.
 *
 * Three hours: he plays games in blocks and a two-hour gap is a break. This
 * necessarily also swallows any genuine three-hour night, which is the right
 * trade — a page that reports "he slept 2h" off a lunch break is worse than one
 * that reports one fewer night.
 */
const MIN_SLEEP_HOURS = 3;

/** …and at most this, above which it is a day off Discord, not a night. */
const MAX_SLEEP_HOURS = 15;

/**
 * The hour a night window starts on.
 *
 * 18:00, so a night runs 18:00 → 18:00 and a 04:00 bedtime sorts after a 23:00
 * one instead of before it. The card draws the same axis.
 */
const NIGHT_ANCHOR_HOUR = 18;

/**
 * The longest run of consecutive quiet hours in a night window.
 *
 * Longest, not first: an evening often has a quiet hour in it (dinner, a shower,
 * a drive) and taking the first run would report that as the night. Ties go to
 * the earlier run, which matters only for a day so empty that the length bounds
 * will discard it anyway.
 */
function longestQuietRun(window: boolean[]): { start: number; length: number } | null {
  let best: { start: number; length: number } | null = null;
  let start = -1;

  for (let index = 0; index <= window.length; index += 1) {
    const active = index < window.length ? window[index] : true;
    if (!active) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0) {
      const length = index - start;
      if (!best || length > best.length) best = { start, length };
      start = -1;
    }
  }
  return best;
}

/**
 * The instant at a given local hour of a day key, as an ISO string.
 *
 * `hour` may run past 24 — a night window is anchored at 18:00, so hour 30 is
 * 06:00 the next morning, and `Date.UTC` normalises the overflow. The
 * conversion goes through `zonedTimeToUtc` rather than adding milliseconds so
 * that a night containing a DST transition still starts and ends on the wall
 * clock hours the histograms were bucketed by.
 */
function instantAtLocalHour(dateKey: string, hour: number): string {
  const day = dateKeyToUtc(dateKey);
  return zonedTimeToUtc(
    {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour,
    },
    TRACKING_TIME_ZONE,
  ).toISOString();
}

/**
 * The median of a set of hours-on-a-clock, taken around an anchor.
 *
 * A plain median is wrong for times that straddle midnight: 23:30 and 00:30
 * median to 12:00, which is the one hour he is definitely not going to bed. So
 * each hour is re-expressed as "hours after `anchor`", median'd on that line,
 * and wrapped back. The anchor is chosen to be an hour the samples never cross —
 * 18:00 for bedtimes, 03:00 for wake-ups.
 */
function circularMedian(hours: number[], anchor: number): number {
  if (hours.length === 0) return 0;
  const shifted = hours.map((hour) => (hour - anchor + 24) % 24).sort((a, b) => a - b);
  const middle = Math.floor(shifted.length / 2);
  const median =
    shifted.length % 2 === 1 ? shifted[middle] : (shifted[middle - 1] + shifted[middle]) / 2;
  return (median + anchor) % 24;
}

/** Plain median of a numeric list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Whether he did anything at all in each local hour of a day.
 *
 * ACTIVITY, deliberately — messages, voice, or a game — and never presence.
 *
 * `firstSeenAt`/`lastSeenAt` look like the obvious inputs here and were the
 * original ones, but they are touched by status sessions, and a status session
 * closes only when Discord reports "offline". Idle does not close it. Anyone who
 * leaves the desktop client running overnight is therefore "seen" continuously:
 * the session spans midnight, gets clipped to each day, and every day comes back
 * with `lastSeenAt` at 23:59 and `firstSeenAt` at 00:00. The gap between them is
 * zero, every night falls under the 3h floor, and the card reports nothing at
 * all — which is exactly what it was doing.
 *
 * Being idle with Discord open is not being awake. Sending a message, sitting in
 * voice, or having a game open is. So the three histograms are the signal, and
 * gaming has to be one of them: he games in long silent stretches, and without
 * it an evening in a game reads as an early night.
 */
function activeHours(day: WatchDayDTO | undefined): boolean[] {
  const hours = new Array<boolean>(24).fill(false);
  if (!day) return hours;
  for (const series of [day.hourlyMessages, day.hourlyVoiceSec, day.hourlyGamingSec]) {
    if (!series) continue;
    for (let hour = 0; hour < 24; hour += 1) {
      if ((series[hour] ?? 0) > 0) hours[hour] = true;
    }
  }
  return hours;
}

/**
 * When he sleeps, inferred from when he stops and starts doing things.
 *
 * This is an INFERENCE and the page says so: the tracker sees Discord, not a
 * bedroom. A night here is the longest unbroken run of hours, across one
 * midnight, in which he sent nothing, joined nothing and played nothing.
 *
 * Resolution is one hour, because that is the resolution of the histograms. A
 * night is reported from the start of the first quiet hour to the end of the
 * last, so a bedtime reads as "02:00" rather than "02:47" — coarser than the old
 * timestamp arithmetic, and unlike it, actually measuring the right thing.
 */
export function inferSleep(days: WatchDayDTO[]): SleepPattern {
  const nights: SleepWindow[] = [];

  for (let index = 0; index < days.length - 1; index += 1) {
    const day = days[index];
    const next = days[index + 1];
    // Consecutive calendar days only: a gap across a quiet Wednesday is two
    // nights and a day, and averaging it in would push every figure late.
    if (daysBetween(day.dateKey, next.dateKey) !== 1) continue;

    // The night window is 18:00 on the first day to 18:00 on the second, which
    // is the axis the card draws and the only one on which a 4am bedtime reads
    // as late. Index 0 is 18:00; hour h of the window is 24h long.
    const today = activeHours(day);
    const tomorrow = activeHours(next);
    const window = Array.from({ length: 24 }, (_, offset) => {
      const hour = (NIGHT_ANCHOR_HOUR + offset) % 24;
      return offset < 24 - NIGHT_ANCHOR_HOUR ? today[hour] : tomorrow[hour];
    });

    // A day with no histograms at all is not a 24-hour night; it is a day the
    // tracker has nothing for. Without this, an outage would be reported as his
    // longest ever sleep.
    if (!window.some(Boolean)) continue;

    const run = longestQuietRun(window);
    if (!run) continue;
    if (run.length < MIN_SLEEP_HOURS || run.length > MAX_SLEEP_HOURS) continue;

    const sleptHour = (NIGHT_ANCHOR_HOUR + run.start) % 24;
    const wokeHour = (NIGHT_ANCHOR_HOUR + run.start + run.length) % 24;
    // The instants are reconstructed from the hour so the export and the
    // screen-reader table can state a real time rather than an offset.
    const sleptAt = instantAtLocalHour(day.dateKey, NIGHT_ANCHOR_HOUR + run.start);
    const wokeAt = instantAtLocalHour(day.dateKey, NIGHT_ANCHOR_HOUR + run.start + run.length);

    nights.push({
      nightOf: day.dateKey,
      sleptAt,
      wokeAt,
      hours: run.length,
      sleptHour,
      wokeHour,
    });
  }

  // "Latest" is measured on the 18:00-anchored line, so 02:00 counts as later
  // than 23:00 rather than as the earliest bedtime in the set.
  const bedtimeRank = (night: SleepWindow) => (night.sleptHour - 18 + 24) % 24;

  return {
    nights,
    medianHours: median(nights.map((night) => night.hours)),
    medianSleptHour: circularMedian(
      nights.map((night) => night.sleptHour),
      18,
    ),
    medianWokeHour: circularMedian(
      nights.map((night) => night.wokeHour),
      3,
    ),
    latest: nights.reduce<SleepWindow | null>(
      (best, night) => (!best || bedtimeRank(night) > bedtimeRank(best) ? night : best),
      null,
    ),
    shortest: nights.reduce<SleepWindow | null>(
      (best, night) => (!best || night.hours < best.hours ? night : best),
      null,
    ),
  };
}

/** `02:45` from a fractional local hour. */
export function formatHourOfDay(hour: number): string {
  if (!Number.isFinite(hour)) return '—';
  const wrapped = ((hour % 24) + 24) % 24;
  const hours = Math.floor(wrapped);
  const minutes = Math.round((wrapped - hours) * 60);
  // Rounding 23.999 must not produce 23:60.
  const carry = minutes === 60 ? 1 : 0;
  return `${String((hours + carry) % 24).padStart(2, '0')}:${String(carry ? 0 : minutes).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

/** One personal best: what it was, when, and how it is rendered. */
export interface WatchRecord {
  id: string;
  dateKey: string | null;
  value: number;
  /** `duration` renders through `formatDuration`, `count` through `formatCount`. */
  kind: 'duration' | 'count';
}

/**
 * The biggest day for each figure worth a leaderboard.
 *
 * Returned as an ordered list of `{id, value}` rather than a labelled object
 * because the labels are `t()` calls and `i18next-parser` is a static scanner:
 * a label stored beside the number here would never reach `locales/`.
 */
export function buildRecords(days: WatchDayDTO[]): WatchRecord[] {
  const best = (
    id: string,
    kind: WatchRecord['kind'],
    pick: (day: WatchDayDTO) => number,
  ): WatchRecord => {
    let record: WatchRecord = { id, dateKey: null, value: 0, kind };
    for (const day of days) {
      const value = pick(day);
      if (value > record.value) record = { id, dateKey: day.dateKey, value, kind };
    }
    return record;
  };

  return [
    best('presence', 'duration', (day) => day.onlineSec + day.idleSec + day.dndSec),
    best('voice', 'duration', (day) => day.voiceSec),
    best('session', 'duration', (day) => day.longestVoiceSec),
    best('messages', 'count', (day) => day.messages),
    best('gaming', 'duration', (day) => day.gamingSec),
    best('alone', 'duration', (day) => day.aloneSec),
    best('late', 'duration', (day) => day.lateNightSec),
    best('mobile', 'duration', (day) => day.mobileSec),
  ];
}

/* -------------------------------------------------------------------------- */
/* Week over week                                                             */
/* -------------------------------------------------------------------------- */

/** One figure, this week against last. */
export interface WeekDelta {
  id: string;
  current: number;
  previous: number;
  /** Signed fraction, e.g. 0.42 = up 42%. Null when last week was zero. */
  change: number | null;
  kind: 'duration' | 'count';
}

export interface WeekComparison {
  currentKey: string;
  previousKey: string;
  /** Days of the current week that have happened — the honest denominator. */
  elapsedDays: number;
  deltas: WeekDelta[];
}

/**
 * This ISO week against the last one.
 *
 * **Both sides are truncated to the same number of days.** Comparing a Tuesday's
 * two days against last week's full seven would report a 70% collapse every
 * Monday morning, which is an artefact of the calendar and not a fact about him.
 * So the previous week is measured only up to the same weekday.
 */
export function compareWeeks(days: WatchDayDTO[], todayKey: string): WeekComparison {
  const currentKey = isoWeekKey(todayKey);
  const previousKey = isoWeekKey(shiftDateKey(todayKey, -7));
  const elapsedDays = mondayIndex(todayKey) + 1;

  const inWindow = (day: WatchDayDTO, weekKey: string, offsetDays: number) => {
    if (isoWeekKey(day.dateKey) !== weekKey) return false;
    return mondayIndex(day.dateKey) < offsetDays;
  };

  const sum = (weekKey: string, pick: (day: WatchDayDTO) => number) =>
    days.reduce((total, day) => (inWindow(day, weekKey, elapsedDays) ? total + pick(day) : total), 0);

  const delta = (
    id: string,
    kind: WeekDelta['kind'],
    pick: (day: WatchDayDTO) => number,
  ): WeekDelta => {
    const current = sum(currentKey, pick);
    const previous = sum(previousKey, pick);
    return {
      id,
      current,
      previous,
      // Null rather than Infinity when last week was zero: "up ∞%" is not a
      // reading, and the card shows the raw pair instead.
      change: previous > 0 ? (current - previous) / previous : null,
      kind,
    };
  };

  return {
    currentKey,
    previousKey,
    elapsedDays,
    deltas: [
      delta('presence', 'duration', (day) => day.onlineSec + day.idleSec + day.dndSec),
      delta('voice', 'duration', (day) => day.voiceSec),
      delta('messages', 'count', (day) => day.messages),
      delta('gaming', 'duration', (day) => day.gamingSec),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The pledge deadline, verbatim from `/sohumbum`: midnight, January 1st 2030,
 * US Eastern. Duplicated rather than imported because that page is a different
 * feature with its own module and the constant is one line — but the two must
 * agree, because this page's whole projection is "at this rate, by then".
 */
export const PLEDGE_DEADLINE_KEY = '2030-01-01';

/** One figure carried forward to the deadline. */
export interface ProjectedFigure {
  id: string;
  /** Measured average per day over the sample window. */
  perDay: number;
  /** `perDay` × days remaining — what is still to come, not a running total. */
  remaining: number;
  kind: 'duration' | 'count';
}

export interface Projection {
  /** How many days of measurement the rate is drawn from. */
  sampleDays: number;
  daysRemaining: number;
  figures: ProjectedFigure[];
  /**
   * Projected voice time as a share of the whole remaining stretch — the one
   * number that puts the others in proportion. 0.18 = a sixth of the rest of the
   * decade, in a voice channel.
   */
  voiceShare: number;
  /** True once the deadline has passed and the projection is history. */
  expired: boolean;
}

/**
 * What the current rate comes to by January 1st, 2030.
 *
 * A flat linear carry-forward, deliberately: any curve fitted to four months of
 * one person's Discord habit would be a decoration on the same guess, and the
 * page's register is measured figures stated plainly. The rate is per CALENDAR
 * day in the sample — quiet days included — because the days between now and
 * 2030 will include quiet ones too.
 */
export function projectToDeadline(days: WatchDayDTO[], todayKey: string): Projection {
  const sampleDays = days.length;
  const daysRemaining = Math.max(0, daysBetween(todayKey, PLEDGE_DEADLINE_KEY));

  const rate = (pick: (day: WatchDayDTO) => number) =>
    sampleDays > 0 ? days.reduce((total, day) => total + pick(day), 0) / sampleDays : 0;

  const figure = (
    id: string,
    kind: ProjectedFigure['kind'],
    pick: (day: WatchDayDTO) => number,
  ): ProjectedFigure => {
    const perDay = rate(pick);
    return { id, perDay, remaining: perDay * daysRemaining, kind };
  };

  const voice = figure('voice', 'duration', (day) => day.voiceSec);

  return {
    sampleDays,
    daysRemaining,
    figures: [
      figure('presence', 'duration', (day) => day.onlineSec + day.idleSec + day.dndSec),
      voice,
      figure('messages', 'count', (day) => day.messages),
      figure('gaming', 'duration', (day) => day.gamingSec),
      figure('mobile', 'duration', (day) => day.mobileSec),
    ],
    voiceShare: daysRemaining > 0 ? voice.remaining / (daysRemaining * 86_400) : 0,
    expired: daysRemaining === 0,
  };
}
