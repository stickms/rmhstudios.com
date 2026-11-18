/** Client calls for the feed's vibe card (kept out of the .tsx: see useeffect-fetch-ratchet). */
import { api } from '@/lib/contract/client';
import { postVibeApi } from '@/lib/feed/rmhark-actions.contract';
import { vibePageApi } from '@/lib/rmhvibe/vibe-page.contract';

export const fetchPostVibe =
  (
    postId: string,
  ) =>
    api(
      postVibeApi,
      {
        params:
          {
            id: postId,
          },
      },
    );

export const fetchVibeRunnable =
  (
    slug: string,
    versionId: string,
  ) =>
    api(
      vibePageApi,
      {
        params:
          {
            slug,
          },
        query:
          {
            versionId,
          },
      },
    );
