/**
 * RMH Type — Shared Type Definitions
 */
import type { RunReason } from '@/lib/rmhtype/run-check';

// ─── Room Settings ───────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard';
export type PassageLength = 'short' | 'medium' | 'long';

export interface RoomSettings {
  difficulty: Difficulty;
  passageLength: PassageLength;
  rounds: number;
}

// ─── Room State ─────────────────────────────────────────────────

export type RoomStatus = 'WAITING' | 'COUNTDOWN' | 'TYPING' | 'ROUND_RESULTS' | 'FINAL_RESULTS';

export interface RoomPlayer {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
}

export interface PlayerProgress {
  userId: string;
  userName: string;
  charsTyped: number;
  totalChars: number;
  wpm: number;
  finished: boolean;
}

export interface PlayerResult {
  userId: string;
  userName: string;
  wpm: number;
  accuracy: number;
  timeMs: number;
  score: number;
  rank: number;
  /** The finish failed the server's check (`lib/rmhtype/run-check.ts`): "Did not finish", not ranked. */
  didNotFinish?: boolean;
  reason?: RunReason;
}

export interface RoundResults {
  round: number;
  rankings: PlayerResult[];
  isLastRound: boolean;
}

export interface FinalResults {
  rankings: (PlayerResult & {
    totalScore: number;
  })[];
}

export interface BannedUser {
  userId: string;
  userName: string;
  bannedAt: number;
  bannedBy: string;
  reason: string | null;
}

export interface PublicRoomInfo {
  roomId: string;
  hostUserName: string;
  playerCount: number;
  maxPlayers: number;
  difficulty: Difficulty;
  passageLength: PassageLength;
  rounds: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  reactions: Record<string, string[]>;
}

export interface ClientRoomState {
  roomCode: string;
  hostUserId: string;
  isPublic: boolean;
  status: RoomStatus;
  settings: RoomSettings;
  players: RoomPlayer[];
  bannedUsers: BannedUser[];
  chat: ChatMessage[];
  myUserId: string;
  // Game state
  currentRound: number;
  totalRounds: number;
  passage: string | null;
  passageId: string | null;
  progress: PlayerProgress[];
  roundResults: RoundResults | null;
  finalResults: FinalResults | null;
  countdownSeconds: number | null;
}

// ─── Solo Mode ──────────────────────────────────────────────────

/** A challenge race (s11-12) the solo run is: the challenger's snapshot is the ghost, drawn as their caret. */
export interface SoloChallenge {
  id: string;
  challengerName: string;
  ghost: { passageId: string; wpm: number; timeMs: number; samples: number[] };
}

/** How a challenge race was settled, as the server tells the opponent when their run finishes. */
export interface SoloChallengeResult {
  id: string;
  outcome: 'challenger' | 'opponent' | 'draw';
  /** `false` is "Did not finish". */
  finished: boolean;
  challengerWpm: number;
  opponentWpm: number | null;
}

/** A challenge race the server would not start: its English sentence and the taxonomy code beside it. */
export interface SoloChallengeRefusal {
  error: string;
  code?: string;
}

export interface SoloResult {
  wpm: number;
  accuracy: number;
  timeMs: number;
  timedOut: boolean;
  /** Whether the run was ranked: it passed the server's check and met the accuracy bar. */
  ranked?: boolean;
  /** Why the server's check did not rank the run; absent when it passed (or for practice and a timed-out run). */
  reason?: RunReason;
  /** Kept for older clients: always equal to `ranked`. */
  scorePosted?: boolean;
  /**
   * The run used an AI passage written for a topic the player chose, so it is
   * practice: uncalibrated and self-selected, it is never ranked against runs
   * on the curated passages. `scorePosted` is always false alongside it.
   */
  practice?: boolean;
}

// ─── Errors ─────────────────────────────────────────────────────

export type RmhTypeErrorCode =
  | 'AUTH_REQUIRED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'GAME_IN_PROGRESS'
  | 'BANNED';
