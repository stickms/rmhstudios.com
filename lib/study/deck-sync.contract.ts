/** Contracts for a copied deck's updates (client-safe: types only, by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { DeckDiff } from '@/lib/study/deck-sync';
import type { ApplyResult, DeckUpdatesDetail } from '@/lib/study/deck-sync.server';
import type { applyUpdatesBody } from '@/lib/study/deck-sync-schema';

/** Owner of the copy only; 404 otherwise. `state` says whether `diff` is real. */
export const deckUpdatesApi = endpoint<{
  res: {
    state: DeckUpdatesDetail['state'];
    diff: DeckDiff;
  };
}>()({
  method: 'GET',
  path: '/api/study/decks/$id/updates',
});

/** Apply the chosen rows. Skipped rows (stale, gone, over the card cap) are reported, never an error. */
export const applyDeckUpdatesApi = endpoint<{
  body: z.infer<typeof applyUpdatesBody>;
  res: {
    success: true;
  } & ApplyResult;
}>()({
  method: 'POST',
  path: '/api/study/decks/$id/updates',
});

/** One-time link for a copy made before origins were recorded. */
export const linkOriginalApi = endpoint<{
  res: {
    success: true;
    linked: number;
    unmatched: number;
  };
}>()({
  method: 'POST',
  path: '/api/study/decks/$id/link-original',
});
