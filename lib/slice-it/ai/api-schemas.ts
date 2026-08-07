/**
 * Request shapes for the Slice It AI routes.
 *
 * Client-safe, and separate from `lib/slice-it/api-schemas.ts` only because
 * that file is imported by the upload form and the engine — pulling nine AI
 * request schemas into the game bundle to validate an upload would be a waste
 * of bytes on the hot path.
 *
 * ## What a client is and is not allowed to say
 *
 * The line every schema here draws: a client may state **what it did**, never
 * **what it played**. Run numbers (score, accuracy, timing) come from the body,
 * because the engine is the only thing that measured them — that is already
 * true of score submission, and `lib/slice-it/integrity.ts` is where those are
 * challenged. Song facts (title, duration, the chart itself) are read from the
 * `Song` row by the route, never accepted from the body.
 *
 * That is not ceremony. Advice is generated from these facts and rendered as
 * authoritative, so a body that could name its own song would be a way to make
 * the site produce arbitrary text about an arbitrary track under a heading the
 * player reads as the game talking to them.
 */

import { z } from 'zod';
import { DIFFICULTIES, MAX_SONG_DURATION_SEC } from '../constants';
import { ModifiersZ } from '../modifiers';

/** A song id, as the route will look it up. */
const songId = z.string().min(1).max(64);

/**
 * A run's hit-timing distribution — the same three numbers score submission
 * sends, and bounded the same way.
 */
const timingZ = z.object({
  samples: z.number().int().min(0).max(1_000_000),
  meanMs: z.number().min(-5_000).max(5_000),
  stdDevMs: z.number().min(0).max(5_000),
});

/** One section's outcome, as the engine tallied it. */
const sectionResultZ = z.object({
  index: z.number().int().min(0).max(1_000),
  hit: z.number().int().min(0).max(100_000),
  missed: z.number().int().min(0).max(100_000),
  accuracy: z.number().min(0).max(1),
});

/** POST /api/slice-it/ai/coach — features 1 and 2. */
export const CoachRequestZ = z.object({
  songId,
  score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  maxCombo: z.number().int().min(0).max(1_000_000),
  accuracy: z.number().min(0).max(1),
  notesResolved: z.number().int().min(0).max(1_000_000).default(0),
  modifiers: ModifiersZ,
  timing: timingZ.optional(),
  // Capped at the number of 10s sections a 15-minute track can hold, with room
  // to spare — an unbounded array here is an unbounded prompt.
  sections: z.array(sectionResultZ).max(120).optional(),
  judgements: z
    .object({
      MARVELOUS: z.number().int().min(0).max(1_000_000),
      PERFECT: z.number().int().min(0).max(1_000_000),
      GREAT: z.number().int().min(0).max(1_000_000),
      GOOD: z.number().int().min(0).max(1_000_000),
      BAD: z.number().int().min(0).max(1_000_000),
      MISS: z.number().int().min(0).max(1_000_000),
    })
    .optional(),
});
export type CoachRequest = z.infer<typeof CoachRequestZ>;

/** POST /api/slice-it/ai/calibration — feature 3. */
export const CalibrationRequestZ = z.object({
  currentOffsetMs: z.number().int().min(-500).max(500),
  runs: z
    .array(
      z.object({
        songTitle: z.string().trim().min(1).max(200),
        durationSec: z.number().min(0).max(MAX_SONG_DURATION_SEC),
        accuracy: z.number().min(0).max(1),
        timing: timingZ,
      }),
    )
    .min(1)
    .max(10),
});
export type CalibrationRequest = z.infer<typeof CalibrationRequestZ>;

/** POST /api/slice-it/ai/chart-brief — feature 4. */
export const ChartBriefRequestZ = z.object({
  songId,
  difficulty: z.enum(DIFFICULTIES).default('normal'),
});

/** POST /api/slice-it/ai/loadout — feature 5. */
export const LoadoutRequestZ = z.object({
  songId,
  difficulty: z.enum(DIFFICULTIES).default('normal'),
  /** Pooled timing from the player's recent runs; the client has it, we do not. */
  timing: timingZ.optional(),
});

/** POST /api/slice-it/ai/search — feature 6. */
export const SearchRequestZ = z.object({
  phrase: z.string().trim().min(1).max(200),
});

/** POST /api/slice-it/ai/setlist — feature 7. */
export const SetlistRequestZ = z.object({
  goal: z.string().trim().min(1).max(200),
  minutes: z.number().int().min(5).max(120).default(20),
});

/** POST /api/slice-it/ai/metadata — features 8 and 9. */
export const MetadataRequestZ = z.object({
  filename: z.string().trim().min(1).max(300),
  durationSec: z.number().min(0).max(MAX_SONG_DURATION_SEC).default(0),
  typed: z
    .object({
      title: z.string().trim().max(200).optional(),
      artist: z.string().trim().max(200).optional(),
      album: z.string().trim().max(200).optional(),
    })
    .optional(),
  /**
   * The chart the client just generated, summarised.
   *
   * Only the derived statistics, never the note list: the blurb needs density
   * and length, and accepting a full chart here would be a megabyte of body on
   * a route that exists to fill in a text field.
   */
  chart: z
    .object({
      noteCount: z.number().int().min(0).max(200_000),
      averageNps: z.number().min(0).max(100),
      peakNps: z.number().min(0).max(100),
    })
    .optional(),
});

/** POST /api/slice-it/ai/match-recap — feature 10. */
export const MatchRecapRequestZ = z.object({
  songId,
  standings: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        rank: z.number().int().min(1).max(64),
        score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        maxCombo: z.number().int().min(0).max(1_000_000),
        accuracy: z.number().min(0).max(1),
      }),
    )
    .min(2)
    .max(8),
});

/** POST /api/slice-it/ai/rival — feature 12. */
export const RivalRequestZ = z.object({
  songId,
  /**
   * The rival's leaderboard row is read from the database by rank, not supplied.
   * The client says which position it is looking at; the server says who is in it.
   */
  rivalRank: z.number().int().min(1).max(1_000),
});
