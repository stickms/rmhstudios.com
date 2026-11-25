/** Zod schemas for the party endpoints. Server-side by use; the contract imports types only. */
import { z } from 'zod';
import {
  PARTY_EXTRA_NAME_MAX,
  PARTY_MAX_EXTRAS,
  PARTY_MAX_MEMBERS,
  PARTY_MAX_ORDER,
  PARTY_NAME_MAX,
  PARTY_ORDER_VALUE_MAX,
} from './party-limits';

const partyName = z.string().trim().min(1).max(PARTY_NAME_MAX);
const system = z.enum(['dnd5e', 'pf2e']);
const idParam = z.string().min(1).max(100);

export const partyIdParams = z.object({ id: idParam });
export const partyMemberParams = z.object({ id: idParam, userId: idParam });

export const createPartyBody = z.object({ name: partyName, system });
export const renamePartyBody = z.object({ name: partyName });

/** The invite code is 16 URL-safe characters; anything else cannot be a code and is refused before a lookup. */
export const inviteCode = z.string().regex(/^[\w-]{8,16}$/);
export const joinPartyBody = z.object({ code: inviteCode, characterId: idParam, sheetShared: z.boolean() });
export const joinPreviewQuery = z.object({ code: inviteCode });
export const swapCharacterBody = z.object({ characterId: idParam });
export const sharingBody = z.object({ sheetShared: z.boolean() });

const orderValue = z.number().int().min(-PARTY_ORDER_VALUE_MAX).max(PARTY_ORDER_VALUE_MAX);
const entryId = z.string().min(1).max(40);

/** One stored line of the turn order: a party member (named from the membership) or a named extra. */
export const turnEntry = z.discriminatedUnion('kind', [
  z.object({ id: entryId, kind: z.literal('member'), userId: idParam, value: orderValue }),
  z.object({
    id: entryId,
    kind: z.literal('extra'),
    name: z.string().trim().min(1).max(PARTY_EXTRA_NAME_MAX),
    value: orderValue,
  }),
]);

const version = z.number().int().min(0);

export const writeOrderBody = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set'),
    version,
    initiative: z.array(turnEntry).max(PARTY_MAX_ORDER),
    turnIndex: z.number().int().min(0).max(PARTY_MAX_ORDER),
  }),
  z.object({ op: z.literal('advance'), version }),
]);

/** What a stored order must satisfy beyond its shape: no repeated id, at most the party's seats and the extras' cap. */
export function orderWithinLimits(entries: readonly z.infer<typeof turnEntry>[]): boolean {
  if (new Set(entries.map((e) => e.id)).size !== entries.length) return false;
  if (entries.filter((e) => e.kind === 'extra').length > PARTY_MAX_EXTRAS) return false;
  return entries.filter((e) => e.kind === 'member').length <= PARTY_MAX_MEMBERS;
}
