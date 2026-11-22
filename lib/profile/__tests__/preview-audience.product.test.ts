/** The described follower and mutual audiences (sprint 10 08), for each value of each setting. Pure. */
import { describe, expect, it } from 'vitest';
import { HANDLE_REGEX } from '@/lib/handle';
import {
  PREVIEW_STRANGER_ID,
  describeAudience,
  isPreviewAudience,
  isPreviewStrangerId,
  type AudienceSettings,
  type PreviewRowId,
} from '@/lib/profile/preview';
import { inPresenceAudience } from '@/lib/profile/audience';

const BASE: AudienceSettings = {
  presenceVisibility: 'mutuals',
  presenceDetail: true,
  followListVisibility: 'everyone',
  showLikes: false,
  guestbookMode: 'off',
  shelvesPublic: false,
  leaderboardHidden: false,
};

const visible = (rows: ReturnType<typeof describeAudience>, id: PreviewRowId): boolean => {
  const row = rows.find((r) => r.id === id);
  expect(row, id).toBeDefined();
  return row?.visible ?? false;
};

describe('the stranger id', () => {
  it('can be no member: it is not a handle and not shaped like a cuid', () => {
    expect(HANDLE_REGEX.test(PREVIEW_STRANGER_ID)).toBe(false);
    expect(PREVIEW_STRANGER_ID).toContain(':');
    expect(/^c[a-z0-9]{20,}$/.test(PREVIEW_STRANGER_ID)).toBe(false);
    expect(isPreviewStrangerId(PREVIEW_STRANGER_ID)).toBe(true);
    expect(isPreviewStrangerId('someone')).toBe(false);
  });

  it('knows the two computed audiences', () => {
    expect(isPreviewAudience('signed-out')).toBe(true);
    expect(isPreviewAudience('stranger')).toBe(true);
    expect(isPreviewAudience('follower')).toBe(false);
  });
});

describe('presence', () => {
  it.each([
    ['followers', 'follower', true],
    ['followers', 'mutual', true],
    ['mutuals', 'follower', false],
    ['mutuals', 'mutual', true],
    ['nobody', 'follower', false],
    ['nobody', 'mutual', false],
  ] as const)('%s: %s sees it = %s', (presenceVisibility, audience, expected) => {
    const rows = describeAudience(audience, { ...BASE, presenceVisibility });
    expect(visible(rows, 'presence')).toBe(expected);
  });

  it('agrees with the pure decision the profile reader uses', () => {
    for (const visibility of ['followers', 'mutuals', 'nobody']) {
      for (const mutual of [false, true]) {
        const decided = inPresenceAudience({
          visibility,
          isOwnProfile: false,
          hasViewer: true,
          viewerFollowsOwner: true,
          ownerFollowsViewer: mutual,
        });
        const rows = describeAudience(mutual ? 'mutual' : 'follower', { ...BASE, presenceVisibility: visibility });
        expect(visible(rows, 'presence')).toBe(decided);
      }
    }
  });

  it('a signed-out visitor, or a viewer who does not follow, is never in the audience', () => {
    for (const visibility of ['followers', 'mutuals', 'nobody']) {
      expect(
        inPresenceAudience({
          visibility,
          isOwnProfile: false,
          hasViewer: false,
          viewerFollowsOwner: false,
          ownerFollowsViewer: false,
        }),
      ).toBe(false);
      expect(
        inPresenceAudience({
          visibility,
          isOwnProfile: false,
          hasViewer: true,
          viewerFollowsOwner: false,
          ownerFollowsViewer: true,
        }),
      ).toBe(false);
    }
  });

  it('the activity line needs the presence audience and activity detail on', () => {
    const on = describeAudience('mutual', { ...BASE, presenceVisibility: 'followers', presenceDetail: true });
    const off = describeAudience('mutual', { ...BASE, presenceVisibility: 'followers', presenceDetail: false });
    const outside = describeAudience('follower', { ...BASE, presenceVisibility: 'nobody', presenceDetail: true });
    expect(visible(on, 'activity')).toBe(true);
    expect(visible(off, 'activity')).toBe(false);
    expect(visible(outside, 'activity')).toBe(false);
  });
});

describe('follow lists', () => {
  it.each([
    ['everyone', 'follower', true],
    ['everyone', 'mutual', true],
    ['mutuals', 'follower', false],
    ['mutuals', 'mutual', true],
    ['me', 'follower', false],
    ['me', 'mutual', false],
  ] as const)('%s: %s sees the lists = %s', (followListVisibility, audience, expected) => {
    expect(visible(describeAudience(audience, { ...BASE, followListVisibility }), 'follow-lists')).toBe(expected);
  });
});

describe('likes, guestbook, shelves and boards', () => {
  it('likes follow the owner switch', () => {
    expect(visible(describeAudience('follower', { ...BASE, showLikes: true }), 'likes')).toBe(true);
    expect(visible(describeAudience('follower', { ...BASE, showLikes: false }), 'likes')).toBe(false);
  });

  it.each([
    ['off', false],
    ['following', true],
    ['everyone', true],
  ] as const)('guestbook %s is visible = %s', (guestbookMode, expected) => {
    expect(visible(describeAudience('mutual', { ...BASE, guestbookMode }), 'guestbook')).toBe(expected);
  });

  it('shelves are visible only when one is public, and a board row says whether the member is listed', () => {
    expect(visible(describeAudience('follower', { ...BASE, shelvesPublic: true }), 'shelves')).toBe(true);
    expect(visible(describeAudience('follower', { ...BASE, shelvesPublic: false }), 'shelves')).toBe(false);
    expect(visible(describeAudience('follower', { ...BASE, leaderboardHidden: true }), 'leaderboards')).toBe(false);
    expect(visible(describeAudience('follower', { ...BASE, leaderboardHidden: false }), 'leaderboards')).toBe(true);
  });

  it('every row names the setting that controls it', () => {
    for (const row of describeAudience('follower', BASE)) {
      expect(['profile', 'privacy', 'reading', 'none']).toContain(row.control);
    }
  });
});
