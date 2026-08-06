/**
 * Slice It — the numbers both halves of the game agree on.
 *
 * Imported by the browser bundle, the API routes and
 * `server/socket-server/handlers/slice-it.ts`, so it stays free of every
 * browser and Node import: the esbuild server bundle pulls this file in
 * verbatim (see `server/CLAUDE.md` §Gotchas 7–8).
 *
 * Anything a client and the server could disagree about — a hit window, a
 * modifier's score weight, how many people fit in a lobby — belongs here rather
 * than in the engine, because a server that scores a submission has to reach
 * the same verdict the client did.
 */

/* ─── Charts ─────────────────────────────────────────────────────────────── */

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SLICE_TYPES = [
  'STANDARD',
  'MOVING',
  'LONG',
  'SILENT',
  'SPEED',
  'BOMB',
  'SWITCH',
] as const;
export type SliceType = (typeof SLICE_TYPES)[number];

export const HIT_RESULTS = [
  'MARVELOUS',
  'PERFECT',
  'GREAT',
  'GOOD',
  'BAD',
  'MISS',
  'NONE',
] as const;
export type HitResult = (typeof HIT_RESULTS)[number];

/**
 * Timing windows in seconds, measured from the note's exact time.
 *
 * These are the 1.0x-speed, non-strict values. The engine scales them by the
 * playback rate (a 2x chart gives you the same *musical* leniency, which is
 * half the real-time leniency) and by {@link STRICT_TIMING_FACTOR}.
 */
export const HIT_WINDOWS: Record<Exclude<HitResult, 'MISS' | 'NONE'>, number> = {
  MARVELOUS: 0.02,
  PERFECT: 0.033333,
  GREAT: 0.108333,
  GOOD: 0.158333,
  BAD: 0.191666,
};

/** Strict Timing shrinks every window to this fraction of its normal size. */
export const STRICT_TIMING_FACTOR = 0.7;

/** Base points per judgement, before the combo and modifier multipliers. */
export const HIT_POINTS: Record<Exclude<HitResult, 'MISS' | 'NONE'>, number> = {
  MARVELOUS: 250,
  PERFECT: 200,
  GREAT: 125,
  GOOD: 75,
  BAD: 0,
};

/**
 * Accuracy weight per judgement, out of 100. Accuracy is
 * `sum(weight) / (notes * 100)`, so a full MARVELOUS run is exactly 1.0.
 */
export const ACCURACY_WEIGHTS: Record<Exclude<HitResult, 'NONE'>, number> = {
  MARVELOUS: 100,
  PERFECT: 100,
  GREAT: 75,
  GOOD: 50,
  BAD: 0,
  MISS: 0,
};

/** Bonus for releasing a LONG note inside its release window. */
export const HOLD_RELEASE_POINTS = 100;
/** Points accrued per frame while a LONG note is being held correctly. */
export const HOLD_TICK_POINTS = 1;
/** Score penalty for slicing a bomb. */
export const BOMB_PENALTY = 500;

/** Fraction of eligible notes converted to bombs when the Bombs modifier is on. */
export const BOMB_CONVERSION_RATE = 0.05;
/** Fraction of eligible notes converted to lane switches when Switching is on. */
export const SWITCH_CONVERSION_RATE = 0.15;

/** Per-lane input debounce, ms. One press must never resolve two notes. */
export const INPUT_COOLDOWN_MS = 50;

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;
/** Below this, a run is unranked — slowing a chart down is not an achievement. */
export const RANKED_MIN_SPEED = 1.0;
/** Multiplayer forbids slowing the chart: everyone races the same music. */
export const MULTIPLAYER_MIN_SPEED = 1.0;

/* ─── Score multipliers ──────────────────────────────────────────────────── */

/** Base multiplier per difficulty — more notes, more credit. */
export const DIFFICULTY_MULTIPLIERS: Record<Difficulty, number> = {
  easy: 0.7,
  normal: 1.0,
  hard: 1.3,
  expert: 1.5,
};

/**
 * What each optional modifier adds to the score multiplier.
 *
 * Additive rather than multiplicative on purpose: stacking six modifiers should
 * be worth meaningfully more than one, but not 6× more, or the leaderboard
 * becomes a modifier-stacking contest rather than a rhythm game.
 */
export const MODIFIER_BONUSES = {
  invisible: 0.2,
  bombs: 0.15,
  switching: 0.15,
  spin: 0.15,
  strictTiming: 0.25,
  oneTrack: 0.15,
} as const;

/** Speed above 1.0x adds this much multiplier per 1.0x of extra rate. */
export const SPEED_BONUS_PER_X = 0.5;

/* ─── Multiplayer lobbies ────────────────────────────────────────────────── */

export const MAX_LOBBY_PLAYERS = 8;
export const MIN_VERSUS_PLAYERS = 2;
export const LOBBY_CODE_LENGTH = 6;
/** Countdown the server runs once every client reports its chart is loaded. */
export const COUNTDOWN_SECONDS = 3;
/** Batched live-score broadcast cadence, ms. */
export const SCORE_TICK_MS = 500;
/**
 * How long the lobby waits for the slowest client to finish loading before
 * starting anyway.
 *
 * A rhythm chart is decoded and analysed in the browser; a cold cache on a weak
 * phone genuinely takes tens of seconds. But one client that never reports
 * `loaded` — a crashed tab, a decode failure, a closed laptop — used to hang
 * the whole lobby indefinitely, with no way out but everyone leaving. After
 * this window the match starts without the stragglers.
 */
export const LOAD_TIMEOUT_MS = 90_000;
/**
 * Extra wall-clock a match stays open past the song's own duration before the
 * server closes it and publishes results. Covers pauses, buffering and a client
 * whose `finish` was lost in a reconnect.
 */
export const FINISH_GRACE_MS = 60_000;
/**
 * How long a live match pauses for a player who dropped mid-song.
 *
 * Longer than the platform's 15s `PEER_GRACE_MS` on purpose. That window is
 * tuned for a lobby, where the cost of waiting is boredom; here the cost of
 * *not* waiting is someone losing a four-minute run to a wifi handover, with no
 * way back in. 30 seconds covers a tunnel, a cell handover and a screen lock,
 * and the client is retrying continuously throughout — a recovery usually lands
 * in the first two or three.
 */
export const MATCH_DISCONNECT_GRACE_MS = 30_000;
/**
 * A player who drops in the *lobby* is held for less: nothing is at stake, and
 * a seat held open blocks a rematch.
 */
export const LOBBY_DISCONNECT_GRACE_MS = 15_000;
/**
 * Beats of countdown after a pause ends, before audio actually restarts.
 *
 * Resuming a rhythm game the instant the socket recovers drops the player back
 * into a note they could not have seen coming. Everyone gets the same short
 * re-count, so the pause costs the room a few seconds and nobody a combo.
 */
export const RESUME_COUNTDOWN_SECONDS = 3;
/**
 * A match can only be paused this many times before the room stops honouring
 * pauses and plays on without the flapping player.
 *
 * Without a cap, one person on a bad connection can hold four other people in a
 * pause loop for the length of the song — each recovery restarts the window.
 */
export const MAX_MATCH_PAUSES = 3;

/** Idle lobbies are reaped after this long with no activity. */
export const LOBBY_IDLE_TIMEOUT_MS = 45 * 60_000;
/** Chat lines kept per lobby, and the cap on one line's length. */
export const CHAT_HISTORY = 50;
export const CHAT_MAX_LENGTH = 300;

/* ─── Uploads ────────────────────────────────────────────────────────────── */

export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_MAX_BYTES = 10 * 1024 * 1024;
/** Album covers are display-only; a 1024px square WebP is plenty. */
export const COVER_SIZE = 1024;
/** Site-wide ceiling on stored audio. */
export const TOTAL_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
/**
 * Per-account ceiling, so one uploader cannot consume the shared 10 GB.
 *
 * The old upload route only checked the global total, which meant the library
 * was first-come-first-served: a single account could fill it and every other
 * player's next upload failed with a message about a limit they had no part in
 * reaching.
 */
export const PER_USER_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
/** Tracks shorter than this have nothing to chart. */
export const MIN_SONG_DURATION_SEC = 5;
/** And a rhythm game does not want your three-hour DJ set. */
export const MAX_SONG_DURATION_SEC = 15 * 60;

/**
 * Ceiling on the Float32 PCM a decode is allowed to allocate.
 *
 * Duration alone is not the bound that matters. A decoder allocates
 * `duration x sampleRate x channels x 4` bytes, so a *ten second* 192 kHz
 * 8-channel WAV is 61 MB and passes any duration check you care to write, while
 * the legitimate worst case here — 15 minutes of 48 kHz stereo — is 345 MB.
 * 400 MB clears the legitimate case and stops the rest.
 *
 * Paired with {@link MAX_SONG_DURATION_SEC}, checked against
 * `probeAudioDuration` BEFORE the decode rather than against what the decoder
 * reports after it. See `lib/audio/probe.ts` for why that ordering is the whole
 * point.
 */
export const MAX_DECODED_PCM_BYTES = 400 * 1024 * 1024;

/**
 * Ceiling on the whole multipart upload body, checked against `Content-Length`
 * before `request.formData()` buffers it.
 *
 * Apache's `LimitRequestBody` is 1.5 GB site-wide, which is the right number for
 * the largest thing the platform accepts and much too large for this route — a
 * 1.5 GB POST here would be held in the web container's memory in full before
 * the 50 MB audio ceiling got a chance to look at it.
 */
export const UPLOAD_BODY_MAX_BYTES = AUDIO_MAX_BYTES + COVER_MAX_BYTES + 2 * 1024 * 1024;

export const SONG_TITLE_MAX = 200;
export const SONG_ARTIST_MAX = 200;
export const SONG_DESCRIPTION_MAX = 2000;
export const COMMENT_MAX_LENGTH = 2000;

/** Page size for the song library. */
export const SONGS_PAGE_SIZE = 30;
export const SONGS_PAGE_SIZE_MAX = 60;
export const LEADERBOARD_PAGE_SIZE = 25;
export const LEADERBOARD_PAGE_SIZE_MAX = 100;

export const SONG_SORTS = ['recent', 'popular', 'liked', 'title', 'duration'] as const;
export type SongSort = (typeof SONG_SORTS)[number];

/**
 * Storage key prefixes. Songs used to be written straight to `db/music` on the
 * web container's local disk, which meant a blue/green deploy could serve a
 * library whose files were on the other container.
 */
export const SONG_AUDIO_PREFIX = 'slice-it/audio/';
export const SONG_COVER_PREFIX = 'slice-it/covers/';

/* ─── Ranks ──────────────────────────────────────────────────────────────── */

/** Accuracy → letter grade, highest threshold first. */
export const GRADE_THRESHOLDS: readonly { grade: string; min: number }[] = [
  { grade: 'SS', min: 1 },
  { grade: 'S', min: 0.95 },
  { grade: 'A', min: 0.9 },
  { grade: 'B', min: 0.8 },
  { grade: 'C', min: 0.7 },
  { grade: 'D', min: 0.6 },
  { grade: 'F', min: 0 },
];
