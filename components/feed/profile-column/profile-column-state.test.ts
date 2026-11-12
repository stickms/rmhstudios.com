import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/feed-types';
import type { ProfileData } from '@/components/profile/profile-types';
import {
  applyFollow,
  applyMembershipJoined,
  applySavedProfile,
  buildEditInitial,
  canSeeGuestbookTab,
  canSeeLikesTab,
  collectFeedUsers,
  groupPostsByPeriod,
  initialTabForHash,
  profileDisplayUser,
  profileThemeStyle,
  rollbackFollow,
  savedDisplayUser,
} from './profile-column-state';

const profile = {
  id: 'u1',
  name: 'Ana',
  username: 'ana',
  handle: 'ana_k',
  image: '/a.png',
  isVerified: true,
  isAdmin: false,
  createdAt: '2024-01-01',
  bio: null,
  location: null,
  website: null,
  showLikes: false,
  dmPrivacy: 'everyone',
  profileSongSpotifyId: null,
  profileSongTitle: null,
  profileSongArtist: null,
  profileSongPreviewUrl: null,
  profileSongAlbumArt: null,
  followerCount: 3,
  followingCount: 1,
  rmharkCount: 2,
  isFollowing: false,
  isOwnProfile: false,
  coins: 0,
} as ProfileData;

describe('initialTabForHash', () => {
  it('opens the guestbook for #guestbook only', () => {
    expect(initialTabForHash('#guestbook')).toBe('guestbook');
    expect(initialTabForHash('')).toBe('rmharks');
    expect(initialTabForHash('#other')).toBe('rmharks');
  });
});

describe('tab visibility', () => {
  it('likes: own profile or opted in', () => {
    expect(canSeeLikesTab(profile)).toBe(false);
    expect(canSeeLikesTab({ ...profile, showLikes: true })).toBe(true);
    expect(canSeeLikesTab({ ...profile, isOwnProfile: true })).toBe(true);
  });
  it('guestbook: own profile or a mode other than off', () => {
    expect(canSeeGuestbookTab(profile)).toBe(false);
    expect(canSeeGuestbookTab({ ...profile, guestbookMode: 'off' })).toBe(false);
    expect(canSeeGuestbookTab({ ...profile, guestbookMode: 'following' })).toBe(true);
    expect(canSeeGuestbookTab({ ...profile, isOwnProfile: true, guestbookMode: 'off' })).toBe(true);
  });
});

describe('profileThemeStyle', () => {
  it('is undefined without a theme and only sets the accents the theme has', () => {
    expect(profileThemeStyle(profile)).toBeUndefined();
    expect(
      profileThemeStyle({ ...profile, cosmetics: { theme: { id: 't', accent: '#111' } } }),
    ).toEqual({ '--site-accent': '#111' });
  });
});

describe('follow transitions', () => {
  it('apply and rollback are inverses', () => {
    const on = applyFollow(profile, false);
    expect(on).toMatchObject({ isFollowing: true, followerCount: 4 });
    const off = applyFollow(on, true);
    expect(off).toMatchObject({ isFollowing: false, followerCount: 3 });
    expect(rollbackFollow(on, false)).toMatchObject({ isFollowing: false, followerCount: 3 });
    expect(rollbackFollow(off, true)).toMatchObject({ isFollowing: true, followerCount: 4 });
  });
  it('leaves a missing profile alone', () => {
    expect(applyFollow(null, false)).toBeNull();
    expect(rollbackFollow(null, true)).toBeNull();
  });
});

describe('applyMembershipJoined', () => {
  it('counts a new member once', () => {
    const joined = applyMembershipJoined({ ...profile, memberCount: 2 });
    expect(joined).toMatchObject({ isMember: true, memberCount: 3 });
    expect(applyMembershipJoined(joined)).toMatchObject({ isMember: true, memberCount: 3 });
    expect(applyMembershipJoined(profile)).toMatchObject({ memberCount: 1 });
    expect(applyMembershipJoined(null)).toBeNull();
  });
});

describe('applySavedProfile', () => {
  it('merges only the fields that were saved', () => {
    const next = applySavedProfile(profile, { displayName: 'New', bio: 'b' });
    expect(next).toMatchObject({ name: 'New', bio: 'b', handle: 'ana_k', image: '/a.png' });
  });
  it('derives hasCustomAvatar from the avatar path and allows null resets', () => {
    expect(applySavedProfile(profile, { image: '/api/profile/avatar/x' })).toMatchObject({
      image: '/api/profile/avatar/x',
      hasCustomAvatar: true,
    });
    expect(applySavedProfile(profile, { image: null })).toMatchObject({
      image: null,
      hasCustomAvatar: false,
    });
  });
  it('ignores a missing profile', () => {
    expect(applySavedProfile(null, { bio: 'x' })).toBeNull();
  });
});

describe('display users', () => {
  it('profileDisplayUser and savedDisplayUser', () => {
    expect(profileDisplayUser(profile)).toEqual({
      id: 'u1',
      name: 'Ana',
      image: '/a.png',
      username: 'ana',
      handle: 'ana_k',
      isVerified: true,
      isAdmin: false,
    });
    expect(savedDisplayUser(profile, { displayName: 'N', image: null })).toMatchObject({
      name: 'N',
      image: null,
      handle: 'ana_k',
    });
  });
  it('collectFeedUsers takes author, reposter and original author', () => {
    const item = {
      id: 'p',
      user: { id: 'a' },
      repostedBy: { id: 'b' },
      original: { id: 'o', user: { id: 'c' } },
    } as unknown as FeedItem;
    expect(collectFeedUsers([item, { id: 'q' } as FeedItem]).map((u) => u.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('buildEditInitial', () => {
  it('prefers the cached display name/image and defaults the cooldown', () => {
    const initial = buildEditInitial(profile, 'Cached', undefined);
    expect(initial).toMatchObject({ name: 'Cached', image: '/a.png', handleCooldownMs: 0 });
    expect(buildEditInitial({ ...profile, handleCooldownMs: 5 }, null, '/c.png')).toMatchObject({
      name: 'Ana',
      image: '/c.png',
      handleCooldownMs: 5,
    });
  });
});

describe('groupPostsByPeriod', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  const at = (days: number) =>
    ({
      id: `p${days}`,
      createdAt: new Date(now.getTime() - days * 86_400_000).toISOString(),
    }) as FeedItem;

  it('divides a newest-first list into this week, last week, then one heading per month, never reordering', () => {
    const groups = groupPostsByPeriod([at(0), at(3), at(9), at(30), at(33), at(70)], now);
    expect(groups.map((g) => [g.kind, g.items.map((i) => i.id)])).toEqual([
      ['this-week', ['p0', 'p3']],
      ['last-week', ['p9']],
      ['month', ['p30', 'p33']],
      ['month', ['p70']],
    ]);
    expect(groups[2]?.text).toBe('October 2026');
  });

  it('is empty for no posts', () => {
    expect(groupPostsByPeriod([], now)).toEqual([]);
  });
});
