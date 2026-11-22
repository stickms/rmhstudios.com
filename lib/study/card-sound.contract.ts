/**
 * Contracts for sound on flashcards (s10-02). Client-safe: types only, no zod at runtime.
 */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * Multipart: `audio` (the recording or file) and `durationMs` (1 to 15,000). The bytes decide the type (WebM, Ogg,
 * MP4/M4A or AAC); at most 512 KB. Stored privately and not yet part of a card: save the card with
 * `{ url, transcript, durationMs }` to attach it. Unattached uploads are refused after a day.
 */
export const uploadCardSoundApi = endpoint<{
  body: FormData;
  res: {
    url: string;
    durationMs: number;
    bytes: number;
  };
}>()({
  method: 'POST',
  path: '/api/study/card-sound',
});
