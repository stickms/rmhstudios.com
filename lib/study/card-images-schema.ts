/**
 * Zod schemas for pictures on flashcards (s08-15). Imported by the ROUTES only; the client reaches the same types
 * through `card-images.contract.ts` and `decks.contract.ts` with `import type`.
 */
import { z } from 'zod';
import { CARD_IMAGE_ALT_MAX, CARD_IMAGE_URL_MAX, cardImageProblem } from '@/lib/study/card-images';

/**
 * A picture as a card is saved with it. The description may arrive empty or blank so the server can answer
 * `ALT_REQUIRED` itself (the form never sends one); its length and the address's shape are checked here.
 */
export const cardImageInput = z.object({
  url: z.string().trim().min(1).max(CARD_IMAGE_URL_MAX),
  alt: z.string().max(CARD_IMAGE_ALT_MAX * 2),
});

/** Both sides. `null` removes a picture; absent leaves it (on an edit) or means none (on a new card). */
export const cardPicturesShape = {
  frontImage: cardImageInput.nullable().optional(),
  backImage: cardImageInput.nullable().optional(),
};

/** Refine a card body: the pictures must meet `cardImageProblem` (kind is the body's own, or the stored one on a patch). */
export function addPictureIssue(
  card: {
    kind?: string | undefined;
    frontImage?: { url: string; alt: string } | null | undefined;
    backImage?: { url: string; alt: string } | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const problem = cardImageProblem(card.kind ?? 'basic', card);
  if (problem)
    ctx.addIssue({ code: 'custom', message: `picture-${problem.code.toLowerCase()}`, path: [`${problem.side}Image`] });
}
