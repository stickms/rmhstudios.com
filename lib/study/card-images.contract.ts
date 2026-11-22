/**
 * Contracts for pictures on flashcards (s08-15). Client-safe: types only, no zod at runtime.
 */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * Multipart, one `image` per request. Stored through the `flashcard` ingest surface (JPEG, PNG or WebP, 5 MB) but not
 * yet part of a card: save the card with `{ url, alt }` to attach it. Unattached uploads are reclaimed after a day.
 */
export const uploadCardImageApi = endpoint<{
  body: FormData;
  res: {
    url: string;
    width: number;
    height: number;
  };
}>()({
  method: 'POST',
  path: '/api/study/card-images',
});
