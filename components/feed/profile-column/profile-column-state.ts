import type { CSSProperties } from 'react';
import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import type { ProfileData } from '@/components/profile/profile-types';
import type { ProfileEditInitial, SavedProfileData } from '../profile-edit/profile-edit-state';

/**
 * Pure state helpers for the profile column: tab ids, which tabs a viewer may
 * see, the optimistic follow / membership / saved-profile transitions, the
 * premium-theme override and the edit form's initial values. No React state,
 * no I/O.
 */

export type ProfileTab = 'rmharks' | 'likes' | 'achievements' | 'guestbook' | 'shelves' | 'kudos';

/** One page of a profile's RMHarks or likes from the API. */
export interface ProfilePostsPage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** `/u/<id>#guestbook` (the guestbook notification's link) opens that tab. */
export function initialTabForHash(hash: string): ProfileTab {
  return hash === '#guestbook' ? 'guestbook' : 'rmharks';
}

export function canSeeLikesTab(profile: ProfileData): boolean {
  return profile.isOwnProfile || profile.showLikes;
}

export function canSeeGuestbookTab(profile: ProfileData): boolean {
  return profile.isOwnProfile || (!!profile.guestbookMode && profile.guestbookMode !== 'off');
}

/**
 * An equipped premium theme recolors this profile by overriding the accent CSS
 * variables for the column's subtree (follow button, links, name, tab indicator,
 * badges). Its gradient also backs the profile header when no banner is equipped.
 */
export function profileThemeStyle(profile: ProfileData): CSSProperties | undefined {
  const theme = profile.cosmetics?.theme;
  if (!theme) return undefined;
  return {
    ...(theme.accent ? { '--site-accent': theme.accent } : {}),
    ...(theme.accentHover ? { '--site-accent-hover': theme.accentHover } : {}),
    ...(theme.accentFg ? { '--site-accent-fg': theme.accentFg } : {}),
    ...(theme.accentDim ? { '--site-accent-dim': theme.accentDim } : {}),
  } as CSSProperties;
}

/** The user-display-cache record for a loaded profile. */
export function profileDisplayUser(p: ProfileData): FeedItemUser {
  return {
    id: p.id,
    name: p.name,
    image: p.image,
    username: p.username,
    handle: p.handle,
    isVerified: p.isVerified,
    isAdmin: p.isAdmin,
  };
}

/** Every user a page of posts mentions (author, reposter, original author). */
export function collectFeedUsers(items: FeedItem[]): FeedItemUser[] {
  const users: FeedItemUser[] = [];
  for (const item of items) {
    if (item.user) users.push(item.user);
    if (item.repostedBy) users.push(item.repostedBy);
    if (item.original?.user) users.push(item.original.user);
  }
  return users;
}

/** Optimistic follow flip, from the follow state seen when the tap happened. */
export function applyFollow(prev: ProfileData | null, wasFollowing: boolean): ProfileData | null {
  return prev
    ? {
        ...prev,
        isFollowing: !wasFollowing,
        followerCount: prev.followerCount + (wasFollowing ? -1 : 1),
      }
    : prev;
}

/** Undo of {@link applyFollow}. */
export function rollbackFollow(
  prev: ProfileData | null,
  wasFollowing: boolean,
): ProfileData | null {
  return prev
    ? {
        ...prev,
        isFollowing: wasFollowing,
        followerCount: prev.followerCount + (wasFollowing ? 1 : -1),
      }
    : prev;
}

export function applyMembershipJoined(prev: ProfileData | null): ProfileData | null {
  return prev
    ? {
        ...prev,
        isMember: true,
        memberCount: (prev.memberCount ?? 0) + (prev.isMember ? 0 : 1),
      }
    : prev;
}

/** Merge what the edit modal saved into the loaded profile. */
export function applySavedProfile(
  prev: ProfileData | null,
  data: SavedProfileData,
): ProfileData | null {
  if (!prev) return prev;
  return {
    ...prev,
    ...(data.displayName !== undefined ? { name: data.displayName } : {}),
    ...(data.image !== undefined
      ? {
          image: data.image,
          hasCustomAvatar: !!data.image?.startsWith('/api/profile/avatar/'),
        }
      : {}),
    ...(data.handle !== undefined ? { handle: data.handle } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.website !== undefined ? { website: data.website } : {}),
    ...(data.links !== undefined ? { links: data.links } : {}),
    ...(data.bannerUrl !== undefined ? { bannerUrl: data.bannerUrl } : {}),
    ...(data.membershipPriceCoins !== undefined
      ? { membershipPriceCoins: data.membershipPriceCoins }
      : {}),
    ...(data.tipGoal !== undefined ? { tipGoal: data.tipGoal } : {}),
    ...(data.tipGoalLabel !== undefined ? { tipGoalLabel: data.tipGoalLabel } : {}),
    ...(data.showLikes !== undefined ? { showLikes: data.showLikes } : {}),
    ...(data.dmPrivacy !== undefined ? { dmPrivacy: data.dmPrivacy } : {}),
    ...(data.profileSongSpotifyId !== undefined
      ? { profileSongSpotifyId: data.profileSongSpotifyId }
      : {}),
    ...(data.profileSongTitle !== undefined ? { profileSongTitle: data.profileSongTitle } : {}),
    ...(data.profileSongArtist !== undefined ? { profileSongArtist: data.profileSongArtist } : {}),
    ...(data.profileSongPreviewUrl !== undefined
      ? { profileSongPreviewUrl: data.profileSongPreviewUrl }
      : {}),
    ...(data.profileSongAlbumArt !== undefined
      ? { profileSongAlbumArt: data.profileSongAlbumArt }
      : {}),
  };
}

/** The user-display-cache record to force after a save (a reset avatar is intentionally null). */
export function savedDisplayUser(profile: ProfileData, data: SavedProfileData): FeedItemUser {
  return {
    id: profile.id,
    name: data.displayName !== undefined ? data.displayName : profile.name,
    image: data.image !== undefined ? data.image : profile.image,
    username: profile.username,
    handle: data.handle !== undefined ? data.handle : profile.handle,
    isVerified: profile.isVerified,
    isAdmin: profile.isAdmin,
  };
}

export function buildEditInitial(
  profile: ProfileData,
  displayName: string | null | undefined,
  displayImage: string | null | undefined,
): ProfileEditInitial {
  return {
    handle: profile.handle,
    handleCooldownMs: profile.handleCooldownMs ?? 0,
    name: displayName ?? profile.name,
    image: displayImage ?? profile.image,
    hasCustomAvatar: profile.hasCustomAvatar,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    links: profile.links,
    bannerUrl: profile.bannerUrl,
    showLikes: profile.showLikes,
    dmPrivacy: profile.dmPrivacy,
    tipGoal: profile.tipGoal,
    tipGoalLabel: profile.tipGoalLabel,
    membershipPriceCoins: profile.membershipPriceCoins,
    profileSongSpotifyId: profile.profileSongSpotifyId,
    profileSongTitle: profile.profileSongTitle,
    profileSongArtist: profile.profileSongArtist,
    profileSongPreviewUrl: profile.profileSongPreviewUrl,
    profileSongAlbumArt: profile.profileSongAlbumArt,
  };
}
