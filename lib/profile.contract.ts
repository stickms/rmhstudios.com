/**
 * Contracts for /api/profile (redesign audit C1). Client-safe: types only.
 * Avatar and banner uploads are multipart and stay raw calls.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ProfileLink, UpdateProfileInput, updateProfileSchema } from '@/lib/profile-schema';

/** What PATCH /api/profile answers: the saved profile row (`handle` only when it changed). */
export interface UpdatedProfile {
  handle?: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  links: ProfileLink[];
  tipGoal: number | null;
  tipGoalLabel: string | null;
  membershipPriceCoins: number | null;
  showLikes: boolean;
  dmPrivacy: NonNullable<UpdateProfileInput['dmPrivacy']>;
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
}

export const updateProfileApi = endpoint<{
  body: z.infer<typeof updateProfileSchema>;
  res: UpdatedProfile;
}>()({ method: 'PATCH', path: '/api/profile' });

export const removeProfileBannerApi = endpoint<{ res: { bannerUrl: null } }>()({
  method: 'DELETE',
  path: '/api/profile/banner',
});
