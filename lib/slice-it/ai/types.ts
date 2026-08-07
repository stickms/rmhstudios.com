/**
 * Slice It AI — the output contracts.
 *
 * One file, client-safe, holding the zod schema for every AI feature's result.
 * The schemas are the parse step in `runTaskJson` **and** the source of the
 * types the UI renders, which is what stops the two drifting: a field the model
 * is asked for but the panel never reads, or a panel reading a field the schema
 * strips, both become type errors here rather than an empty div in production.
 *
 * Two rules every schema in this file follows:
 *
 *  1. **Clamp, do not trust.** Every string is truncated to the length the UI
 *     was designed for. A prompt asking for "max 80 chars" is a request, not a
 *     constraint — the model complies most of the time, and the one time it
 *     does not is a layout break on a results screen.
 *  2. **Degrade per item, fail per result.** A malformed tip costs that tip
 *     (filtered by the caller); a result with no usable content at all fails to
 *     parse and the caller renders its non-AI path. This is the same split
 *     `lib/ai/coach.server.ts` uses and for the same reason: partial advice is
 *     useful, and a panel of empty rows is not.
 */

import { z } from 'zod';
import { DIFFICULTIES, SONG_SORTS } from '../constants';

/* -------------------------------------------------------------------------- */
/* Shared field helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A model-supplied string, trimmed and hard-truncated.
 *
 * `preprocess` rather than `.max()` on purpose: a `.max()` would *reject* an
 * over-long field and take the whole result with it, when the sentence is
 * almost always fine and merely two words past the budget.
 */
const text = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim().slice(0, max) : ''), z.string().max(max));

/** A required string: the result is meaningless without it. */
const requiredText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, max) : ''),
    z.string().min(1).max(max),
  );

/** A number the model supplied, coerced and clamped into a real range. */
const bounded = (min: number, max: number) =>
  z.preprocess((v) => {
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, n));
  }, z.number().min(min).max(max));

/* -------------------------------------------------------------------------- */
/* 1–2. Post-run coaching and practice plan                                   */
/* -------------------------------------------------------------------------- */

export const MAX_COACH_TIPS = 3;
export const MAX_PRACTICE_DRILLS = 3;

/**
 * One drill: a span of the song to loop, and why.
 *
 * `startSec`/`endSec` are the load-bearing fields — they are what the practice
 * player seeks to, so a drill without a valid span is not a drill. The bounds
 * are generous (0–1000s covers the 15-minute upload ceiling) because the real
 * check is against the song's own duration, which the caller knows and this
 * schema does not.
 */
export const practiceDrillSchema = z.object({
  startSec: bounded(0, 1000),
  endSec: bounded(0, 1000),
  label: requiredText(60),
  why: text(160),
  /** Practice speed. Below 1.0 is unranked, which is correct for a drill. */
  suggestedSpeed: bounded(0.5, 1.5).default(1),
});

export const coachAdviceSchema = z.object({
  headline: requiredText(80),
  tips: z
    .array(z.object({ tip: text(160), evidence: text(120) }))
    .max(MAX_COACH_TIPS)
    .default([]),
  drills: z.array(practiceDrillSchema).max(MAX_PRACTICE_DRILLS).default([]),
});

export type PracticeDrill = z.infer<typeof practiceDrillSchema>;
export type SliceCoachAdvice = z.infer<typeof coachAdviceSchema>;

/* -------------------------------------------------------------------------- */
/* 3. Calibration advisor                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The verdict is an enum rather than prose because the UI branches on it: only
 * `offset` renders an "apply this offset" button, and a model that hedged in a
 * sentence would leave the panel unable to decide whether to show one.
 */
export const calibrationVerdicts = ['offset', 'practice', 'inconclusive'] as const;

export const calibrationAdviceSchema = z.object({
  verdict: z.enum(calibrationVerdicts),
  /** Absolute offset to apply, ms. Only meaningful when verdict is `offset`. */
  suggestedOffsetMs: bounded(-500, 500).default(0),
  explanation: requiredText(320),
});

export type CalibrationAdvice = z.infer<typeof calibrationAdviceSchema>;

/* -------------------------------------------------------------------------- */
/* 4. Chart brief                                                             */
/* -------------------------------------------------------------------------- */

export const MAX_BRIEF_POINTS = 4;

export const chartBriefSchema = z.object({
  /** One sentence a player reads before pressing start. */
  summary: requiredText(200),
  /** Specific things to watch for, each tied to a timestamp where possible. */
  watchFor: z
    .array(z.object({ atSec: bounded(0, 1000).optional(), note: text(140) }))
    .max(MAX_BRIEF_POINTS)
    .default([]),
  /** The model's read on where this sits, in the game's own vocabulary. */
  difficultyNote: text(140),
});

export type ChartBrief = z.infer<typeof chartBriefSchema>;

/* -------------------------------------------------------------------------- */
/* 5. Modifier loadout advisor                                                */
/* -------------------------------------------------------------------------- */

/**
 * A recommended modifier set.
 *
 * Only the optional modifiers are here. `speed` and `difficulty` are separate
 * because they are not on/off and the UI applies them differently, and
 * `suddenDeath` is excluded deliberately — recommending a modifier that ends
 * the run on one miss is never good coaching for someone asking what to try.
 */
export const loadoutSchema = z.object({
  difficulty: z.enum(DIFFICULTIES),
  speed: bounded(1, 2).default(1),
  invisible: z.boolean().default(false),
  bombs: z.boolean().default(false),
  switching: z.boolean().default(false),
  spin: z.boolean().default(false),
  strictTiming: z.boolean().default(false),
  oneTrack: z.boolean().default(false),
  reason: requiredText(220),
});

export type LoadoutAdvice = z.infer<typeof loadoutSchema>;

/* -------------------------------------------------------------------------- */
/* 6. Natural-language library search                                         */
/* -------------------------------------------------------------------------- */

/**
 * A search request, as a query object the library route already understands.
 *
 * Every field is optional: the model omits what the phrasing did not imply, and
 * the caller applies only what came back. That is what keeps "fast songs" from
 * silently also filtering by a duration nobody asked about.
 */
export const searchQuerySchema = z.object({
  /** Free-text terms, matched against title/artist/album. */
  terms: z.array(text(40)).max(6).default([]),
  sort: z.enum(SONG_SORTS).optional(),
  minBpm: bounded(20, 400).optional(),
  maxBpm: bounded(20, 400).optional(),
  minDurationSec: bounded(0, 900).optional(),
  maxDurationSec: bounded(0, 900).optional(),
  /** Restrict to songs the caller has never played. */
  unplayedOnly: z.boolean().optional(),
  /** Restrict to songs the caller has uploaded. */
  mineOnly: z.boolean().optional(),
  /** What the model understood the request to mean, shown back to the player. */
  interpretation: text(140),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/* -------------------------------------------------------------------------- */
/* 7. Setlist builder                                                         */
/* -------------------------------------------------------------------------- */

export const MAX_SETLIST_ITEMS = 12;

export const setlistSchema = z.object({
  title: requiredText(70),
  items: z
    .array(
      z.object({
        /** Must be an id from the candidate list; the caller re-checks. */
        songId: requiredText(40),
        difficulty: z.enum(DIFFICULTIES).optional(),
        why: text(140),
      }),
    )
    .max(MAX_SETLIST_ITEMS)
    .default([]),
});

export type Setlist = z.infer<typeof setlistSchema>;

/** A setlist item resolved against the library, ready to render. */
export interface ResolvedSetlistItem {
  songId: string;
  title: string;
  artist: string;
  durationSec: number;
  difficulty?: (typeof DIFFICULTIES)[number];
  why: string;
}

/* -------------------------------------------------------------------------- */
/* 8–9. Upload metadata cleanup and blurb                                     */
/* -------------------------------------------------------------------------- */

/**
 * Suggestions for an upload's metadata. Every field is a *suggestion*: the
 * upload form pre-fills them and the uploader confirms, because the model is
 * guessing at an artist name from a filename and will sometimes be confidently
 * wrong about a real person's credit.
 */
export const metadataSuggestionSchema = z.object({
  title: text(200),
  artist: text(200),
  album: text(200),
  /** A library-card blurb written from the metadata and the chart's shape. */
  description: text(400),
  tags: z.array(text(24)).max(6).default([]),
});

export type MetadataSuggestion = z.infer<typeof metadataSuggestionSchema>;

/* -------------------------------------------------------------------------- */
/* 10. Multiplayer match recap                                                */
/* -------------------------------------------------------------------------- */

export const matchRecapSchema = z.object({
  headline: requiredText(90),
  /** Two or three sentences on how the match actually went. */
  story: requiredText(400),
  /** A named standout and why. Empty when nobody stood out. */
  standout: text(160),
});

export type MatchRecap = z.infer<typeof matchRecapSchema>;

/* -------------------------------------------------------------------------- */
/* 11. Comment triage                                                         */
/* -------------------------------------------------------------------------- */

export const commentSeverities = ['none', 'low', 'medium', 'high', 'critical'] as const;
export type CommentSeverity = (typeof commentSeverities)[number];

export const commentTriageSchema = z.object({
  severity: z.enum(commentSeverities),
  categories: z.array(text(24)).max(4).default([]),
  rationale: text(200),
});

export type CommentTriage = z.infer<typeof commentTriageSchema>;

/* -------------------------------------------------------------------------- */
/* 12. Rival plan                                                             */
/* -------------------------------------------------------------------------- */

export const MAX_RIVAL_STEPS = 3;

export const rivalPlanSchema = z.object({
  headline: requiredText(90),
  /** Where the points actually are, stated as a gap. */
  gap: requiredText(200),
  steps: z
    .array(z.object({ step: text(160), worth: text(80) }))
    .max(MAX_RIVAL_STEPS)
    .default([]),
});

export type RivalPlan = z.infer<typeof rivalPlanSchema>;
