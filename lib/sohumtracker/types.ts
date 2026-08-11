/**
 * The wire shapes `/sohumtracker` reads.
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

  /**
   * Time at each status. Mutually exclusive — a status is one value — so these
   * sum to his presence for the day.
   */
  onlineSec: number;
  idleSec: number;
  dndSec: number;

  /**
   * Time signed in on each client. These OVERLAP: desktop and mobile are
   * routinely both true, so the three can sum to more than online+idle+dnd.
   * Read them as "how much of the day was he reachable on a phone", not as a
   * partition of it.
   */
  desktopSec: number;
  mobileSec: number;
  webSec: number;

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

  /**
   * Messages that read as being about looking for work — an application, an
   * interview, a recruiter, a CV. Flagged on the message when it arrives, so
   * the count survives the text being deleted at 45 days.
   */
  jobMentions: number;

  /**
   * Compose sessions: times he started typing, and the ones no message came out
   * of. `typingAbandonedSec` is how long he spent on those.
   */
  typingStarts: number;
  typingAbandoned: number;
  typingAbandonedSec: number;

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

/**
 * One thing Discord reports him as doing right now.
 *
 * Discord stacks these: a game, Spotify and a stream can all be live at once,
 * and its own client shows every one. So this is a LIST on the card rather than
 * a single "playing" slot, which could only ever describe one of them.
 */
export interface WatchActivityDTO {
  name: string;
  /** 0 playing · 1 streaming · 2 listening · 3 watching · 5 competing. */
  type: number;
  details: string | null;
  state: string | null;
  startedAt: string | null;
  /** Seconds since `startedAt`, or null when Discord did not report a start. */
  durationSec: number | null;
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

  /**
   * Which clients he is signed in on right now. Discord shows a phone badge for
   * a mobile-only session and this is the same signal; more than one can be
   * true at once.
   */
  clients: { desktop: boolean; mobile: boolean; web: boolean };

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

  /**
   * Everything Discord reports him doing, in the order it reported them with a
   * game first. Empty when nothing is running.
   */
  activities: WatchActivityDTO[];

  /**
   * The custom status — Discord's activity type 4, which is a line of text
   * somebody typed about themselves rather than time spent doing anything.
   * Rendered as the bubble beside the name, and deliberately not in
   * `activities`: it is not an activity and never accrues time.
   */
  customStatus: { text: string | null; emoji: string | null } | null;

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

  /**
   * Time at each status. Mutually exclusive — a status is one value — so these
   * sum to his presence for the day.
   */
  /** Total time signed in to Discord — online + idle + dnd. */
  presenceSec: number;
  onlineSec: number;
  idleSec: number;
  dndSec: number;

  /**
   * Time signed in on each client. These OVERLAP: desktop and mobile are
   * routinely both true, so the three can sum to more than online+idle+dnd.
   * Read them as "how much of the day was he reachable on a phone", not as a
   * partition of it.
   */
  desktopSec: number;
  mobileSec: number;
  webSec: number;
  lateNightMessages: number;
  reactionsGiven: number;
  reactionsReceived: number;

  jobMentions: number;
  /**
   * Days since the last one — the figure this whole page is really about.
   * Null when he has not mentioned it once in the window, which the page states
   * differently ("not once in 120 days") because "120" and "at least 120" are
   * not the same claim.
   */
  daysSinceJobMention: number | null;
  /** The dateKey it last came up on, for the link. */
  lastJobMentionDateKey: string | null;

  typingStarts: number;
  typingAbandoned: number;
  typingAbandonedSec: number;
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

/**
 * What the SSE stream pushes on every change — the parts of the state that
 * actually move minute to minute.
 *
 * Deliberately NOT the whole `WatchStateDTO`: that is ~100 KB of mostly-frozen
 * history, and re-sending it every few seconds to every viewer would cost more
 * than the polling this replaces. The client splices this into the state it was
 * server-rendered with; a full refetch is what the refresh button is for.
 */
export interface WatchTickDTO {
  generatedAt: string;
  todayKey: string;
  live: WatchLiveDTO;
  /** Today's row, or null before the tracker has written one. */
  today: WatchDayDTO | null;
  totals: WatchTotalsDTO;
  weeks: WatchSummaryDTO[];
  months: WatchSummaryDTO[];
}
