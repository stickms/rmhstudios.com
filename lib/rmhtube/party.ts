/**
 * Watch-party extras — shared by the hub, the API and the client (pure).
 * T1 predictions (points, never coins), T2 bingo wire types, F1/T3/T5 helpers.
 */
import { z } from 'zod';
import { normalizePool } from './bingo';

export const START_POINTS = 100;
export const HEAT_BUCKET_SEC = 10;
export const BINGO_MIN_POOL = 24;
export const BINGO_MAX_POOL = 100;

export type Choice = 'yes' | 'no';

export interface PartyState {
  prediction: {
    id: string;
    question: string;
    status: 'open' | 'resolved' | 'cancelled';
    outcome: Choice | null;
    picks: Record<string, { choice: Choice; points: number }>;
  } | null;
  /** userId → session points (in hub memory; gone when the room is). */
  points: Record<string, { name: string; points: number }>;
  bingo: {
    pool: string[];
    seed: string;
    called: string[];
    winner: { userId: string; name: string } | null;
  } | null;
}

export const PredictOpenSchema = z.object({ question: z.string().trim().min(3).max(120) });
export const PredictPickSchema = z.object({
  choice: z.enum(['yes', 'no']),
  points: z.number().int().min(1).max(100_000),
});
export const PredictResolveSchema = z.object({ outcome: z.enum(['yes', 'no', 'cancel']) });
export const BingoStartSchema = z.object({
  pool: z
    .array(z.string().max(60))
    .min(BINGO_MIN_POOL)
    .max(BINGO_MAX_POOL * 2),
});
export const BingoCallSchema = z.object({ square: z.string().min(1).max(60) });

/** Pool as typed in a textarea: one entry per line, de-duplicated and capped. */
export function parsePool(text: string): string[] {
  return normalizePool(text.split('\n')).slice(0, BINGO_MAX_POOL);
}

/**
 * Pari-mutuel payout. Stakes were already deducted; the winning side gets its
 * stake back plus a share of the losing side's pool proportional to its stake.
 * A cancelled round, or one nobody won, refunds everyone. Integer points, with
 * the remainder dropped, so the total paid never exceeds the total staked.
 */
export function settlePrediction(
  picks: Record<string, { choice: Choice; points: number }>,
  outcome: Choice | 'cancel',
): Record<string, number> {
  const out: Record<string, number> = {};
  const entries = Object.entries(picks);
  const winStake = entries.reduce((n, [, p]) => n + (p.choice === outcome ? p.points : 0), 0);
  const loseStake = entries.reduce((n, [, p]) => n + (p.choice !== outcome ? p.points : 0), 0);
  const refund = outcome === 'cancel' || winStake === 0 || loseStake === 0;
  for (const [id, p] of entries) {
    if (refund) out[id] = p.points;
    else if (p.choice === outcome)
      out[id] = p.points + Math.floor((p.points * loseStake) / winStake);
    else out[id] = 0;
  }
  return out;
}

/** The key a media URL is stored under: no fragment, bounded length. */
export function mediaKey(url: string): string {
  return url.trim().split('#')[0]!.slice(0, 1024);
}

export const mediaUrlSchema = z.string().url().max(2048).transform(mediaKey);

export interface CommentaryLine {
  t: number;
  text: string;
}
export const commentaryLinesSchema = z
  .array(z.object({ t: z.number().min(0).max(86_400), text: z.string().trim().min(1).max(200) }))
  .min(1)
  .max(500);
