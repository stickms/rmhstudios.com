/**
 * RMH TF2 — validation for the JSON control plane (`./events.ts`).
 *
 * The hub parses every inbound payload with these before it touches a room, so
 * a client cannot ask a match worker for an unknown map, an out-of-range bot
 * count or a voice line that does not exist. The client may use them too, to
 * avoid building a payload the hub would refuse.
 *
 * Strings that other players will render (room names, chat, player names) are
 * length-capped here and sanitised again by the hub (server/socket-server/utils.ts).
 *
 * Environment-agnostic; no `@/` specifiers (the hub imports it relatively).
 */

import { z } from 'zod';
import { TF2_MODES } from '../data/maps';
import {
  BOT_DIFFICULTIES,
  CLASS_CHOICES,
  TEAM_CHOICES,
  TF2_LIMITS,
  TF2_ROOM_CODE_RE,
  type BotDifficulty,
  type ClassChoice,
  type TeamChoice,
} from './events';
import type { Tf2Mode } from '../data/maps';
import { EXTRA_COMMAND_MAX_ARGS, EXTRA_COMMAND_NAME_RE } from './extra-commands';
import { classSchema, slotsSchema } from '../../tf2-loadout/api-schema';

const playerName = z.string().max(64).optional();

export const zCreateRoom = z.object({
  map: z.string().min(1).max(64),
  mode: z.enum(TF2_MODES as [Tf2Mode, ...Tf2Mode[]]).optional(),
  maxPlayers: z.number().int().min(TF2_LIMITS.MIN_PLAYERS).max(TF2_LIMITS.MAX_PLAYERS),
  botCount: z.number().int().min(0).max(TF2_LIMITS.MAX_BOTS),
  botDifficulty: z.enum(BOT_DIFFICULTIES as [BotDifficulty, ...BotDifficulty[]]),
  name: z.string().max(TF2_LIMITS.ROOM_NAME_MAX_LENGTH * 2),
  private: z.boolean().optional(),
  playerName,
});

/** `tf2:rooms:list` — an optional page offset (anything else, or nothing, lists the first page). */
export const zListRooms = z
  .object({ offset: z.number().int().min(0).max(100_000).optional() })
  .catch({});

export const zRoomDetails = z.object({
  code: z.string().regex(TF2_ROOM_CODE_RE),
});

/** A room password: printable, at most this long ('' = none). */
export const ROOM_PASSWORD_MAX_LENGTH = 32;

export const zJoinRoom = z.object({
  code: z.string().regex(TF2_ROOM_CODE_RE),
  playerName,
  spectate: z.boolean().optional(),
  password: z.string().max(ROOM_PASSWORD_MAX_LENGTH).optional(),
});

/** `tf2:room:admin`. The hub checks who asks (the owner) and the map against the allowlist. */
export const zRoomAdmin = z.discriminatedUnion('action', [
  z.object({ action: z.literal('kick'), playerId: z.number().int().min(1).max(100_000) }),
  z.object({ action: z.literal('transfer'), playerId: z.number().int().min(1).max(100_000) }),
  z.object({ action: z.literal('changelevel'), map: z.string().min(1).max(64) }),
  z.object({ action: z.literal('lock'), locked: z.boolean() }),
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  z.object({ action: z.literal('password'), password: z.string().max(ROOM_PASSWORD_MAX_LENGTH).regex(/^[^\u0000-\u001f\u007f]*$/) }),
  z.object({ action: z.literal('say'), text: z.string().min(1).max(TF2_LIMITS.CHAT_MAX_LENGTH * 2) }),
]);

export const zChat = z.object({
  text: z.string().min(1).max(TF2_LIMITS.CHAT_MAX_LENGTH * 2),
  teamOnly: z.boolean().optional(),
});

export const zTeam = z.object({
  team: z.enum(TEAM_CHOICES as [TeamChoice, ...TeamChoice[]]),
});

export const zClass = z.object({
  cls: z.enum(CLASS_CHOICES as [ClassChoice, ...ClassChoice[]]),
});

export const zVoice = z.object({
  menu: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  item: z.number().int().min(0).max(7),
});

export const zPing = z.object({
  t: z.number().finite(),
});

/** A generic game command (`MatchCommand { kind: 'extra' }`): a verb and console-style arguments. */
export const zExtraCommand = z.object({
  command: z.string().regex(EXTRA_COMMAND_NAME_RE),
  args: z
    .array(z.union([z.number().finite(), z.string().max(64), z.boolean()]))
    .max(EXTRA_COMMAND_MAX_ARGS),
});

/**
 * A loadout to equip: the class and its slots, in the saved-loadout shape (the same schema the
 * loadout API validates). The match checks the items themselves against the catalog.
 */
export const zLoadout = z.object({
  cls: classSchema,
  slots: slotsSchema,
});

/** No payload; anything (or nothing) is accepted and ignored. */
export const zEmpty = z.unknown();
