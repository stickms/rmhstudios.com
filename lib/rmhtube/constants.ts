/**
 * RmhTube — Shared Constants
 *
 * Tuning constants used by both client and server.
 * Server-specific configuration lives in server/rmhtube/config.ts.
 */

// ─── Room ────────────────────────────────────────────────────────

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_MAX_MEMBERS = 20;
export const ABSOLUTE_MAX_MEMBERS = 50;
export const MAX_QUEUE_SIZE = 100;
export const CHAT_MAX_LENGTH = 300;
export const CHAT_HISTORY_LENGTH = 200;

// ─── Sync ────────────────────────────────────────────────────────

export const SYNC_HEARTBEAT_INTERVAL_MS = 2_000;
export const SYNC_TOLERANCE_S = 2;
export const HOST_STATE_INTERVAL_MS = 1_000;

// ─── Timers ──────────────────────────────────────────────────────

export const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;       // 30 min
export const ROOM_EMPTY_TIMEOUT_MS = 5 * 60 * 1000;       // 5 min
export const DISCONNECT_GRACE_PERIOD_MS = 120_000;         // 2 min
export const ROOM_GC_INTERVAL_MS = 60_000;                 // 1 min

// ─── Reactions ───────────────────────────────────────────────────

export const AVAILABLE_REACTIONS = ['😂', '🔥', '❤️', '😮', '👏', '💀', '🎉', '😢'] as const;
export type ReactionEmoji = typeof AVAILABLE_REACTIONS[number];

// ─── Chat Reactions (Phase 1) ───────────────────────────────────

export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;

// ─── Typing Indicators (Phase 1) ────────────────────────────────

export const TYPING_DEBOUNCE_MS = 2_000;
export const TYPING_TIMEOUT_MS = 3_000;

// ─── Playback Speeds (Phase 2) ──────────────────────────────────

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

// ─── Auto-AFK (Phase 4) ────────────────────────────────────────

export const AUTO_AFK_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

// ─── Keyboard Shortcuts (Phase 2) ───────────────────────────────

export const SHORTCUTS = {
  TOGGLE_PLAY:       'Space',
  SEEK_BACK:         'ArrowLeft',
  SEEK_FORWARD:      'ArrowRight',
  VOLUME_UP:         'ArrowUp',
  VOLUME_DOWN:       'ArrowDown',
  TOGGLE_MUTE:       'KeyM',
  TOGGLE_FULLSCREEN: 'KeyF',
  TOGGLE_THEATER:    'KeyT',
  TOGGLE_CAPTIONS:   'KeyC',
  SKIP_NEXT:         'KeyN',
  TOGGLE_PIP:        'KeyP',
  SHOW_SHORTCUTS:    'Slash', // Shift+?
} as const;
