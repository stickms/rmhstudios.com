import { describe, it, expect } from 'vitest';
import {
  joinTargetFor,
  contextVerb,
  presencePrivacySchema,
  type PresenceActivity,
} from '@/lib/presence-types';

describe('joinTargetFor', () => {
  it('returns null for an idle friend', () => {
    expect(joinTargetFor(null)).toBeNull();
  });

  it('routes each activity kind to the right surface', () => {
    const cases: [PresenceActivity, string][] = [
      [{ kind: 'game', gameId: 'void-breaker', label: 'x' }, '/arcade/void-breaker'],
      [{ kind: 'music_room', roomId: 'ABC', label: 'x' }, '/rmhmusic/ABC'],
      [{ kind: 'tube_room', roomId: 'r1', label: 'x' }, '/rmhtube/r1'],
      [{ kind: 'space', spaceId: 's9', label: 'x' }, '/spaces/s9'],
    ];
    for (const [activity, href] of cases) {
      expect(joinTargetFor(activity)?.href).toBe(href);
    }
  });
});

describe('contextVerb', () => {
  it('uses the right verb per kind', () => {
    expect(contextVerb('game')).toBe('Join');
    expect(contextVerb('space')).toBe('Hop in');
    expect(contextVerb('music_room')).toBe('Watch');
    expect(contextVerb('tube_room')).toBe('Watch');
  });
});

describe('presencePrivacySchema', () => {
  it('accepts valid visibility + detail', () => {
    expect(presencePrivacySchema.safeParse({ presenceVisibility: 'nobody', presenceDetail: false }).success).toBe(true);
    expect(presencePrivacySchema.safeParse({}).success).toBe(true); // partial
  });

  it('rejects an unknown visibility', () => {
    expect(presencePrivacySchema.safeParse({ presenceVisibility: 'everyone' }).success).toBe(false);
  });
});
