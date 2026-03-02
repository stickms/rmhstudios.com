export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_MAX_MEMBERS = 10;
export const ABSOLUTE_MAX_MEMBERS = 25;
export const MAX_QUEUE_SIZE = 50;
export const CHAT_MAX_LENGTH = 300;
export const CHAT_HISTORY_LENGTH = 100;

// ─── Sync ────────────────────────────────────────────────────────

export const SYNC_HEARTBEAT_INTERVAL_MS = 5_000;
export const SYNC_DRIFT_TOLERANCE_MS = 2_000;

// ─── Timers ──────────────────────────────────────────────────────

export const ROOM_EMPTY_TIMEOUT_MS = 5 * 60 * 1000;
export const DISCONNECT_GRACE_PERIOD_MS = 30_000;
export const ROOM_GC_INTERVAL_MS = 60_000;
