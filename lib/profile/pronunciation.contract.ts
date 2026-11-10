/**
 * Contract for removing the caller's name-pronunciation clip (redesign audit C1,
 * batch 8). Client-safe. The recording upload is multipart and stays a raw fetch.
 */
import { endpoint } from '@/lib/contract/endpoint';

export const removePronunciationApi = endpoint<{
  res: { pronunciationUrl: null; pronunciationMs: null };
}>()({ method: 'DELETE', path: '/api/profile/pronunciation' });
