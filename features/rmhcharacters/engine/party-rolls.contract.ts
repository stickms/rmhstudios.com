/**
 * The table-roll endpoints (RMHCharacters parties, sprint 12 feature 01). Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PartyRoll } from './party-rolls';
import type { listRollsQuery, rollBody } from './party-rolls-schema';

export type { PartyRoll };

export interface PartyRollList {
  /** The newest rolls the viewer may see, newest first. */
  rolls: PartyRoll[];
  /** Pass as `after` for the next older page; `null` when there is none. */
  next: string | null;
  /** The character the caller brought to this party, so the sheet can be opened from here. */
  mine: { characterId: string | null };
}

/** The log of the party, members only (404 for anyone else). `after` is the keyset cursor of an older page. */
export const listPartyRollsApi = endpoint<{
  query: z.infer<typeof listRollsQuery>;
  res: PartyRollList;
}>()({ method: 'GET', path: '/api/rmhcharacters/parties/$id/rolls' });

/** Roll for the table: the server computes the modifier from the caller's own character and rolls. */
export const rollForPartyApi = endpoint<{
  body: z.infer<typeof rollBody>;
  res: PartyRoll;
}>()({ method: 'POST', path: '/api/rmhcharacters/parties/$id/rolls' });
