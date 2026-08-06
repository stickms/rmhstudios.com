/**
 * Request shapes for the Slice It API.
 *
 * Client-safe (no server imports) so the browser can validate a form against
 * exactly the schema the route will apply, rather than guessing and finding out
 * from a 400.
 */

import { z } from 'zod';
import {
  COMMENT_MAX_LENGTH,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_PAGE_SIZE_MAX,
  MAX_SONG_DURATION_SEC,
  MAX_SPEED,
  MIN_SONG_DURATION_SEC,
  MIN_SPEED,
  SONGS_PAGE_SIZE,
  SONGS_PAGE_SIZE_MAX,
  SONG_ARTIST_MAX,
  SONG_DESCRIPTION_MAX,
  SONG_SORTS,
  SONG_TITLE_MAX,
} from './constants';
import { ModifiersZ } from './modifiers';

/** `?q=&sort=&cursor=&limit=&mine=` for the song library. */
export const SongListQueryZ = z.object({
  q: z.string().trim().max(120).optional(),
  sort: z.enum(SONG_SORTS).default('recent'),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(SONGS_PAGE_SIZE_MAX).default(SONGS_PAGE_SIZE),
  /** Restrict to the caller's own uploads. Ignored when signed out. */
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type SongListQuery = z.infer<typeof SongListQueryZ>;

export const LeaderboardQueryZ = z.object({
  songId: z.string().max(64).optional(),
  cursor: z.coerce.number().int().min(0).max(10_000).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LEADERBOARD_PAGE_SIZE_MAX)
    .default(LEADERBOARD_PAGE_SIZE),
});

/**
 * A submitted score.
 *
 * Note what is *not* here: the song's duration, the note count, the username.
 * Every one of those was previously supplied by the client and used to decide
 * whether the score was reasonable, which is the same as not deciding. The
 * server reads them from the `Song` row and the session.
 */
export const ScoreSubmissionZ = z.object({
  songId: z.string().min(1).max(64),
  score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  maxCombo: z.number().int().min(0).max(1_000_000),
  accuracy: z.number().min(0).max(1),
  /** Notes the client resolved — cross-checked against the chart's length. */
  notesResolved: z.number().int().min(0).max(1_000_000).optional(),
  modifiers: ModifiersZ,
  /** True when this came from a multiplayer match, for the results attribution. */
  multiplayer: z.boolean().default(false),
  /**
   * The run's signed receipt, from the single-song read. Its timestamp is how
   * the server knows how long the run took without asking the client.
   */
  runToken: z.string().max(512).optional(),
  /**
   * The run's hit-timing distribution. Three numbers, not per-note samples —
   * enough to tell a person from a metronome, cheap enough to send with every
   * score. See `lib/slice-it/integrity.ts`.
   */
  timing: z
    .object({
      samples: z.number().int().min(0).max(1_000_000),
      meanMs: z.number().min(-10_000).max(10_000),
      stdDevMs: z.number().min(0).max(10_000),
    })
    .optional(),
});
export type ScoreSubmission = z.infer<typeof ScoreSubmissionZ>;

export const CommentBodyZ = z.object({
  content: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
});

export const SongPatchZ = z.object({
  title: z.string().trim().min(1).max(SONG_TITLE_MAX).optional(),
  artist: z.string().trim().min(1).max(SONG_ARTIST_MAX).optional(),
  description: z.string().trim().max(SONG_DESCRIPTION_MAX).optional(),
  bpm: z.coerce.number().min(20).max(400).optional(),
  isPublic: z.coerce.boolean().optional(),
});

/**
 * Upload metadata, parsed out of the multipart form.
 *
 * `duration` is only a *hint* for the storage-quota pre-check; the value stored
 * on the row is the one the analyser measured from the decoded audio, because
 * duration is what bounds a score and a client-declared bound is no bound.
 */
export const UploadFieldsZ = z.object({
  title: z.string().trim().max(SONG_TITLE_MAX).default(''),
  artist: z.string().trim().max(SONG_ARTIST_MAX).default(''),
  description: z.string().trim().max(SONG_DESCRIPTION_MAX).default(''),
  bpm: z.coerce.number().min(20).max(400).optional().catch(undefined),
  duration: z.coerce
    .number()
    .min(0)
    .max(MAX_SONG_DURATION_SEC * 2)
    .optional()
    .catch(undefined),
  isPublic: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

/* ─── Beatmap backfill ──────────────────────────────────────────────────── */

/** Hard cap on note count per difficulty, well past any real chart. */
const MAX_SLICES = 20_000;

const SliceZ = z.object({
  id: z.string().max(64),
  time: z
    .number()
    .min(0)
    .max(MAX_SONG_DURATION_SEC * 2),
  type: z.enum(['STANDARD', 'MOVING', 'LONG', 'SILENT', 'SPEED', 'BOMB', 'SWITCH']),
  lane: z.number().int().min(0).max(1),
  duration: z.number().min(0).max(120).optional(),
  speedMultiplier: z.number().min(0.1).max(10).optional(),
});

/**
 * A chart posted back by a client, for a legacy song that has none.
 *
 * Validated field by field rather than accepted as opaque JSON. The old route's
 * only check was `JSON.stringify(body).length < 1_000_000`, so any megabyte of
 * arbitrary JSON became the `analysisData` every future player of that song
 * would download and feed to the engine.
 */
export const BeatMapZ = z.object({
  id: z.string().max(64),
  name: z.string().max(SONG_TITLE_MAX),
  artist: z.string().max(SONG_ARTIST_MAX),
  audioUrl: z.string().max(512).default(''),
  bpm: z.number().min(0).max(400),
  analysisVersion: z.number().int().min(1).max(1000).optional(),
  beats: z.array(z.number()).max(20_000).optional(),
  tempoConfidence: z.number().min(0).max(1).optional(),
  noteCounts: z.record(z.string(), z.number()).optional(),
  slices: z.union([
    z.array(SliceZ).max(MAX_SLICES),
    z.object({
      easy: z.array(SliceZ).max(MAX_SLICES),
      normal: z.array(SliceZ).max(MAX_SLICES),
      hard: z.array(SliceZ).max(MAX_SLICES),
      expert: z.array(SliceZ).max(MAX_SLICES),
    }),
  ]),
});

export const AnalysisBackfillZ = z.object({ analysisData: BeatMapZ });

export const SPEED_RANGE = { min: MIN_SPEED, max: MAX_SPEED } as const;
export const DURATION_RANGE = {
  min: MIN_SONG_DURATION_SEC,
  max: MAX_SONG_DURATION_SEC,
} as const;
