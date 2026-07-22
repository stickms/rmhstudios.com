import type { ProfileModule } from '@/lib/profile/modules';
import type { UserStatus } from '@/lib/profile/status';

export interface ProfileData {
  id: string;
  name: string | null;
  username: string | null;
  handle: string | null;
  image: string | null;
  isVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  links?: { label: string; url: string }[];
  bannerUrl?: string | null;
  showLikes: boolean;
  dmPrivacy: string;
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
  status?: UserStatus | null;
  modules?: ProfileModule[];
  followerCount: number;
  followingCount: number;
  rmharkCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  handleCooldownMs?: number;
  hasCustomAvatar?: boolean;
  coins: number;
  isOnline?: boolean;
  tipGoal?: number | null;
  tipGoalLabel?: string | null;
  tipsThisMonth?: number;
  membershipPriceCoins?: number | null;
  memberCount?: number;
  isMember?: boolean;
  cosmetics?: {
    nameColor?: { color?: string; gradient?: string };
    avatarFrame?: { color?: string; gradient?: string };
    badge?: { emoji?: string };
    banner?: { gradient?: string };
    pet?: { emoji?: string };
    theme?: {
      id: string;
      accent?: string;
      accentHover?: string;
      accentFg?: string;
      accentDim?: string;
      gradient?: string;
    };
  };
}
