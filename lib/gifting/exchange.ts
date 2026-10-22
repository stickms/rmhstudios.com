/**
 * Gift & mixtape exchanges (G3 / F2) — types and limits, client-safe and
 * zod-free. The API input schemas are in `./exchange-schema`.
 */
import type { MixtapeTrack } from './exchange-schema';

export type { CreateExchangeInput, MixtapeTrack } from './exchange-schema';

export const EXCHANGE_MIN_MEMBERS = 3;
export const EXCHANGE_MAX_MEMBERS = 100;
export const MIXTAPE_MAX_TRACKS = 10;
export const EXCHANGE_MAX_EXCLUDES = 10;

export type ExchangeKind = 'GIFT' | 'MIXTAPE';
export type ExchangeStatus = 'OPEN' | 'DRAWN' | 'FAILED' | 'CANCELLED';

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
