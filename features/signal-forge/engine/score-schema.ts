/** Request schemas for the Signal Forge routes. Client-safe. */
import { z } from 'zod';
import type { SignalForgeRunFacts } from './achievements';
import { MAX_ASCENSION } from './balance';

export const signalForgeRunFacts: z.ZodType<SignalForgeRunFacts> = z.object({
  won: z.boolean(),
  act: z.number().int().min(1).max(3),
  ascension: z.number().int().min(0).max(MAX_ASCENSION),
  mode: z.enum(['timed', 'steady']),
  bursts: z.number().int().min(0).max(5000),
  perfects: z.number().int().min(0).max(20000),
  maxHit: z.number().int().min(0).max(100000),
  elitesWon: z.number().int().min(0).max(30),
  bossesWon: z.number().int().min(0).max(3),
  deckSize: z.number().int().min(0).max(500),
  hpLeft: z.number().int().min(0).max(1000),
});

export const signalForgeScoreBody = z.object({
  score: z.number().min(0).max(1_000_000),
  floorReached: z.number().min(1).max(100),
  /** Played time of the run, for the shared pipeline's points-per-second check. */
  durationMs: z.number().int().min(0).max(24 * 3_600_000).optional(),
  /** The facts the achievements are decided from (v2 runs). */
  facts: signalForgeRunFacts.optional(),
});

/** The old route's two bespoke 400 texts, chosen by the field that failed. */
export function signalForgeScoreMessage(error: z.ZodError): string {
  return error.issues[0]?.path[0] === 'floorReached' ? 'Invalid floor' : 'Invalid score';
}

/** The cloud save body: the v2 blob (see save.ts). Validated loosely here, strictly on load. */
export const signalForgeSaveBody = z.object({
  runState: z.object({
    v: z.literal(2),
    run: z.record(z.string(), z.unknown()).nullable(),
    meta: z.object({
      ascensionUnlocked: z.number().int().min(0).max(20),
      wins: z.number().int().min(0),
      runs: z.number().int().min(0),
      tutorialDone: z.boolean(),
    }),
  }),
});
