/**
 * RMH Music's social reads as route-seeded queries (redesign audit B4): the Friends and sharing
 * page's loader prefetches them, and the components read them with `useQuery`. The switches share
 * their key with the Privacy page's group (`MusicPrivacyControls`), so a change in one place is the
 * same cached value in the other.
 */
import { contractQuery } from '@/lib/route/route-query';
import type { FriendsLimit } from '@/lib/rmhmusic/learn/social/friends';
import { friendsApi } from './friends.contract';
import { musicSocialApi } from './social.contract';

export const MUSIC_SOCIAL_KEY =
  [
    'rmhmusic',
    'social',
  ] as const;

export const musicSocialQuery =
  () =>
    contractQuery(
      MUSIC_SOCIAL_KEY,
      musicSocialApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

export const musicFriendsQuery =
  (
    limit: FriendsLimit,
  ) =>
    contractQuery(
      [
        'rmhmusic',
        'friends',
        limit,
      ],
      friendsApi,
      {
        query:
          {
            limit,
          },
      },
      {
        staleTime: 30_000,
      },
    );
