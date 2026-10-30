import { describe, expect, it } from 'vitest';
import {
  PLAYTIME_PRIVACY_VALUES,
  canViewPlaytime,
  isPlaytimePrivacy,
  shouldShowNotice,
  type PlaytimePrivacy,
} from '@/lib/playtime/privacy';

const ctx = (over: Partial<Parameters<typeof canViewPlaytime>[1]> = {}) => ({
  viewerId: 'viewer',
  ownerId: 'owner',
  viewerFollowsOwner: false,
  ...over,
});

describe('canViewPlaytime', () => {
  it.each<[PlaytimePrivacy, boolean, boolean]>([
    // setting, viewerFollowsOwner, expected for a signed-in stranger/follower
    ['public', false, true],
    ['public', true, true],
    ['followers', false, false],
    ['followers', true, true],
    ['private', false, false],
    ['private', true, false],
  ])('%s, follows=%s -> %s', (setting, follows, expected) => {
    expect(canViewPlaytime(setting, ctx({ viewerFollowsOwner: follows }))).toBe(expected);
  });

  it('always lets the owner see their own, whatever the setting', () => {
    for (const s of PLAYTIME_PRIVACY_VALUES) {
      expect(canViewPlaytime(s, ctx({ viewerId: 'owner' }))).toBe(true);
    }
  });

  it('never shows anyone to a signed-out viewer, even when public', () => {
    for (const s of PLAYTIME_PRIVACY_VALUES) {
      expect(canViewPlaytime(s, ctx({ viewerId: null, viewerFollowsOwner: true }))).toBe(false);
    }
  });
});

describe('isPlaytimePrivacy', () => {
  it('accepts the three values and rejects anything else', () => {
    expect(PLAYTIME_PRIVACY_VALUES).toEqual(['public', 'followers', 'private']);
    expect(isPlaytimePrivacy('public')).toBe(true);
    expect(isPlaytimePrivacy('following')).toBe(false);
    expect(isPlaytimePrivacy(null)).toBe(false);
  });
});

describe('shouldShowNotice', () => {
  const base = { signedIn: true, noticeDismissed: false, privacy: 'public' as PlaytimePrivacy };

  it('shows once to a signed-in user whose playtime is public and who has not dismissed it', () => {
    expect(shouldShowNotice(base)).toBe(true);
  });

  it('never shows to a signed-out visitor or after dismissal', () => {
    expect(shouldShowNotice({ ...base, signedIn: false })).toBe(false);
    expect(shouldShowNotice({ ...base, noticeDismissed: true })).toBe(false);
  });

  it('does not tell someone their playtime is visible when they already narrowed it', () => {
    expect(shouldShowNotice({ ...base, privacy: 'followers' })).toBe(false);
    expect(shouldShowNotice({ ...base, privacy: 'private' })).toBe(false);
  });
});
