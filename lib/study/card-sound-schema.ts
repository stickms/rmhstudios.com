/**
 * Zod schemas for sound on flashcards (s10-02). Imported by the ROUTES only; the client reaches the same types
 * through `card-sound.contract.ts` and `decks.contract.ts` with `import type`.
 */
import { z } from 'zod';
import {
  CARD_SOUND_MAX_MS,
  CARD_SOUND_TEXT_MAX,
  CARD_SOUND_URL_MAX,
  cardSoundProblem,
  type CardSound,
} from '@/lib/study/card-sound';

/**
 * A sound as a card is saved with it. The transcript may arrive empty or blank so the server can answer for it
 * itself (the form never sends one); its length and the address's shape are checked here and again on save.
 */
export const cardSoundInput = z.object({
  url: z.string().trim().min(1).max(CARD_SOUND_URL_MAX),
  transcript: z.string().max(CARD_SOUND_TEXT_MAX * 2),
  durationMs: z.number().int().min(1).max(CARD_SOUND_MAX_MS),
});

/** Both sides. `null` removes a sound; absent leaves it (on an edit) or means none (on a new card). */
export const cardSoundsShape = {
  frontSound: cardSoundInput.nullable().optional(),
  backSound: cardSoundInput.nullable().optional(),
};

/** Refine a card body: the sounds must meet `cardSoundProblem` (kind is the body's own, or the stored one on a patch). */
export function addSoundIssue(
  card: {
    kind?: string | undefined;
    frontSound?: CardSound | null | undefined;
    backSound?: CardSound | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const problem = cardSoundProblem(card.kind ?? 'basic', card);
  if (problem)
    ctx.addIssue({ code: 'custom', message: `sound-${problem.code.toLowerCase()}`, path: [`${problem.side}Sound`] });
}
