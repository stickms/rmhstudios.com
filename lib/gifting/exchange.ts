/** Gift & mixtape exchanges (G3 / F2) — types and schemas, client-safe. */
import { z } from 'zod';
import { GIFT_MAX, GIFT_MIN } from '@/lib/gifting/coin-gift-limits';

export const EXCHANGE_MIN_MEMBERS = 3;
export const EXCHANGE_MAX_MEMBERS = 100;
export const MIXTAPE_MAX_TRACKS = 10;
export const EXCHANGE_MAX_EXCLUDES = 10;

export type ExchangeKind = 'GIFT' | 'MIXTAPE';
export type ExchangeStatus = 'OPEN' | 'DRAWN' | 'FAILED' | 'CANCELLED';

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

export interface ExchangeUser {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
}

export interface ExchangeSummary {
  id: string;
  kind: ExchangeKind;
  title: string;
  status: ExchangeStatus;
  drawAt: string;
  memberCount: number;
  isOrganizer: boolean;
}

export interface ExchangeView {
  id: string;
  kind: ExchangeKind;
  title: string;
  theme: string | null;
  budget: number | null;
  status: ExchangeStatus;
  drawAt: string;
  revealAt: string;
  singleCycle: boolean | null;
  organizer: ExchangeUser;
  members: ExchangeUser[];
  isOrganizer: boolean;
  isMember: boolean;
  canJoin: boolean;
  revealed: boolean;
  /** After revealAt: every pairing. Before it, only `me.recipient`. */
  pairings: { giver: ExchangeUser; recipient: ExchangeUser }[] | null;
  me: {
    excludeHandles: string[];
    tracks: MixtapeTrack[];
    giftedAt: string | null;
    /** Who the viewer was drawn (GIFT: gift them; MIXTAPE: whose mixtape they receive). */
    recipient: ExchangeUser | null;
    /** MIXTAPE only: the assigned member's curated tracks. */
    receivedTracks: MixtapeTrack[] | null;
    /** MIXTAPE only: the viewer had no tracks at the deadline, so was left out. */
    leftOut: boolean;
  } | null;
}
