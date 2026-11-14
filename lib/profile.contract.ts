/**
 * Contracts for /api/profile (redesign audit C1). Client-safe: types only.
 * Avatar and banner uploads are multipart (`body: FormData`).
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  ProfileLink,
  UpdateProfileInput,
  updateProfileSchema,
} from '@/lib/profile-schema';

/** What PATCH /api/profile answers: the saved profile row (`handle` only when it changed). */
export interface UpdatedProfile {
  handle?: string;
  displayName:
    | string
    | null;
  bio:
    | string
    | null;
  location:
    | string
    | null;
  website:
    | string
    | null;
  links: ProfileLink[];
  tipGoal:
    | number
    | null;
  tipGoalLabel:
    | string
    | null;
  membershipPriceCoins:
    | number
    | null;
  showLikes: boolean;
  dmPrivacy: NonNullable<
    UpdateProfileInput['dmPrivacy']
  >;
  profileSongSpotifyId:
    | string
    | null;
  profileSongTitle:
    | string
    | null;
  profileSongArtist:
    | string
    | null;
  profileSongPreviewUrl:
    | string
    | null;
  profileSongAlbumArt:
    | string
    | null;
}

export const updateProfileApi =
  endpoint<{
    body: z.infer<
      typeof updateProfileSchema
    >;
    res: UpdatedProfile;
  }>()(
    {
      method:
        'PATCH',
      path: '/api/profile',
    },
  );

/** Multipart: `avatar` (one image). Answers the stored avatar URL. */
export const uploadAvatarApi =
  endpoint<{
    body: FormData;
    res: {
      image: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/profile/avatar',
    },
  );

/**
 * Multipart, each image <= 8 MB (`PROFILE_BANNER_MAX_MB`): `banner` is the picture as framed;
 * `original` is the whole picture it was framed from, kept so the crop can be adjusted later;
 * `source=keep` marks a re-crop of the stored banner, whose kept picture stays. The server cuts
 * `banner` to `PROFILE_BANNER_ASPECT` whatever it is sent. Answers the stored banner URL.
 */
export const uploadBannerApi =
  endpoint<{
    body: FormData;
    res: {
      bannerUrl: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/profile/banner',
    },
  );

/**
 * The picture the caller's banner was cut from, as image bytes (not JSON): the kept upload, or
 * the banner itself when none was kept. Same-origin, so the crop canvas can read it wherever the
 * public banner is served from. Read it with `fetch(apiUrl(bannerSourceApi))`. 404 without a banner.
 */
export const bannerSourceApi =
  endpoint<{
    res: Blob;
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/banner-source',
    },
  );

/** Reset to the account picture: removes the custom avatar and answers the avatar now in effect. */
export const removeProfileAvatarApi =
  endpoint<{
    res: {
      image:
        | string
        | null;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/profile/avatar',
    },
  );

export const removeProfileBannerApi =
  endpoint<{
    res: {
      bannerUrl: null;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/profile/banner',
    },
  );
