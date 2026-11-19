/**
 * The roster endpoints: characters saved to the signed-in account.
 * Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { saveCharacterBody } from './characters-schema';
import type { Character } from './types';

/** Every character on the account, newest edit first. */
export const listCharactersApi = endpoint<{ res: { characters: Character[] } }>()({
  method: 'GET',
  path: '/api/rmhcharacters/characters',
});

/** Create or replace one character (the id is the character's own). 409 when the id belongs to another account. */
export const saveCharacterApi = endpoint<{
  params: { id: string };
  body: z.infer<typeof saveCharacterBody>;
  res: { updatedAt: number };
}>()({ method: 'PUT', path: '/api/rmhcharacters/characters/$id' });

export const deleteCharacterApi = endpoint<{
  params: { id: string };
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/rmhcharacters/characters/$id' });
