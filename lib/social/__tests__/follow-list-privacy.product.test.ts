import { describe, expect, it } from 'vitest';
import {
  decideFollowListAccess,
  FOLLOW_LIST_VISIBILITIES,
  isFollowListVisibility,
  normalizeFollowListVisibility,
  type FollowListAccessFacts,
} from '@/lib/social/follow-list-privacy';

const base: FollowListAccessFacts = {
  visibility: 'everyone',
  viewerId: 'v',
  ownerId: 'o',
  viewerIsAdmin: false,
  viewerFollowsOwner: false,
  ownerFollowsViewer: false,
};
const decide = (over: Partial<FollowListAccessFacts>) => decideFollowListAccess({ ...base, ...over });

describe('decideFollowListAccess', () => {
  it('everyone: always, signed out included', () => {
    expect(decide({})).toBe(true);
    expect(decide({ viewerId: null })).toBe(true);
  });

  it('mutuals: both directions needed', () => {
    const m = { visibility: 'mutuals' } as const;
    expect(decide({ ...m })).toBe(false);
    expect(decide({ ...m, viewerFollowsOwner: true })).toBe(false);
    expect(decide({ ...m, ownerFollowsViewer: true })).toBe(false);
    expect(decide({ ...m, viewerFollowsOwner: true, ownerFollowsViewer: true })).toBe(true);
  });

  it('mutuals: signed out never qualifies', () => {
    expect(decide({ visibility: 'mutuals', viewerId: null, viewerFollowsOwner: true, ownerFollowsViewer: true })).toBe(
      false,
    );
  });

  it('me: nobody but the owner and admins', () => {
    expect(decide({ visibility: 'me', viewerFollowsOwner: true, ownerFollowsViewer: true })).toBe(false);
    expect(decide({ visibility: 'me', viewerId: null })).toBe(false);
    expect(decide({ visibility: 'me', viewerId: 'o' })).toBe(true);
    expect(decide({ visibility: 'me', viewerIsAdmin: true })).toBe(true);
  });

  it('the owner and admins see every setting', () => {
    for (const visibility of FOLLOW_LIST_VISIBILITIES) {
      expect(decide({ visibility, viewerId: 'o' })).toBe(true);
      expect(decide({ visibility, viewerIsAdmin: true })).toBe(true);
    }
  });
});

describe('the setting', () => {
  it('knows its three values', () => {
    expect([...FOLLOW_LIST_VISIBILITIES]).toEqual(['everyone', 'mutuals', 'me']);
    expect(isFollowListVisibility('mutuals')).toBe(true);
    expect(isFollowListVisibility('nobody')).toBe(false);
    expect(isFollowListVisibility(undefined)).toBe(false);
  });

  it('a missing value is the default, an unknown one fails closed', () => {
    expect(normalizeFollowListVisibility(null)).toBe('everyone');
    expect(normalizeFollowListVisibility(undefined)).toBe('everyone');
    expect(normalizeFollowListVisibility('mutuals')).toBe('mutuals');
    expect(normalizeFollowListVisibility('friends')).toBe('me');
  });
});
