/**
 * The friends-online widget translates the one activity kind the presence
 * service reports (`rmhtube`) through a literal `t()` call, and shows the label
 * the server sent for any other kind, never a key built from the kind.
 */
import { describe, expect, it } from 'vitest';
import { recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { friendActivityLabel } from '@/components/feed/activity-labels';

describe('friend activity label', () => {
  it('translates rmhtube under activity-rmhtube in the feed namespace', () => {
    const { t, calls } = recordingT();
    expect(friendActivityLabel(t, { kind: 'rmhtube', label: 'Watching together' })).toBe('Watching together');
    expect(calls).toEqual([{ key: 'activity-rmhtube', ns: 'feed', defaultValue: 'Watching together' }]);
  });

  it('shows the server label for a kind it does not know', () => {
    const { t, calls } = recordingT();
    expect(friendActivityLabel(t, { kind: 'game', label: 'Playing Chess' })).toBe('Playing Chess');
    expect(calls).toEqual([]);
  });
});
