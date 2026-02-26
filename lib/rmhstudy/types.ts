/**
 * RMH Study — Shared Type Definitions
 */

// ─── Timer Settings ─────────────────────────────────────────────

export interface TimerSettings {
  workDurationMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  sessionsBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  workDurationMs: 25 * 60 * 1000,
  shortBreakMs: 5 * 60 * 1000,
  longBreakMs: 15 * 60 * 1000,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartWork: false,
};

// ─── Timer State ────────────────────────────────────────────────

export type TimerPhase = 'idle' | 'working' | 'short_break' | 'long_break';

export interface TimerState {
  phase: TimerPhase;
  remainingMs: number;
  totalMs: number;
  sessionNumber: number;
  totalSessions: number;
  isPaused: boolean;
}

// ─── Room State ─────────────────────────────────────────────────

export type MemberStatus = 'studying' | 'break' | 'idle' | 'away';

export interface RoomMember {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isHost: boolean;
  isConnected: boolean;
  status: MemberStatus;
  tasksCompleted: number;
  tasksTotal: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  reactions: Record<string, string[]>;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export interface ClientRoomState {
  roomCode: string;
  hostUserId: string;
  settings: TimerSettings;
  members: RoomMember[];
  chat: ChatMessage[];
  timer: TimerState;
  myUserId: string;
}

// ─── Phase Complete Event ───────────────────────────────────────

export interface PhaseCompleteEvent {
  completedPhase: TimerPhase;
  nextPhase: TimerPhase;
  sessionNumber: number;
}

// ─── Errors ─────────────────────────────────────────────────────

export type RmhStudyErrorCode =
  | 'AUTH_REQUIRED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'TIMER_ACTIVE';
