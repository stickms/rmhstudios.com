/** Query and cursor handling for `GET /api/v1/me/personal-bests` (pure). */
import { z } from 'zod';

export const personalBestsQuerySchema = z.object({
  gameId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .optional(),
  since: z.string().datetime().optional(),
});

export interface ApiPersonalBest {
  gameId: string;
  gameTitle: string;
  score: number;
  previousScore: number | null;
  achievedAt: string;
}

/** The cursor is the last game id of the page, opaque on the wire. */
export function encodePersonalBestCursor(gameId: string): string {
  return Buffer.from(gameId).toString('base64url');
}

export function parsePersonalBestCursor(raw: string | null): string | null {
  if (!raw) return null;
  const text = Buffer.from(raw, 'base64url').toString();
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(text) ? text : null;
}
