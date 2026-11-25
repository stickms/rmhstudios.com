/**
 * The party endpoints (RMHCharacters): a game master's table, each player's brought character and the turn order.
 * Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  createPartyBody,
  joinPartyBody,
  renamePartyBody,
  sharingBody,
  swapCharacterBody,
  writeOrderBody,
} from './party-schema';
import type { PartySummary } from './party-summary';
import type { Character, GameSystem } from './types';

export type { PartySummary };

export type WriteOrderBody = z.infer<typeof writeOrderBody>;

/** A character sheet as the game master receives it: `notes` and `portrait` are never sent. */
export type SharedSheet = Character extends infer C
  ? C extends Character
    ? Omit<C, 'notes' | 'portrait'>
    : never
  : never;

export interface PartyListItem {
  id: string;
  name: string;
  system: GameSystem;
  role: 'gm' | 'player';
  /** The game master's display name. */
  gm: string;
  players: number;
}

/** One line of the turn order. A member's name is read from the membership; an extra's is the game master's own text. */
export interface TurnLine {
  id: string;
  kind: 'member' | 'extra';
  userId: string | null;
  name: string;
  value: number;
}

export interface PartyMemberView {
  userId: string;
  /** The player's display name. */
  name: string;
  joinedAt: number;
  isGm: boolean;
  /** Whether the player lets the game master open the full sheet. Visible to the game master and to the player. */
  sheetShared: boolean;
  /** Null when the character could not be read (its rules data is gone). */
  summary: PartySummary | null;
}

export interface PartyDetail {
  id: string;
  name: string;
  system: GameSystem;
  role: 'gm' | 'player';
  gm: string;
  /** The invite code, for the game master only. */
  inviteCode: string | null;
  members: PartyMemberView[];
  order: TurnLine[];
  turnIndex: number;
  /** The compare-and-set token a turn-order write must carry. */
  orderVersion: number;
}

export interface PartyJoinPreview {
  name: string;
  system: GameSystem;
  gm: string;
  players: number;
  max: number;
}

export interface PartyOrderResult {
  order: TurnLine[];
  turnIndex: number;
  orderVersion: number;
}

export const listPartiesApi = endpoint<{ res: { parties: PartyListItem[] } }>()({
  method: 'GET',
  path: '/api/rmhcharacters/parties',
});

export const createPartyApi = endpoint<{
  body: z.infer<typeof createPartyBody>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/rmhcharacters/parties' });

/** One party, members only (404 for anyone else, whatever the reason). */
export const getPartyApi = endpoint<{ res: { party: PartyDetail } }>()({
  method: 'GET',
  path: '/api/rmhcharacters/parties/$id',
});

export const renamePartyApi = endpoint<{
  body: z.infer<typeof renamePartyBody>;
  res: { ok: true };
}>()({ method: 'PATCH', path: '/api/rmhcharacters/parties/$id' });

export const deletePartyApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/rmhcharacters/parties/$id',
});

/** What an invite link opens: the party's name and system, before the player confirms. */
export const previewPartyJoinApi = endpoint<{
  query: { code: string };
  res: { party: PartyJoinPreview };
}>()({ method: 'GET', path: '/api/rmhcharacters/party-join' });

export const joinPartyApi = endpoint<{
  body: z.infer<typeof joinPartyBody>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/rmhcharacters/party-join' });

export const leavePartyApi = endpoint<{ res: { ok: true } }>()({
  method: 'POST',
  path: '/api/rmhcharacters/parties/$id/leave',
});

export const swapPartyCharacterApi = endpoint<{
  body: z.infer<typeof swapCharacterBody>;
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/rmhcharacters/parties/$id/character' });

export const setPartySharingApi = endpoint<{
  body: z.infer<typeof sharingBody>;
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/rmhcharacters/parties/$id/sharing' });

/** The game master removes a player. */
export const removePartyMemberApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/rmhcharacters/parties/$id/members/$userId',
});

/** The game master changes the code; links made with the old one stop working. */
export const rotatePartyCodeApi = endpoint<{ res: { inviteCode: string } }>()({
  method: 'POST',
  path: '/api/rmhcharacters/parties/$id/code',
});

/** The game master opens one player's sheet: only a current member who shared it, without `notes` or `portrait`. */
export const readPartySheetApi = endpoint<{ res: { character: SharedSheet } }>()({
  method: 'GET',
  path: '/api/rmhcharacters/parties/$id/sheet/$userId',
});

/**
 * The turn order, written by the game master only and compare-and-set: the body carries the `orderVersion` it was
 * read at, and a write against an older one is refused with 409 so two tabs never overwrite each other.
 */
export const writePartyOrderApi = endpoint<{
  body: z.infer<typeof writeOrderBody>;
  res: PartyOrderResult;
}>()({ method: 'PUT', path: '/api/rmhcharacters/parties/$id/order' });
