/** Zod schemas for the deck-updates routes. Routes only; the client reaches the types through the contract. */
import { z } from 'zod';
import { MAX_DECK_CARDS } from '@/lib/study/limits';

const id = z.string().min(1).max(64);
const hash = z.string().length(64);

/** One row the member chose in the dialog. */
const item = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('new'),
    sourceCardId: id,
  }),
  z.object({
    type: z.literal('changed'),
    cardId: id,
    expectedHash: hash,
  }),
  z.object({
    type: z.literal('conflict'),
    cardId: id,
    resolution: z.enum(['mine', 'theirs']),
    expectedHash: hash,
  }),
  z.object({
    type: z.literal('removed'),
    cardId: id,
    expectedHash: hash,
  }),
]);

export const applyUpdatesBody = z.object({
  items: z.array(item).min(1).max(MAX_DECK_CARDS),
});
