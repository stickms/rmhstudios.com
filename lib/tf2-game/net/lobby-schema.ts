/**
 * RMH TF2 — validation for the JSON control plane (`./events.ts`).
 *
 * The hub parses its inbound payloads with these (the browser, the door), and a
 * peer-to-peer host parses its members' commands with them (net/p2p/control.ts),
 * so nobody can ask a match for a team, class or voice line that does not exist.
 *
 * Strings that other players will render (chat) are length-capped here.
 *
 * Environment-agnostic; no `@/` specifiers (the hub imports it relatively).
 */

import { z } from 'zod';
import {
  CLASS_CHOICES,
  TEAM_CHOICES,
  TF2_LIMITS,
  TF2_ROOM_CODE_RE,
  type ClassChoice,
  type TeamChoice,
} from './events';
import { EXTRA_COMMAND_MAX_ARGS, EXTRA_COMMAND_NAME_RE } from './extra-commands';
import { classSchema, slotsSchema } from '../../tf2-loadout/api-schema';

/** `tf2:rooms:list` — an optional page offset (anything else, or nothing, lists the first page). */
export const zListRooms = z
  .object({ offset: z.number().int().min(0).max(100_000).optional(), game: z.enum(['tf2', 'csgo']).optional() })
  .catch({});

export const zRoomDetails = z.object({
  code: z.string().regex(TF2_ROOM_CODE_RE),
});

/** A room password: printable, at most this long ('' = none). */
export const ROOM_PASSWORD_MAX_LENGTH = 32;

/** `tf2:room:admin`: a P2P host's door. The hub checks the socket hosts the room. */
export const zRoomAdmin = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lock'), locked: z.boolean() }),
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  z.object({ action: z.literal('password'), password: z.string().max(ROOM_PASSWORD_MAX_LENGTH).regex(/^[^\u0000-\u001f\u007f]*$/) }),
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
