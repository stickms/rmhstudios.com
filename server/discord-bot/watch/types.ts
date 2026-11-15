/** Row shapes of the activity tracker's tables (instants are epoch ms). */

export interface VoiceSession {
  id: string;
  discordId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  joinedAt: number;
  leftAt:
    | number
    | null;
  endedReason: string;
  durationSec: number;
  mutedSec: number;
  deafenedSec: number;
  streamingSec: number;
  videoSec: number;
  aloneSec: number;
  selfMute: boolean;
  selfDeaf: boolean;
  streaming: boolean;
  video: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  peerCount: number;
  peakPeers: number;
  flagsChangedAt: number;
  peersChangedAt: number;
  /** The row's updatedAt as last read: the proof the tracker was watching it. */
  heartbeatAt: number;
}

export interface WatchMessage {
  discordId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  messageId: string;
  sentAt: number;
  content: string;
  charCount: number;
  wordCount: number;
  attachments: number;
  embeds: number;
  links: number;
  mentions: number;
  emoji: number;
  stickers: number;
  isReply: boolean;
  isQuestion: boolean;
  isLateNight: boolean;
  mentionsJob: boolean;
}

export interface PresenceSession {
  id: string;
  discordId: string;
  guildId: string;
  activityName: string;
  activityType: number;
  details: string;
  state: string;
  startedAt: number;
  endedAt:
    | number
    | null;
  durationSec: number;
  heartbeatAt: number;
}

export interface ClientSet {
  desktop: boolean;
  mobile: boolean;
  web: boolean;
}

export interface StatusSession {
  id: string;
  discordId: string;
  status: string;
  clients: ClientSet;
  startedAt: number;
  endedAt:
    | number
    | null;
  durationSec: number;
  heartbeatAt: number;
}

export interface TypingSession {
  id: string;
  discordId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  startedAt: number;
  lastTypingAt: number;
  settledAt:
    | number
    | null;
  durationSec: number;
  sent: boolean;
}

/** One row of discord_watch_day. */
export interface DayRollup {
  discordId: string;
  dateKey: string;
  timeZone: string;
  voiceSec: number;
  voiceSessions: number;
  longestVoiceSec: number;
  mutedSec: number;
  deafenedSec: number;
  streamingSec: number;
  videoSec: number;
  aloneSec: number;
  lateNightSec: number;
  onlineSec: number;
  idleSec: number;
  dndSec: number;
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
  jobMentions: number;
  typingStarts: number;
  typingAbandoned: number;
  typingAbandonedSec: number;
  gamingSec: number;
  gameSessions: number;
  topGame: string;
  topGameSec: number;
  topChannel: string;
  topChannelMessages: number;
  hourlyMessages: number[];
  hourlyVoiceSec: number[];
  hourlyGamingSec: number[];
  firstSeenAt:
    | number
    | null;
  lastSeenAt:
    | number
    | null;
}
