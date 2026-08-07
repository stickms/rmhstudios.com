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

/**
 * A9 — the mirror of {@link STRICT_TIMING_FACTOR}: Lenient Timing widens every
 * window instead of shrinking it. There was a way to make the game harder
 * (Strict Timing) and none to make it easier; this is that knob turned the
 * other way, sized as the same distance from 1.0 in the other direction
 * (0.7 shrinks by 0.3, 1.4 grows by the matching 0.4-ish headroom a widened
 * window needs to actually feel different rather than merely nominal).
 *
 * Unranked (see `timingScale` in `scoring.ts` and `MODIFIER_BONUSES`, which
 * deliberately has no entry for it) — not because a wider window is
 * illegitimate, but because a run played on it is not comparable to one
 * played on the stock windows.
 */
export const LENIENT_TIMING_FACTOR = 1.4;

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

/**
 * G5 — the window scale a hold's RELEASE is judged at, relative to the scale
 * a tap uses (`HIT_WINDOWS` × this).
 *
 * Wider than 1.0 on purpose: letting go is a less precise motor action than
 * pressing, and judging a release on the exact same windows as a press made
 * an LN chart feel arbitrary rather than hard. See `GameEngine.submitRelease`
 * and the `releaseTimingScale` it's read through.
 */
export const RELEASE_WINDOW_SCALE = 1.5;
/**
 * Legacy flat bonus for releasing a LONG note inside its release window.
 *
 * No longer read by live scoring — `submitRelease` (G5) now judges a release
 * through the same `judge()`/`pointsFor()` path as a tap, at
 * {@link RELEASE_WINDOW_SCALE}, so its payout scales with combo and judgement
 * quality like any other note rather than paying this flat amount. Kept
 * (rather than deleted) because `lib/slice-it/integrity.ts` still reads it as
 * one term of its server-side score ceiling — see
 * `docs/_handoff/note-vocab-requests.md` for why that ceiling is now looser
 * than it needs to be rather than wrong.
 */
export const HOLD_RELEASE_POINTS = 100;
/**
 * Points accrued per **second of audio** while a LONG note is held correctly.
 *
 * Was per rendered frame, which made a hold worth 2.4x as much on a 144 Hz
 * display as on a 60 Hz one and worth less on a device that stuttered. 60/s is
 * the old per-frame value at the refresh rate most players had, so holds are
 * worth what they always were and now the number does not depend on hardware.
 */
export const HOLD_TICK_POINTS_PER_SECOND = 60;
/**
 * Largest audio-time step a single hold accrual may bill for.
 *
 * A stall — a tab backgrounded, a long GC, a slow first frame — leaves a big gap
 * between updates, and billing it in full would hand out the points the player
 * did not stay present for. Clamping costs an honest player a few points after a
 * hitch and denies an attacker the "suspend, wait, resume" payout.
 */
export const HOLD_TICK_MAX_STEP_SEC = 0.25;
/** Score penalty for slicing a bomb. */
export const BOMB_PENALTY = 500;

/* ─── Health gauge ───────────────────────────────────────────────────────── */

/** Full gauge. Also what a run with the gauge switched off always reports. */
export const HEALTH_MAX = 100;

/**
 * Drain per judgement.
 *
 * GREAT is deliberately ~neutral: the gauge should punish *missing*, not punish
 * being imperfect. A player who hits every note and is merely a few milliseconds
 * loose can hold a gauge indefinitely; a player who drops six notes in a row
 * cannot. The asymmetry between the gains (≤ +1.2) and MISS (−6) is what makes
 * it a gauge rather than a slowly-filling bar.
 */
export const HEALTH_DELTA: Record<Exclude<HitResult, 'NONE'>, number> = {
  MARVELOUS: 1.2,
  PERFECT: 1.0,
  GREAT: 0.2,
  GOOD: -1.5,
  BAD: -3,
  MISS: -6,
};

/**
 * Health lost for slicing a bomb.
 *
 * Worse than a MISS, because a bomb is a note the chart told you not to hit —
 * the mistake is bigger than being absent for one.
 */
export const HEALTH_BOMB_DRAIN = 8;

/** Fraction of eligible notes converted to bombs when the Bombs modifier is on. */
export const BOMB_CONVERSION_RATE = 0.05;
/** Fraction of eligible notes converted to lane switches when Switching is on. */
export const SWITCH_CONVERSION_RATE = 0.15;

/** Per-lane input debounce, ms. One press must never resolve two notes. */
export const INPUT_COOLDOWN_MS = 50;

/**
 * Combo below which breaking it is not news.
 *
 * A miss produces the same text popup whether it broke a 300-chain or was the
 * first note of the song, and those are not the same event. Below 25 the player
 * is still learning the chart and a heavier reaction would be nagging; above it,
 * something was lost.
 */
export const COMBO_BREAK_THRESHOLD = 25;

/** How long the combo-break reaction lasts, ms. */
export const COMBO_BREAK_FEEDBACK_MS = 400;

/** Combo at which a break's reaction reaches full intensity. */
export const COMBO_BREAK_FULL_INTENSITY = 300;

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
  /**
   * M2 — S-Random. Priced with `switching` (0.15): both rewrite where your
   * hands go without touching the timing, and neither hides anything. It is
   * NOT priced with Strict Timing, which shrinks the window itself.
   */
  sRandom: 0.15,
  invisible: 0.2,
  bombs: 0.15,
  switching: 0.15,
  spin: 0.15,
  strictTiming: 0.25,
  oneTrack: 0.15,
  /**
   * The opt-in health gauge. Worth less than Strict Timing (0.25) because it
   * costs consistency rather than precision — and it is the one bonus that can
   * be lost mid-run: draining to zero forfeits it (see `calculateScoreMultiplier`).
   */
  healthGauge: 0.2,
  /**
   * M6 — perfect-or-die. `suddenDeath` sits below it in the same exclusion
   * group (`applyExclusions` in `modifiers.ts` drops `suddenDeath` when both
   * are set, so this is never stacked on top of a second "one mistake ends
   * it" bonus) but currently has no bonus of its own to be worth more than —
   * see `docs/_handoff/note-vocab-requests.md`. Sized well above every other
   * entry here because the run this pays for is qualitatively harder than
   * "don't miss": every GREAT or worse, not just a MISS, ends it.
   */
  perfectionist: 0.75,
} as const;

/**
 * A9 — deliberately absent: Lenient Timing has no entry here. It makes the
 * game easier, and an unranked modifier that also paid a bonus (or, worse,
 * a penalty) would either buy score with difficulty removed or punish a
 * player for needing the accommodation. `calculateScoreMultiplier` never
 * reads `modifiers.lenientTiming`, so the run's multiplier is exactly what it
 * would have been without the toggle.
 */

/** Speed above 1.0x adds this much multiplier per 1.0x of extra rate. */
export const SPEED_BONUS_PER_X = 0.5;

/* ─── Visual-only settings (G9, M3, V10) ─────────────────────────────────────
 *
 * These never reach the server and never touch scoring — they only change
 * what the renderer draws — but the enum/range they clamp to is the same for
 * every consumer, which is the same reason every other clamp in this file
 * lives here rather than beside its one caller.
 */

/**
 * Scroll speed as a player setting (G9).
 *
 * `constant` — notes travel a fixed number of screen-heights per second,
 * independent of the chart's tempo (osu!mania scroll speed, StepMania C-mod).
 * `bpm` — speed scales with the chart's BPM, so beat spacing on screen stays
 * visually consistent across songs of different tempo (StepMania X-mod, IIDX).
 */
export const SCROLL_MODES = ['constant', 'bpm'] as const;
export type ScrollMode = (typeof SCROLL_MODES)[number];
export const MIN_SCROLL_SPEED = 0.5;
export const MAX_SCROLL_SPEED = 3.0;
/**
 * Seconds of lead time a note gets at `scrollSpeed: 1.0` — today's fixed
 * value, preserved exactly so the new setting's default reproduces the old,
 * unconfigurable behaviour bit-for-bit.
 */
export const BASE_APPROACH_SEC = 3.0;

/**
 * The visibility family (M3): what used to be one `invisible` toggle.
 *
 * `fadeOut` is the original behaviour and stays the default and the alias
 * target for a persisted `invisible: true` from before this split existed —
 * see the `migrate` in `store.ts`.
 */
export const VISIBILITY_MODES = ['fadeOut', 'fadeIn', 'flashlight', 'laneCover'] as const;
export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

/** Fraction of the approach a lane cover (V10) may hide, 0 = no cover. */
export const MIN_LANE_COVER = 0;
/** Never the full window — a cover that hides everything is not a tool. */
export const MAX_LANE_COVER = 0.85;

/* ─── Multiplayer lobbies ────────────────────────────────────────────────── */

export const MAX_LOBBY_PLAYERS = 8;
export const MIN_VERSUS_PLAYERS = 2;
export const LOBBY_CODE_LENGTH = 6;
/** Countdown the server runs once every client reports its chart is loaded. */
export const COUNTDOWN_SECONDS = 3;
/**
 * Batched live-score broadcast cadence, ms.
 *
 * Halved from 500. With the client publishing every 200 ms, the opponent board
 * used to be up to 900 ms behind the run it was describing — long enough that in
 * a close match it was telling you about a lead you no longer had. The extra
 * traffic is paid for by the ticker skipping frames in which nothing changed,
 * which is most of them once players start finishing.
 */
export const SCORE_TICK_MS = 250;
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

/**
 * `difficulty` sorts by `Song.chartRating` — the C3 computed rating of a song's
 * hardest public chart, denormalised onto the song row. The column and its
 * `(isPublic, chartRating DESC)` index shipped with C3 and had no reader:
 * `docs/_handoff/rating-requests.md` §1 asked for exactly this value. NULLS
 * LAST is the whole subtlety and lives with the ORDER BY in
 * `app/routes/api/slice-it/songs.ts` — a song with no rated chart is not a
 * trivially easy song, and Postgres sorts NULLs FIRST on DESC by default, which
 * would put every unrated song at the top of "hardest first".
 */
export const SONG_SORTS = ['recent', 'popular', 'liked', 'title', 'duration', 'difficulty'] as const;
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

/* ─── Shared presentation ────────────────────────────────────────────────── */

/**
 * Colour per judgement.
 *
 * Here rather than in a component because four separate surfaces have to agree
 * on it — the engine's floating feedback text, the canvas hit-error bar, the
 * HUD and the results-screen histogram — and this is the only module all four
 * can import without pulling the engine (and therefore Web Audio) in with it.
 * They are deliberately fixed rather than `--slice-*` tokens: a judgement colour
 * is a piece of *vocabulary* the player learns, and it has to mean the same
 * thing in both themes.
 */
export const JUDGEMENT_COLORS: Record<HitResult, string> = {
  MARVELOUS: '#0891b2',
  PERFECT: '#B4954A',
  GREAT: '#15803d',
  GOOD: '#1d4ed8',
  BAD: '#7e22ce',
  MISS: '#64748b',
  NONE: '#64748b',
};

/** The judgements a results-screen histogram lists, best to worst. */
export const JUDGEMENT_ORDER = [
  'MARVELOUS',
  'PERFECT',
  'GREAT',
  'GOOD',
  'BAD',
  'MISS',
] as const satisfies readonly Exclude<HitResult, 'NONE'>[];

/**
 * Note colour by beat subdivision — StepMania's palette, which two decades of
 * players in this genre already read fluently: red on the beat, blue on the
 * eighth, purple on a triplet, yellow on the sixteenth. Keyed by `Slice.quant`.
 */
export const QUANT_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#3b82f6',
  3: '#a855f7',
  4: '#eab308',
};

/* ─── Practice guides (P4) ───────────────────────────────────────────────── */

/**
 * How far ahead of the playhead guide sounds are handed to the audio clock.
 *
 * Long enough that a stuttering frame loop cannot miss a beat, short enough
 * that a seek or a loop rewind does not leave a second of already-scheduled
 * ticks playing over the new position.
 */
export const TICK_LOOKAHEAD_SEC = 0.35;

/** Metronome: on the beat. Assist tick: on every note. Pitched apart so a
 *  player running both can tell which is which. */
export const TICK_FREQ_BEAT = 1200;
export const TICK_FREQ_NOTE = 1800;

/** Guides sit under the music — they are a reference, not a part. */
export const TICK_VOLUME_SCALE = 0.35;

/* ─── Playfield layout (G11) ─────────────────────────────────────────────── */

/**
 * Where the judgement line sits, as a fraction of the scroll axis measured
 * FROM THE FAR EDGE — i.e. how much runway a note gets before it must be hit.
 *
 * The shipped geometry is 0.85 down a portrait canvas and 0.15 across a
 * landscape one; both are "15% of the axis left after the line", so one number
 * expresses both and `MIN`/`MAX` keep it somewhere a player can actually read.
 *
 * Purely cosmetic: `approachSeconds` (G9) decides how long a note is visible,
 * and moving the line changes where that time is spent on screen, not how much
 * of it there is.
 */
export const DEFAULT_LINE_POSITION = 0.15;
export const MIN_LINE_POSITION = 0.08;
export const MAX_LINE_POSITION = 0.4;

/** Clamp a persisted judgement-line position back into the readable range. */
export function clampLinePosition(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LINE_POSITION;
  return Math.max(MIN_LINE_POSITION, Math.min(MAX_LINE_POSITION, value));
}
