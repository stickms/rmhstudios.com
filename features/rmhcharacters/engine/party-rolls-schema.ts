/** Zod schemas for the table-roll endpoint. Server-side by use; the contract and the UI import types only. */
import { z } from 'zod';
import { ABILITIES } from './types';

const index = z.number().int().min(0).max(49);

/** What the caller asked to roll. Never a modifier or a result: the server computes both. Unknown fields are dropped. */
export const sheetRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skill'), key: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('check'), ability: z.enum(ABILITIES) }),
  z.object({
    kind: z.literal('save'),
    ability: z.enum([...ABILITIES, 'fortitude', 'reflex', 'will']),
  }),
  z.object({ kind: z.literal('attack'), index }),
  z.object({ kind: z.literal('damage'), index, critical: z.boolean() }),
  z.object({ kind: z.literal('initiative') }),
  z.object({ kind: z.literal('perception') }),
  z.object({ kind: z.literal('strike'), index, map: z.union([z.literal(0), z.literal(1), z.literal(2)]) }),
  /** `as: 'hitDie'` names a short rest's Hit Die on the table; the notation is still rolled as typed. */
  z.object({
    kind: z.literal('free'),
    notation: z.string().trim().min(1).max(64),
    as: z.literal('hitDie').optional(),
  }),
]);

export const rollMode = z.enum(['normal', 'advantage', 'disadvantage']);
export const rollVisibility = z.enum(['table', 'gm', 'secret']);

export const rollBody = z.object({
  roll: sheetRequest,
  mode: rollMode,
  visibility: rollVisibility,
  /** The game master's target number on a secret Pathfinder roll; refused from a player. */
  dc: z.number().int().min(0).max(60).optional(),
});

/** `<createdAt in ms>_<id>`: the keyset position of the oldest roll the caller already holds. */
export const rollCursor = z.string().regex(/^\d{10,16}_[\w-]{1,40}$/);

export const listRollsQuery = z.object({ after: rollCursor.optional() });
