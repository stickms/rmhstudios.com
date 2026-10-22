/**
 * Gift & mixtape exchanges (G3 / F2) — the zod input schemas for the exchange
 * API routes. Split from `./exchange`, which the exchange pages import for the
 * types and limits, so they stay zod-free.
 */
import { z } from 'zod';
import { GIFT_MAX, GIFT_MIN } from '@/lib/gifting/coin-gift-limits';

import { EXCHANGE_MAX_EXCLUDES, MIXTAPE_MAX_TRACKS } from './exchange';

export const createExchangeSchema = z
  .object({
    kind: z.enum(['GIFT', 'MIXTAPE']),
    title: z.string().trim().min(3).max(80),
    theme: z.string().trim().max(80).optional(),
    /** Max coins per gift; required for GIFT exchanges. */
    budget: z.number().int().min(GIFT_MIN).max(GIFT_MAX).optional(),
    drawAt: z.string().datetime(),
    revealAt: z.string().datetime(),
  })
  .refine((v) => v.kind !== 'GIFT' || v.budget !== undefined, {
    message: 'A gift exchange needs a budget',
    path: ['budget'],
  })
  .refine((v) => new Date(v.revealAt) > new Date(v.drawAt), {
    message: 'Reveal must come after the draw',
    path: ['revealAt'],
  });

export type CreateExchangeInput = z.infer<typeof createExchangeSchema>;

const spotifyHost = (u: string) => {
  try {
    const { protocol, hostname } = new URL(u);
    return (
      protocol === 'https:' &&
      (hostname === 'scdn.co' ||
        hostname.endsWith('.scdn.co') ||
        hostname.endsWith('.spotifycdn.com'))
    );
  } catch {
    return false;
  }
};

export const mixtapeTrackSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9]{10,32}$/),
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  albumArt: z.string().max(500).refine(spotifyHost).nullable().optional(),
  previewUrl: z.string().max(500).refine(spotifyHost).nullable().optional(),
});

export type MixtapeTrack = z.infer<typeof mixtapeTrackSchema>;

/** A member's own settings: who they would rather not draw, and (F2) their mixtape. */
export const updateMemberSchema = z.object({
  excludeHandles: z.array(z.string().trim().min(1).max(40)).max(EXCHANGE_MAX_EXCLUDES).optional(),
  tracks: z.array(mixtapeTrackSchema).max(MIXTAPE_MAX_TRACKS).optional(),
});

export const sendExchangeGiftSchema = z.object({
  amount: z.number().int().min(GIFT_MIN).max(GIFT_MAX),
  note: z.string().trim().max(280).optional(),
});
