/**
 * Reads the `discord_watch_*` tables into the shapes `/sohumtracker` renders.
 *
 * This module is the ONLY place the page's data is assembled — the route loader,
 * the polling API and the OG card all call in here, so the numbers on the page,
 * in the unfurl and in the JSON can never disagree.
 *
 * # It only ever reads
 *
 * The tracker (a Go worker) is the sole writer. Nothing in the web tier creates
 * or amends a row, which is why there is no auth check anywhere below: there is
 * no privileged action to gate, and the page is public by design.
 *
 * # Live figures are computed here, not stored
 *
 * A voice session with a NULL `leftAt` is still running, so its duration is
 * measured against the moment the response is built. The same is true of the
 * open activity. That is what lets the profile card count upwards without the
 * tracker writing a row every second.
 */

import { prisma } from '@/lib/prisma.server';
// The timezone helpers live under `lib/pf2ecal/` because that page needed them
// first, but they are generic, dependency-free and client-safe. Re-deriving
// "what local day is it" here would be a second implementation of the one piece
// of arithmetic this repo has already got wrong once.
import { zonedDateKey } from '@/lib/pf2ecal/zoned-time';
import {
  DEFAULT_HISTORY_DAYS,
  MAX_HISTORY_DAYS,
  SUBJECT_DISCORD_ID,
  SUBJECT_FALLBACK_NAME,
  TRACKING_TIME_ZONE,
} from './config';
import { isValidDateKey, isoWeekKey, monthKeyOf, shiftDateKey } from './dates';
import type {
  DiscordStatus,
  WatchActivityDTO,
  SummaryPeriod,
  WatchDayDTO,
  WatchLiveDTO,
  WatchStateDTO,
  WatchSummaryDTO,
  WatchTotalsDTO,
} from './types';

const STATUSES: readonly DiscordStatus[] = ['online', 'idle', 'dnd', 'offline'];

/** Narrow a stored status string to the union, defaulting to offline. */
function asStatus(value: string | null | undefined): DiscordStatus {
  return STATUSES.includes(value as DiscordStatus) ? (value as DiscordStatus) : 'offline';
}

/** Whole seconds between two instants, floored at zero. */
function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

/**
 * Coerce a stored JSON array into 24 numbers.
 *
 * `hourlyMessages` is `Json`, so Prisma's type for it is "anything". A chart
 * handed a short array silently draws fewer bars, so the length is enforced here
 * rather than at three call sites.
 */
function asHourly(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const hours = Array.from({ length: 24 }, (_, i) => {
    const entry = value[i];
    return typeof entry === 'number' && Number.isFinite(entry) ? Math.max(0, entry) : 0;
  });
  return hours;
}

/**
 * Coerce the stored `activities` JSON into the DTO, dropping anything malformed.
 *
 * The column is `Json`, so Prisma types it as "anything" — and it is written by
 * a different process in a different language. Validating here rather than
 * trusting the shape keeps a bad row from rendering as `undefined` on the card.
 */
function asActivities(value: unknown, now: Date): WatchActivityDTO[] {
  if (!Array.isArray(value)) return [];
  const out: WatchActivityDTO[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name : '';
    if (!name) continue;
    const startedAt = typeof row.startedAt === 'string' && row.startedAt ? row.startedAt : null;
    const started = startedAt ? Date.parse(startedAt) : Number.NaN;
    out.push({
      name,
      type: typeof row.type === 'number' ? row.type : 0,
      details: typeof row.details === 'string' && row.details ? row.details : null,
      state: typeof row.state === 'string' && row.state ? row.state : null,
      startedAt,
      // Null rather than 0 when Discord did not report a start: the card omits
      // the counter entirely instead of claiming it began this instant.
      durationSec: Number.isFinite(started)
        ? Math.max(0, Math.floor((now.getTime() - started) / 1000))
        : null,
    });
  }
  return out;
}

/** Coerce the stored topics JSON into a string array. */
function asTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/** Build the CDN URL for a Discord avatar hash. */
function avatarUrl(discordId: string, hash: string | null): string | null {
  if (!hash) return null;
  // `a_`-prefixed hashes are animated; asking for .gif keeps them moving, and
  // Discord serves a static .png for everything else.
  const extension = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${extension}?size=128`;
}

/** The Prisma selection for a day row, shared so the mapper cannot drift. */
const DAY_SELECT = {
  dateKey: true,
  voiceSec: true,
  voiceSessions: true,
  longestVoiceSec: true,
  mutedSec: true,
  deafenedSec: true,
  streamingSec: true,
  videoSec: true,
  aloneSec: true,
  lateNightSec: true,
  messages: true,
  words: true,
  characters: true,
  attachments: true,
  links: true,
  mentions: true,
  emoji: true,
  stickers: true,
  replies: true,
  questions: true,
  lateNightMessages: true,
  reactionsGiven: true,
  reactionsReceived: true,
  gamingSec: true,
  gameSessions: true,
  topGame: true,
  topGameSec: true,
  topChannel: true,
  topChannelMessages: true,
  hourlyMessages: true,
  hourlyVoiceSec: true,
  firstSeenAt: true,
  lastSeenAt: true,
} as const;

type DayRow = {
  [K in keyof typeof DAY_SELECT]: K extends 'hourlyMessages' | 'hourlyVoiceSec'
    ? unknown
    : K extends 'topGame' | 'topChannel'
      ? string | null
      : K extends 'firstSeenAt' | 'lastSeenAt'
        ? Date | null
        : K extends 'dateKey'
          ? string
          : number;
};

type SummaryRow = {
  period: string;
  periodKey: string;
  headline: string;
  summary: string;
  verdict: string | null;
  mood: string | null;
  topics: unknown;
  generatedAt: Date;
};

function toSummaryDTO(row: SummaryRow): WatchSummaryDTO {
  return {
    period: row.period as SummaryPeriod,
    periodKey: row.periodKey,
    headline: row.headline,
    summary: row.summary,
    verdict: row.verdict,
    mood: row.mood,
    topics: asTopics(row.topics),
    generatedAt: row.generatedAt.toISOString(),
  };
}

function toDayDTO(row: DayRow, summary: WatchSummaryDTO | null): WatchDayDTO {
  return {
    dateKey: row.dateKey,
    voiceSec: row.voiceSec,
    voiceSessions: row.voiceSessions,
    longestVoiceSec: row.longestVoiceSec,
    mutedSec: row.mutedSec,
    deafenedSec: row.deafenedSec,
    streamingSec: row.streamingSec,
    videoSec: row.videoSec,
    aloneSec: row.aloneSec,
    lateNightSec: row.lateNightSec,
    messages: row.messages,
    words: row.words,
    characters: row.characters,
    attachments: row.attachments,
    links: row.links,
    mentions: row.mentions,
    emoji: row.emoji,
    stickers: row.stickers,
    replies: row.replies,
    questions: row.questions,
    lateNightMessages: row.lateNightMessages,
    reactionsGiven: row.reactionsGiven,
    reactionsReceived: row.reactionsReceived,
    gamingSec: row.gamingSec,
    gameSessions: row.gameSessions,
    topGame: row.topGame,
    topGameSec: row.topGameSec,
    topChannel: row.topChannel,
    topChannelMessages: row.topChannelMessages,
    hourlyMessages: asHourly(row.hourlyMessages),
    hourlyVoiceSec: asHourly(row.hourlyVoiceSec),
    firstSeenAt: row.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    summary,
  };
}

/** An all-zero day, so a gap in the calendar is a real cell rather than a hole. */
function emptyDay(dateKey: string): WatchDayDTO {
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
    firstSeenAt: null,
    lastSeenAt: null,
    summary: null,
  };
}

/** Today's `YYYY-MM-DD` in the tracking zone. */
export function trackingTodayKey(now: Date = new Date()): string {
  return zonedDateKey(now, TRACKING_TIME_ZONE);
}

/**
 * The live half of the state: status, the open voice session, the running game
 * and the last thing he said.
 *
 * Four independent lookups run concurrently — none depends on another, and the
 * profile card is the first thing painted, so the round trips are worth
 * overlapping.
 */
export async function getLive(now: Date = new Date()): Promise<WatchLiveDTO> {
  const [live, voice, lastMessage] = await Promise.all([
    prisma.discordWatchLive.findUnique({
      where: { discordId: SUBJECT_DISCORD_ID },
      select: {
        status: true,
        statusChangedAt: true,
        username: true,
        globalName: true,
        avatarHash: true,
        activities: true,
        customStatus: true,
        customEmoji: true,
      },
    }),
    prisma.discordWatchVoiceSession.findFirst({
      where: { discordId: SUBJECT_DISCORD_ID, leftAt: null },
      orderBy: { joinedAt: 'desc' },
      select: {
        channelName: true,
        joinedAt: true,
        selfMute: true,
        serverMute: true,
        selfDeaf: true,
        serverDeaf: true,
        streaming: true,
        video: true,
        peerCount: true,
      },
    }),
    prisma.discordWatchMessage.findFirst({
      where: { discordId: SUBJECT_DISCORD_ID },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, channelName: true },
    }),
  ]);

  // "Last seen" is the newest of everything we know about, so it stays truthful
  // whether the last trace of him was a message, a call or a game.
  const activities = asActivities(live?.activities, now);
  const candidates = [
    voice?.joinedAt ?? null,
    lastMessage?.sentAt ?? null,
    live?.statusChangedAt ?? null,
    ...activities.map((a) => (a.startedAt ? new Date(a.startedAt) : null)),
  ].filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  const lastSeenAt = candidates.length
    ? new Date(Math.max(...candidates.map((d) => d.getTime())))
    : null;

  return {
    status: asStatus(live?.status),
    statusForSec: live?.statusChangedAt ? secondsBetween(live.statusChangedAt, now) : 0,
    displayName: live?.globalName || live?.username || SUBJECT_FALLBACK_NAME,
    username: live?.username ?? null,
    avatarUrl: avatarUrl(SUBJECT_DISCORD_ID, live?.avatarHash ?? null),
    voice: voice
      ? {
          channelName: voice.channelName,
          joinedAt: voice.joinedAt.toISOString(),
          durationSec: secondsBetween(voice.joinedAt, now),
          // Server mute and self mute look identical from outside the call, and
          // the page is reporting what a person in it would see.
          muted: voice.selfMute || voice.serverMute,
          deafened: voice.selfDeaf || voice.serverDeaf,
          streaming: voice.streaming,
          video: voice.video,
          peers: voice.peerCount,
        }
      : null,
    activities,
    customStatus:
      live?.customStatus || live?.customEmoji
        ? { text: live.customStatus ?? null, emoji: live.customEmoji ?? null }
        : null,
    lastMessage: lastMessage
      ? {
          sentAt: lastMessage.sentAt.toISOString(),
          channelName: lastMessage.channelName,
          agoSec: secondsBetween(lastMessage.sentAt, now),
        }
      : null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
  };
}

/** Lifetime figures, folded from every day row the subject has. */
function buildTotals(days: WatchDayDTO[], todayKey: string): WatchTotalsDTO {
  const totals: WatchTotalsDTO = {
    days: days.length,
    activeDays: 0,
    voiceSec: 0,
    messages: 0,
    words: 0,
    gamingSec: 0,
    aloneSec: 0,
    lateNightSec: 0,
    lateNightMessages: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
    peakVoiceSec: 0,
    peakVoiceDateKey: null,
    currentStreak: 0,
    longestStreak: 0,
    topGame: null,
    topGameSec: 0,
    topChannel: null,
    firstTrackedDateKey: null,
  };

  const games = new Map<string, number>();
  const channels = new Map<string, number>();
  let running = 0;

  for (const day of days) {
    const active = day.voiceSec > 0 || day.messages > 0 || day.gamingSec > 0;
    if (active) {
      totals.activeDays += 1;
      totals.firstTrackedDateKey ??= day.dateKey;
    }
    totals.voiceSec += day.voiceSec;
    totals.messages += day.messages;
    totals.words += day.words;
    totals.gamingSec += day.gamingSec;
    totals.aloneSec += day.aloneSec;
    totals.lateNightSec += day.lateNightSec;
    totals.lateNightMessages += day.lateNightMessages;
    totals.reactionsGiven += day.reactionsGiven;
    totals.reactionsReceived += day.reactionsReceived;

    if (day.voiceSec > totals.peakVoiceSec) {
      totals.peakVoiceSec = day.voiceSec;
      totals.peakVoiceDateKey = day.dateKey;
    }
    if (day.topGame) games.set(day.topGame, (games.get(day.topGame) ?? 0) + day.topGameSec);
    if (day.topChannel) {
      channels.set(day.topChannel, (channels.get(day.topChannel) ?? 0) + day.topChannelMessages);
    }

    // Streaks are counted over the ordered day list, which is dense (gaps are
    // filled with zero rows), so a break in the run is a real quiet day.
    if (day.voiceSec > 0) {
      running += 1;
      totals.longestStreak = Math.max(totals.longestStreak, running);
    } else {
      running = 0;
    }
  }

  // The current streak is the run ending at today — or at yesterday, since a day
  // he has not started yet should not read as a broken streak.
  let cursor = days.length - 1;
  if (cursor >= 0 && days[cursor].dateKey === todayKey && days[cursor].voiceSec === 0) cursor -= 1;
  while (cursor >= 0 && days[cursor].voiceSec > 0) {
    totals.currentStreak += 1;
    cursor -= 1;
  }

  const topGame = [...games.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topGame) [totals.topGame, totals.topGameSec] = topGame;
  const topChannel = [...channels.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  if (topChannel) [totals.topChannel] = topChannel;

  return totals;
}

export interface WatchStateOptions {
  /** How many days of history to load. Clamped to `MAX_HISTORY_DAYS`. */
  days?: number;
  /** Injectable for tests and for the OG card's cache key. */
  now?: Date;
}

/**
 * The whole page in one object.
 *
 * The day list is DENSE: every date in the window is present, with zeros where
 * the tracker wrote nothing. A calendar that skips its empty days is not a
 * calendar, and the client would otherwise have to reconstruct the grid from a
 * sparse list and get the same answer.
 */
export async function getWatchState(options: WatchStateOptions = {}): Promise<WatchStateDTO> {
  const now = options.now ?? new Date();
  const span = Math.min(
    MAX_HISTORY_DAYS,
    Math.max(1, Math.floor(options.days ?? DEFAULT_HISTORY_DAYS)),
  );
  const todayKey = trackingTodayKey(now);
  const fromKey = shiftDateKey(todayKey, -(span - 1));

  const [rows, summaries, live] = await Promise.all([
    prisma.discordWatchDay.findMany({
      where: { discordId: SUBJECT_DISCORD_ID, dateKey: { gte: fromKey, lte: todayKey } },
      orderBy: { dateKey: 'asc' },
      select: DAY_SELECT,
    }),
    // All three periods in one query: they live in one table and the page shows
    // them side by side, so splitting this into three round trips would buy
    // nothing but latency.
    prisma.discordWatchSummary.findMany({
      where: {
        discordId: SUBJECT_DISCORD_ID,
        OR: [
          { period: 'day', periodKey: { gte: fromKey, lte: todayKey } },
          { period: 'week' },
          { period: 'month' },
        ],
      },
      orderBy: { periodKey: 'desc' },
      select: {
        period: true,
        periodKey: true,
        headline: true,
        summary: true,
        verdict: true,
        mood: true,
        topics: true,
        generatedAt: true,
      },
    }),
    getLive(now),
  ]);

  const daySummaries = new Map<string, WatchSummaryDTO>();
  const weeks: WatchSummaryDTO[] = [];
  const months: WatchSummaryDTO[] = [];
  for (const row of summaries) {
    const dto = toSummaryDTO(row);
    if (dto.period === 'day') daySummaries.set(dto.periodKey, dto);
    else if (dto.period === 'week') weeks.push(dto);
    else if (dto.period === 'month') months.push(dto);
  }

  const byKey = new Map(rows.map((row) => [row.dateKey, row]));
  const days: WatchDayDTO[] = [];
  for (let key = fromKey; key <= todayKey; key = shiftDateKey(key, 1)) {
    const row = byKey.get(key);
    const summary = daySummaries.get(key) ?? null;
    days.push(row ? toDayDTO(row, summary) : { ...emptyDay(key), summary });
  }

  return {
    timeZone: TRACKING_TIME_ZONE,
    todayKey,
    generatedAt: now.toISOString(),
    live,
    days,
    weeks,
    months,
    totals: buildTotals(days, todayKey),
    empty: rows.length === 0,
  };
}

/** One day plus the periods it belongs to — what a shared day link renders. */
export interface DaySnapshot {
  day: WatchDayDTO;
  week: WatchSummaryDTO | null;
  month: WatchSummaryDTO | null;
  /** Neighbouring keys for the day view's prev/next, null at the ends. */
  prevKey: string | null;
  nextKey: string | null;
  /** For the OG card's content-keyed cache. */
  updatedAt: string | null;
}

/**
 * A single day, for the permalink route and its unfurl card.
 *
 * Returns a zeroed day rather than null for a valid date with no rows: a link to
 * a quiet Tuesday should say "nothing recorded", not 404. An INVALID date key is
 * null, and the route turns that into a real 404.
 */
export async function getDaySnapshot(
  dateKey: string,
  now: Date = new Date(),
): Promise<DaySnapshot | null> {
  if (!isValidDateKey(dateKey)) return null;
  const todayKey = trackingTodayKey(now);
  if (dateKey > todayKey) return null; // the future has not happened yet

  const [row, summaryRows] = await Promise.all([
    // `updatedAt` rides along on the day row rather than being fetched
    // separately: it is only wanted for the OG card's content cache key, and a
    // second round trip for one timestamp is a round trip too many.
    prisma.discordWatchDay.findUnique({
      where: { discordId_dateKey: { discordId: SUBJECT_DISCORD_ID, dateKey } },
      select: { ...DAY_SELECT, updatedAt: true },
    }),
    prisma.discordWatchSummary.findMany({
      where: {
        discordId: SUBJECT_DISCORD_ID,
        OR: [
          { period: 'day', periodKey: dateKey },
          { period: 'week', periodKey: isoWeekKey(dateKey) },
          { period: 'month', periodKey: monthKeyOf(dateKey) },
        ],
      },
      select: {
        period: true,
        periodKey: true,
        headline: true,
        summary: true,
        verdict: true,
        mood: true,
        topics: true,
        generatedAt: true,
      },
    }),
  ]);

  const found = summaryRows.map(toSummaryDTO);
  const day = found.find((s) => s.period === 'day') ?? null;
  const prevKey = shiftDateKey(dateKey, -1);
  const nextKey = shiftDateKey(dateKey, 1);

  return {
    day: row ? toDayDTO(row, day) : { ...emptyDay(dateKey), summary: day },
    week: found.find((s) => s.period === 'week') ?? null,
    month: found.find((s) => s.period === 'month') ?? null,
    prevKey,
    nextKey: nextKey <= todayKey ? nextKey : null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}
