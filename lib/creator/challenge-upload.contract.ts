/**
 * Contracts for the Creator Studio challenge sample / bounce uploads (redesign
 * audit C1, batch 9). Client-safe. Both are multipart: `audio` (<= 8 MB).
 */
import { endpoint } from '@/lib/contract/endpoint';

/** Admin: upload the challenge's sample track. Answers the stored key. */
export const uploadChallengeSampleApi = endpoint<{ body: FormData; res: { key: string } }>()({
  method: 'POST',
  path: '/api/admin/studio-challenges/upload',
});

/** Attach a flip bounce to an entry. Answers the stored key and its URL. */
export const uploadChallengeAudioApi = endpoint<{
  body: FormData;
  res: { key: string; url: string };
}>()({ method: 'POST', path: '/api/studio/challenges/audio' });
