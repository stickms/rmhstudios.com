/** Trick of the week (R21) — week maths, vote schema and row shapes. Kept out of lib/nightrail so the site-tier hub can import it. */
import { z } from 'zod';

/** The UTC Monday (YYYY-MM-DD) of the week containing `at`. */
export function weekKey(at: Date = new Date()): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function previousWeekKey(at: Date = new Date()): string {
  const d = new Date(`${weekKey(at)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

export const voteTrickSchema = z.object({ trickId: z.string().min(1).max(40) });

export interface TrickView {
  id: string;
  author: string | null;
  level: number;
  score: number;
  multiplier: number;
  chain: string[];
  votes: number;
  mine: boolean;
}

export interface TricksPayload {
  week: string;
  tricks: TrickView[];
  myVoteTrickId: string | null;
}
