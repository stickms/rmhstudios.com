/**
 * Contract for removing the caller's name-pronunciation clip (redesign audit C1,
 * batch 8) and for uploading it (multipart, batch 9). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

/** Multipart: `audio` (the clip) and `durationMs`. */
export const uploadPronunciationApi =
  endpoint<{
    body: FormData;
    res: {
      pronunciationUrl:
        | string
        | null;
      pronunciationMs: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/profile/pronunciation',
    },
  );

export const removePronunciationApi =
  endpoint<{
    res: {
      pronunciationUrl: null;
      pronunciationMs: null;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/profile/pronunciation',
    },
  );
