/**
 * Peer-to-peer play — the JSON CONTROL messages on the reliable channel
 * (`wire.ts` TAG_CONTROL), and their schemas. Each side parses everything it
 * receives with these before acting on it: a peer's bytes are data, never
 * code, and a member's commands go through exactly the hub's validation
 * (`../lobby-schema.ts`) before the host's match sees them.
 *
 * Environment-agnostic.
 */

import { z } from 'zod';
import type { MatchCommand } from '../../server/match-host';
import {
  ROOM_MODES,
  TF2_LIMITS,
  TF2_ROOM_CODE_RE,
  type ChatMessage,
  type JoinedPayload,
  type RoomMode,
} from '../events';
import { zChat, zClass, zExtraCommand, zLoadout, zTeam, zVoice } from '../lobby-schema';

/**
 * How a member reaches the host (the scoreboard's connection column): directly, through a TURN
 * server (UDP, a relay candidate), or through the games hub's relay (the last resort).
 */
export type PeerConnection = 'host' | 'direct' | 'turn' | 'relayed';

export interface PeerRow {
  /** The player's entity id (what the scoreboard keys rows by). */
  entity: number;
  link: PeerConnection;
  /** The host's round trip to this member (ms; 0 for the host itself). */
  pingMs?: number;
  /** Share of this member's input packets lost on the way to the host (0…1, from their sequence numbers). */
  loss?: number;
}

/**
 * Why a member's link to the host ended, as the host tells it. `migrating`: the host is leaving and the
 * match moves to another member's browser — wait to be admitted there (the hub says by whom).
 */
export type HostCloseReason = 'host-left' | 'kicked' | 'server-error' | 'map-failed' | 'congested' | 'migrating';

export type HostToPeer =
  | { t: 'joined'; info: JoinedPayload }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'peers'; peers: PeerRow[] }
  | { t: 'closed'; reason: HostCloseReason };

export type PeerToHost = { t: 'cmd'; cmd: MatchCommand } | { t: 'leave' };

const zJoined = z.object({
  code: z.string().regex(TF2_ROOM_CODE_RE),
  playerId: z.number().int().min(1).max(10_000),
  map: z.string().max(64),
  // Any room's mode: a CS:GO room's ('de', 'dm') too, or its members drop the `joined` and never start.
  mode: z.enum(ROOM_MODES as [RoomMode, ...RoomMode[]]),
  name: z.string().max(TF2_LIMITS.ROOM_NAME_MAX_LENGTH * 2),
  maxPlayers: z.number().int().min(TF2_LIMITS.MIN_PLAYERS).max(TF2_LIMITS.MAX_PLAYERS),
  serverTick: z.number().int().min(0),
  tickInterval: z.number().positive().max(1),
});

const zChatMessage = z.object({
  from: z.number().int(),
  name: z.string().max(64),
  text: z.string().max(TF2_LIMITS.CHAT_MAX_LENGTH * 2),
  teamOnly: z.boolean(),
  team: z.number().int().min(0).max(3),
  at: z.number().finite(),
});

export const zHostToPeer = z.discriminatedUnion('t', [
  z.object({ t: z.literal('joined'), info: zJoined }),
  z.object({ t: z.literal('chat'), message: zChatMessage }),
  z.object({
    t: z.literal('peers'),
    peers: z
      .array(
        z.object({
          entity: z.number().int().min(0).max(4096),
          link: z.enum(['host', 'direct', 'turn', 'relayed']),
          pingMs: z.number().finite().min(0).max(60_000).optional(),
          loss: z.number().finite().min(0).max(1).optional(),
        }),
      )
      .max(TF2_LIMITS.MAX_PLAYERS),
  }),
  z.object({ t: z.literal('closed'), reason: z.enum(['host-left', 'kicked', 'server-error', 'map-failed', 'congested', 'migrating']) }),
]);

/** A member's match command — the hub's own schemas, per kind. */
export const zPeerCommand = z.discriminatedUnion('kind', [
  zTeam.extend({ kind: z.literal('team') }),
  zClass.extend({ kind: z.literal('class') }),
  zVoice.extend({ kind: z.literal('voice') }),
  zExtraCommand.extend({ kind: z.literal('extra') }),
  zLoadout.extend({ kind: z.literal('loadout') }),
  zChat.extend({ kind: z.literal('chat') }),
]);

export const zPeerToHost = z.discriminatedUnion('t', [
  z.object({ t: z.literal('cmd'), cmd: zPeerCommand }),
  z.object({ t: z.literal('leave') }),
]);

/** A validated member command in the match's shape. */
export function toMatchCommand(cmd: z.infer<typeof zPeerCommand>): MatchCommand {
  switch (cmd.kind) {
    case 'team':
      return { kind: 'team', team: cmd.team };
    case 'class':
      return { kind: 'class', cls: cmd.cls };
    case 'voice':
      return { kind: 'voice', menu: cmd.menu, item: cmd.item };
    case 'extra':
      return { kind: 'extra', command: cmd.command, args: cmd.args };
    case 'loadout':
      return { kind: 'loadout', cls: cmd.cls, slots: cmd.slots };
    case 'chat':
      return { kind: 'chat', text: cmd.text, teamOnly: cmd.teamOnly === true };
  }
}
