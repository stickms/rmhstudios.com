/** Client calls for the Vibes Discord Activity (kept out of the .tsx: see useeffect-fetch-ratchet). */
import { api } from '@/lib/contract/client';
import {
  vibeGalleryApi,
  vibeLaunchApi,
  vibePageApi,
} from '@/lib/rmhvibe/vibe-page.contract';

export const fetchVibeGallery =
  (query: {
    q?: string;
    cursor?: string;
  }) =>
    api(
      vibeGalleryApi,
      {
        query,
      },
    );

export const fetchChannelLaunch =
  (
    channelId: string,
  ) =>
    api(
      vibeLaunchApi,
      {
        query:
          {
            channelId,
          },
      },
    ).then(
      (
        r,
      ) =>
        r.slug,
    );

export const fetchVibePage =
  (
    slug: string,
  ) =>
    api(
      vibePageApi,
      {
        params:
          {
            slug,
          },
        query:
          {},
      },
    );
