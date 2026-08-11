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
import {
  daysBetween,
  isoWeekBounds,
  isoWeekKey,
  isValidDateKey,
  isValidMonthKey,
  monthBounds,
  monthKeyOf,
  shiftDateKey,
  shiftMonthKey,
  shiftWeekKey,
} from './dates';
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
  onlineSec: true,
  idleSec: true,
  dndSec: true,
  desktopSec: true,
  mobileSec: true,
  webSec: true,
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
  jobMentions: true,
  typingStarts: true,
  typingAbandoned: true,
  typingAbandonedSec: true,
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
    onlineSec: row.onlineSec,
    idleSec: row.idleSec,
    dndSec: row.dndSec,
    desktopSec: row.desktopSec,
    mobileSec: row.mobileSec,
    webSec: row.webSec,
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
    jobMentions: row.jobMentions,
    typingStarts: row.typingStarts,
    typingAbandoned: row.typingAbandoned,
    typingAbandonedSec: row.typingAbandonedSec,
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
    jobMentions: 0,
    typingStarts: 0,
    typingAbandoned: 0,
    typingAbandonedSec: 0,
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
  const [live, voice, clients, lastMessage] = await Promise.all([
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
    // The open status run carries which clients he is signed in on. It is a
    // separate row from `discordWatchLive` because that one is a level and this
    // is an interval — and the card wants the interval's client set, which is
    // the same thing the day totals are built from.
    prisma.discordWatchStatusSession.findFirst({
      where: { discordId: SUBJECT_DISCORD_ID, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { desktop: true, mobile: true, web: true },
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
    clients: {
      desktop: clients?.desktop ?? false,
      mobile: clients?.mobile ?? false,
      web: clients?.web ?? false,
    },
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
    presenceSec: 0,
    onlineSec: 0,
    idleSec: 0,
    dndSec: 0,
    desktopSec: 0,
    mobileSec: 0,
    webSec: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
    jobMentions: 0,
    daysSinceJobMention: null,
    lastJobMentionDateKey: null,
    typingStarts: 0,
    typingAbandoned: 0,
    typingAbandonedSec: 0,
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
    totals.onlineSec += day.onlineSec;
    totals.idleSec += day.idleSec;
    totals.dndSec += day.dndSec;
    totals.presenceSec += day.onlineSec + day.idleSec + day.dndSec;
    totals.desktopSec += day.desktopSec;
    totals.mobileSec += day.mobileSec;
    totals.webSec += day.webSec;
    totals.lateNightMessages += day.lateNightMessages;
    totals.reactionsGiven += day.reactionsGiven;
    totals.reactionsReceived += day.reactionsReceived;
    totals.jobMentions += day.jobMentions;
    totals.typingStarts += day.typingStarts;
    totals.typingAbandoned += day.typingAbandoned;
    totals.typingAbandonedSec += day.typingAbandonedSec;
    // The LAST day it came up, not the first: the page counts days since.
    if (day.jobMentions > 0) totals.lastJobMentionDateKey = day.dateKey;

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

  // Days since, derived from the key rather than from a clock: `todayKey` is
  // already the tracking zone's today, and re-deriving it here would be a second
  // answer to a question the server has answered once.
  if (totals.lastJobMentionDateKey) {
    totals.daysSinceJobMention = daysBetween(totals.lastJobMentionDateKey, todayKey);
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

/** A week or a month, for its permalink and its unfurl card. */
export interface PeriodSnapshot {
  period: 'week' | 'month';
  periodKey: string;
  /** The span it covers, clamped so it never runs past today. */
  firstKey: string;
  lastKey: string;
  /** Dense: every day of the span, zeros where the tracker wrote nothing. */
  days: WatchDayDTO[];
  summary: WatchSummaryDTO | null;
  /** Folded from `days`, so a period page states the same figures the page does. */
  totals: WatchTotalsDTO;
  prevKey: string | null;
  nextKey: string | null;
  /** Newest row timestamp in the span — the OG card's content cache key. */
  updatedAt: string | null;
}

/**
 * A week or a month, assembled the same way a day is.
 *
 * Weeks and months already HAVE summaries — the summarizer writes all three
 * periods — so the only thing missing was an address for them. This gives them
 * one, with the same properties the day permalink has: dense days, a real
 * unfurl, prev/next, and figures folded from the same rows the dossier folds.
 *
 * `null` only for a key that cannot exist (`2026-W99`, `2026-13`) or one that
 * has not started yet. A period with nothing in it is NOT null — an empty week
 * is a fact about him, and the page says so.
 */
export async function getPeriodSnapshot(
  period: 'week' | 'month',
  periodKey: string,
  now: Date = new Date(),
): Promise<PeriodSnapshot | null> {
  const bounds =
    period === 'week'
      ? isoWeekBounds(periodKey)
      : isValidMonthKey(periodKey)
        ? monthBounds(periodKey)
        : null;
  if (!bounds) return null;

  const todayKey = trackingTodayKey(now);
  if (bounds.firstKey > todayKey) return null; // hasn't started
  // A period in progress is clamped to today: the calendar half of a month that
  // has not happened would otherwise render as a week of zeroes, which reads as
  // "he did nothing" rather than "it is the 11th".
  const lastKey = bounds.lastKey > todayKey ? todayKey : bounds.lastKey;

  const [rows, summaryRow] = await Promise.all([
    prisma.discordWatchDay.findMany({
      where: {
        discordId: SUBJECT_DISCORD_ID,
        dateKey: { gte: bounds.firstKey, lte: lastKey },
      },
      orderBy: { dateKey: 'asc' },
      select: { ...DAY_SELECT, updatedAt: true },
    }),
    prisma.discordWatchSummary.findFirst({
      where: { discordId: SUBJECT_DISCORD_ID, period, periodKey },
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

  const byKey = new Map(rows.map((row) => [row.dateKey, row]));
  const days: WatchDayDTO[] = [];
  for (let key = bounds.firstKey; key <= lastKey; key = shiftDateKey(key, 1)) {
    const row = byKey.get(key);
    days.push(row ? toDayDTO(row, null) : emptyDay(key));
  }

  const updatedAt = rows.reduce<Date | null>(
    (newest, row) => (!newest || row.updatedAt > newest ? row.updatedAt : newest),
    null,
  );

  // Prev is unconditional (the tracker's history simply runs out and that page
  // says so); next is suppressed once it would point at a period that has not
  // begun, which is the one case that genuinely has no page.
  const prevKey = period === 'week' ? shiftWeekKey(periodKey, -1) : shiftMonthKey(periodKey, -1);
  const nextKey = period === 'week' ? shiftWeekKey(periodKey, 1) : shiftMonthKey(periodKey, 1);
  const nextStarts =
    nextKey === null
      ? null
      : period === 'week'
        ? (isoWeekBounds(nextKey)?.firstKey ?? null)
        : monthBounds(nextKey).firstKey;

  return {
    period,
    periodKey,
    firstKey: bounds.firstKey,
    lastKey,
    days,
    summary: summaryRow ? toSummaryDTO(summaryRow) : null,
    totals: buildTotals(days, todayKey),
    prevKey,
    nextKey: nextKey && nextStarts && nextStarts <= todayKey ? nextKey : null,
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}
