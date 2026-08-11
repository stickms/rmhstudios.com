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

/**
 * How often the leader reports its real player state.
 *
 * 2 s, not 1 s: the server's rate limit for `sync:host_state` is 60/min, and a
 * 1 s interval sits exactly on it — so every extra report (there is one on each
 * tab-return, and one on every playback edge) pushed the leader over, and the
 * limiter's reply was to drop the room's only source of truth and send back an
 * error toast. The server projects the timeline between reports anyway, so the
 * extra report bought nothing it was not already computing.
 */
export const HOST_STATE_INTERVAL_MS = 2_000;

/** How often a client samples its player and applies at most one correction. */
export const SYNC_TICK_INTERVAL_MS = 250;

/**
 * A seek is not measured again until it has settled. A media element reports
 * the old position for a moment after `currentTime` is assigned, and on an
 * embedded player it can re-buffer for a second — measuring inside that window
 * reads a drift the correction has already fixed and seeks again on top of it.
 */
export const SEEK_COOLDOWN_MS = 1_500;

/**
 * A position change beyond one tick's worth of playback plus this much is a
 * seek, not playback. Sized for timer jitter under a busy main thread.
 */
export const POSITION_JUMP_TOLERANCE_S = 0.75;

// Three-tier drift correction:
//   |drift| <= SOFT          → in sync (hold the room's rate)
//   SOFT < |drift| <= HARD   → close the gap with a rate nudge where possible
//   |drift| > HARD           → seek
export const SYNC_SOFT_TOLERANCE_S = 0.5;
export const SYNC_HARD_TOLERANCE_S = 2;
export const SYNC_NUDGE_RATE = 0.05; // ±5% playback-rate nudge while closing a gap

/** Consecutive stalled ticks before a viewer tells the room it is buffering. */
export const STALL_REPORT_TICKS = 8; // ≈2 s at SYNC_TICK_INTERVAL_MS

/**
 * Buffer a stalled viewer must build before it tells the room it has recovered.
 *
 * Not "is the element moving again": while the room is paused waiting for you,
 * your player is paused too, so it is not stalled by any definition that
 * watches the playhead — you would report recovery instantly, the room would
 * resume, and you would stall again. Buffered-ahead seconds is the one measure
 * that still means something while paused.
 */
export const MIN_BUFFER_AHEAD_S = 3;

/**
 * How long the room waits for a buffering viewer before giving up and playing
 * on without them. Long enough to cover an ordinary rebuffer, short enough that
 * one bad connection cannot hold a watch party hostage.
 */
export const PEER_WAIT_MAX_MS = 20_000;

/**
 * After a wait times out, the room refuses to start another for this long. A
 * connection that cannot sustain the stream would otherwise re-pause everyone
 * a few seconds after every resume, forever.
 */
export const PEER_WAIT_COOLDOWN_MS = 60_000;

// Clock synchronization (NTP-lite): map client time ↔ server time.
export const CLOCK_SYNC_SAMPLES = 5;
export const CLOCK_SYNC_INTERVAL_MS = 30_000;

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
