/**
 * Party system (§5) — per-game join contract + ticket helpers (hub-only).
 *
 * Parties are ephemeral platform-level groups (up to 8) that any multiplayer
 * game can opt into by registering a {@link PartyJoinable}. When the leader
 * queues a game, the party handler asks that game to create a room and hands
 * every member a short-lived HMAC ticket; the game seats them via
 * {@link verifyPartyTicket}. All of this runs inside the single socket-server
 * process, so the HMAC secret only has to be stable for the process lifetime —
 * we derive it from a configured secret when present, else a per-process random
 * key (see below).
 *
 * Games register their impl from their own handler, e.g.:
 *   import { registerPartyGame } from '../party-contract';
 *   registerPartyGame('synapse-storm', { maxPartySize: 4, createRoomForParty, seatWithTicket });
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'socket.io';

export interface PartyMember {
  userId: string;
  name?: string;
}

export interface RoomRef {
  game: string;
  roomId: string;
}

/** The decoded, verified ticket payload. */
export interface PartyTicket {
  partyId: string;
  userId: string;
  game: string;
  roomId: string;
  /** Epoch-ms expiry. */
  exp: number;
}

export interface PartyJoinable {
  /** Max party size this game can seat together. */
  maxPartySize: number;
  /** Create (or reuse) a room for the whole party; returns the room ref. */
  createRoomForParty(members: PartyMember[]): Promise<RoomRef>;
  /**
   * Optional: seat a socket that arrives with a verified ticket. Games that
   * key rooms purely off `roomId` may not need this (the client just joins the
   * room by id) — it exists for games that must validate the ticket server-side
   * before granting a seat.
   */
  seatWithTicket?(socket: Socket, ticket: PartyTicket): Promise<void>;

  /**
   * Reclaim a room the party never actually occupied. Called once,
   * {@link PARTY_ROOM_GRACE_MS} after the room was made; the game deletes it
   * only if nobody has taken a seat.
   *
   * **Not optional in practice, despite the `?`.** Every game here deletes its
   * rooms when the last PLAYER leaves, which means a room that never had a
   * player has no path to deletion at all: a leader who queues a game and then
   * closes the tab leaks one room, permanently, in the busiest process on the
   * system. Only a game whose rooms are already swept on a timer can leave this
   * out, and none currently can.
   *
   * Implementations must be idempotent and must never remove a room that has
   * someone in it — the timer can land after a real match has started in that
   * room.
   */
  reapIfEmpty?(roomId: string): void;
}

/**
 * How long a party room may sit unoccupied before it is reclaimed.
 *
 * Comfortably longer than {@link PARTY_TICKET_TTL_MS}, because the ticket only
 * has to survive until the member's client asks to join; the member themselves
 * has to load a game bundle, and on a cold cache over a bad connection that is
 * not a 60-second proposition.
 */
export const PARTY_ROOM_GRACE_MS = 5 * 60_000;

/** The registry of party-enabled games, keyed by game id. */
export const partyGames = new Map<string, PartyJoinable>();

export function registerPartyGame(id: string, impl: PartyJoinable): void {
  partyGames.set(id, impl);
}

// ─── Ticket signing ─────────────────────────────────────────────

/**
 * Prefer a configured shared secret (so tickets stay valid across a future
 * multi-process split), else a random per-process key. Minting AND verifying
 * both happen in this process today, so a random key is fully sufficient for
 * Phase 1.
 */
const TICKET_SECRET =
  process.env.PARTY_TICKET_SECRET ||
  process.env.INTERNAL_API_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  randomBytes(32).toString('hex');

export const PARTY_TICKET_TTL_MS = 60_000;

function sign(payloadB64: string): string {
  return createHmac('sha256', TICKET_SECRET).update(payloadB64).digest('base64url');
}

/**
 * Mint a single-use bearer token: `base64url(payload).base64url(hmac)`.
 * 60-second TTL. Never place this in a URL — it's a bearer secret.
 */
export function mintPartyTicket(input: {
  partyId: string;
  userId: string;
  game: string;
  roomId: string;
}): string {
  const body: PartyTicket = { ...input, exp: Date.now() + PARTY_TICKET_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Verify + decode a ticket. Returns null on any tamper / expiry / parse error. */
export function verifyPartyTicket(token: string): PartyTicket | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const body = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as PartyTicket;
    if (
      typeof body.partyId !== 'string' ||
      typeof body.userId !== 'string' ||
      typeof body.game !== 'string' ||
      typeof body.roomId !== 'string' ||
      typeof body.exp !== 'number' ||
      body.exp < Date.now()
    ) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}
