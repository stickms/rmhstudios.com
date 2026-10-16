/** Kudos (G4) — free, non-coin thank-you notes. Pure and client-safe. */
import { z } from 'zod';

export const KUDOS_REASON_MAX = 200;
export const KUDOS_PAGE = 20;
/** One sender may give each recipient at most this many per UTC day. */
export const KUDOS_PER_PAIR_PER_DAY = 1;

export const giveKudosSchema = z.object({
  reason: z.string().trim().min(3).max(KUDOS_REASON_MAX),
});

export interface KudosView {
  id: string;
  reason: string;
  createdAt: string;
  from: { id: string; handle: string | null; name: string | null; image: string | null };
}

export interface KudosPage {
  kudos: KudosView[];
  nextCursor: string | null;
  total: number;
  /** Whether the viewer may leave one now (signed in, not self, not already today). */
  canGive: boolean;
}
