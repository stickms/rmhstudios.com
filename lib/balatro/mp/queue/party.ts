/**
 * Balatro multiplayer — party lobbies (MM-06; WS12).
 *
 * A party is an ordinary P2P lobby of kind `party` (up to `PARTY_MAX`
 * players): the host gets FIND GAME, the others READY. The host may queue
 * the party once every other player is connected and ready; the hub then
 * queues all of them as one ticket and places them in the same match. When
 * the party is matched the hub closes the party room quietly (its players
 * take seats in the match), so the party is remembered here for the
 * "Return to lobby" row.
 *
 * Browser-free, zod-free (MP chunk).
 */

import { BALATRO_LIMITS } from '../../net/limits';
import type { LobbyState } from '../types';

export type PartyBlock = 'not-party' | 'not-host' | 'started' | 'too-many' | 'not-ready' | 'disconnected';

/** Why this party cannot queue now (null = it can). */
export function partyQueueBlock(s: LobbyState | null, me: string): PartyBlock | null {
  if (!s || s.kind !== 'party') return 'not-party';
  if (s.hostId !== me) return 'not-host';
  if (s.started) return 'started';
  const players = s.players.filter((p) => p.role === 'player');
  if (players.length > BALATRO_LIMITS.PARTY_MAX) return 'too-many';
  if (players.some((p) => !p.connected || p.away)) return 'disconnected';
  if (players.some((p) => p.id !== s.hostId && !p.ready)) return 'not-ready';
  return null;
}

export interface PartyMemory {
  /** The party room's code when it was queued. */
  code: string;
  hostId: string;
  members: string[];
  queueMode: LobbyState['queueMode'];
  at: number;
}

/** What the player remembers about the party it queued with. */
export function rememberParty(s: LobbyState, at: number): PartyMemory {
  return {
    code: s.code,
    hostId: s.hostId,
    members: s.players.filter((p) => p.role === 'player').map((p) => p.id),
    queueMode: s.queueMode,
    at,
  };
}
