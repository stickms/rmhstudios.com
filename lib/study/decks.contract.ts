/**
 * Contracts for /api/study/decks (redesign audit C1). Client-safe: request types
 * come from the zod schemas and response types from `study.server.ts`, both by
 * `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { DeckCard, DeckDetail, DecksList } from '@/lib/study.server';
import type { addCardBody, createDeckBody } from '@/lib/study/decks-schema';

/** Your decks plus popular public decks (signed-out visitors see only public ones). */
export const listDecksApi = endpoint<{ res: DecksList }>()({
  method: 'GET',
  path: '/api/study/decks',
});

/** 201. `generated` is how many AI-seeded cards were created. */
export const createDeckApi = endpoint<{
  body: z.infer<typeof createDeckBody>;
  res: { success: true; id: string; generated: number };
}>()({ method: 'POST', path: '/api/study/decks' });

export const getDeckApi = endpoint<{ res: DeckDetail }>()({
  method: 'GET',
  path: '/api/study/decks/$id',
});

/** 201. The route parses the body by hand (a bad card is a plain 400), so it passes no `body` schema. */
export const addDeckCardApi = endpoint<{
  body: z.infer<typeof addCardBody>;
  res: { success: true; card: DeckCard };
}>()({ method: 'POST', path: '/api/study/decks/$id' });

export const deleteDeckApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/study/decks/$id',
});

/** The viewer's due cards (at most 50). */
export const deckReviewQueueApi = endpoint<{ res: { due: DeckCard[] } }>()({
  method: 'GET',
  path: '/api/study/decks/$id/review',
});

export const cloneDeckApi = endpoint<{
  res: { success: true; id: string; alreadyOwned: boolean };
}>()({ method: 'POST', path: '/api/study/decks/$id/clone' });
