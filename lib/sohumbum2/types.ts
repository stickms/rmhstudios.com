/**
 * The wire shapes `/sohumbum2` reads.
 *
 * Client-safe: no Prisma, no `node:*`. The page, the charts and the OG card all
 * type against this file, so a column added to `discord_watch_day` shows up as a
 * type error at every place that would have needed it rather than silently not
 * being drawn.
 *
 * Every duration is SECONDS and every instant is an ISO string. Both are stated
 * once here rather than inferred per field: a `number` called `voice` is the
 * kind of thing that ends up divided by 60 twice.
 */

/** Discord's own status vocabulary, which the page maps to Discord's colours. */
export type DiscordStatus = 'online' | 'idle' | 'dnd' | 'offline';

/** The three periods the summarizer writes for. */
export type SummaryPeriod = 'day' | 'week' | 'month';

/** A DeepSeek-written write-up of one period. */
export interface WatchSummaryDTO {
  period: SummaryPeriod;
  /** `YYYY-MM-DD` | `YYYY-Www` | `YYYY-MM`, matching `period`. */
  periodKey: string;
  headline: string;
  summary: string;
  verdict: string | null;
  /** One lowercase word, used for the calendar cell's tint. */
  mood: string | null;
  topics: string[];
  generatedAt: string;
}

/** One day's measured figures — the row a calendar cell is drawn from. */
export interface WatchDayDTO {
  dateKey: string;

  voiceSec: number;
  voiceSessions: number;
  longestVoiceSec: number;
  mutedSec: number;
  deafenedSec: number;
  streamingSec: number;
  videoSec: number;
  aloneSec: number;
  lateNightSec: number;

  messages: number;
  words: number;
  characters: number;
  attachments: number;
  links: number;
  mentions: number;
  emoji: number;
  stickers: number;
  replies: number;
  questions: number;

  lateNightMessages: number;
  reactionsGiven: number;
  reactionsReceived: number;

  gamingSec: number;
  gameSessions: number;
  topGame: string | null;
  topGameSec: number;

  topChannel: string | null;
  topChannelMessages: number;

  /** 24 entries, index 0 = local midnight. Null when the day predates them. */
  hourlyMessages: number[] | null;
  hourlyVoiceSec: number[] | null;

  firstSeenAt: string | null;
  lastSeenAt: string | null;

  summary: WatchSummaryDTO | null;
}

/** What he is doing at this exact moment — the profile card's contents. */
export interface WatchLiveDTO {
  status: DiscordStatus;
  /** How long the status has held, in seconds. */
  statusForSec: number;
  displayName: string;
  username: string | null;
  /** Fully-built CDN URL, or null for the default avatar. */
  avatarUrl: string | null;

  /** Present only while he is actually in a voice channel. */
  voice: {
    channelName: string | null;
    joinedAt: string;
    /** Live: measured to the moment the response was built. */
    durationSec: number;
    muted: boolean;
    deafened: boolean;
    streaming: boolean;
    video: boolean;
    /** Other humans in the channel right now. */
    peers: number;
  } | null;

  /** Present only while Discord reports him in an activity. */
  playing: {
    name: string;
    details: string | null;
    state: string | null;
    startedAt: string;
    durationSec: number;
  } | null;

  /** The last thing he said, if anything is still within retention. */
  lastMessage: {
    sentAt: string;
    channelName: string | null;
    /** Seconds since it was sent. */
    agoSec: number;
  } | null;

  /** Latest of any tracked activity, or null if he has never been seen. */
  lastSeenAt: string | null;
}

/** Lifetime figures across every tracked day. */
export interface WatchTotalsDTO {
  days: number;
  /** Days with any activity at all — the denominator for "he was around". */
  activeDays: number;
  voiceSec: number;
  messages: number;
  words: number;
  gamingSec: number;
  aloneSec: number;
  lateNightSec: number;
  lateNightMessages: number;
  reactionsGiven: number;
  reactionsReceived: number;
  /** The single biggest day, for the "personal best" line. */
  peakVoiceSec: number;
  peakVoiceDateKey: string | null;
  /** Consecutive days ending today with any voice time. */
  currentStreak: number;
  longestStreak: number;
  topGame: string | null;
  topGameSec: number;
  topChannel: string | null;
  firstTrackedDateKey: string | null;
}

/** Everything the page renders, in one response. */
export interface WatchStateDTO {
  /** IANA zone every dateKey and hour bucket is expressed in. */
  timeZone: string;
  /** `YYYY-MM-DD` for "now" in `timeZone` — the client must not derive this. */
  todayKey: string;
  /** When the response was built, so the client can age its live figures. */
  generatedAt: string;
  live: WatchLiveDTO;
  days: WatchDayDTO[];
  weeks: WatchSummaryDTO[];
  months: WatchSummaryDTO[];
  totals: WatchTotalsDTO;
  /**
   * True when the tracker has never written a row. The page shows its "nothing
   * recorded yet" state rather than an empty grid that looks like a bug.
   */
  empty: boolean;
}
