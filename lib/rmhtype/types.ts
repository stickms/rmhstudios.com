/**
 * RMH Type — Shared Type Definitions
 */

// ─── Room Settings ───────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard';
export type PassageLength = 'short' | 'medium' | 'long';

export interface RoomSettings {
  difficulty: Difficulty;
  passageLength: PassageLength;
  rounds: number;
}

// ─── Room State ─────────────────────────────────────────────────

export type RoomStatus =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'TYPING'
  | 'ROUND_RESULTS'
  | 'FINAL_RESULTS';

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
}

export interface RoundResults {
  round: number;
  rankings: PlayerResult[];
  isLastRound: boolean;
}

export interface FinalResults {
  rankings: (PlayerResult & { totalScore: number })[];
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

export interface SoloResult {
  wpm: number;
  accuracy: number;
  timeMs: number;
  timedOut: boolean;
  scorePosted?: boolean;
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
