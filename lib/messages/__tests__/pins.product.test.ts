import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_PIN_LIMIT,
  chatIdOfDmScope,
  dmScopeKey,
  isMutedMark,
  marksOf,
  mergePinnedFirst,
} from '@/lib/messages/pins';

const row = (id: string, lastMessageAt: string) => ({ id, lastMessageAt });

describe('pin scope keys', () => {
  it('round-trips a direct conversation and rejects every other scope', () => {
    expect(CONVERSATION_PIN_LIMIT).toBe(5);
    expect(dmScopeKey('c1')).toBe('dm:c1');
    expect(chatIdOfDmScope('dm:c1')).toBe('c1');
    expect(chatIdOfDmScope('group:g1')).toBeNull();
    expect(chatIdOfDmScope('dm:')).toBeNull();
  });
});

describe('the Muted mark', () => {
  const now = new Date('2026-12-01T12:00:00Z');
  it('is on for a mute in force and for mentions only', () => {
    expect(isMutedMark({ muteUntil: new Date('2026-12-02T00:00:00Z'), mentionsOnly: false }, now)).toBe(true);
    expect(isMutedMark({ muteUntil: null, mentionsOnly: true }, now)).toBe(true);
  });
  it('is off with no row, no mute, or an expired mute', () => {
    expect(isMutedMark(null, now)).toBe(false);
    expect(isMutedMark({ muteUntil: null, mentionsOnly: false }, now)).toBe(false);
    expect(isMutedMark({ muteUntil: new Date('2026-11-30T00:00:00Z'), mentionsOnly: false }, now)).toBe(false);
  });
  it('gives both flags together', () => {
    expect(marksOf({ muteUntil: null, mentionsOnly: true, pinned: true }, now)).toEqual({ pinned: true, muted: true });
    expect(marksOf(undefined, now)).toEqual({ pinned: false, muted: false });
  });
});

describe('mergePinnedFirst', () => {
  it('puts pinned rows first, newest message first, then the page in its own order', () => {
    const pinned = [row('p1', '2026-01-01T00:00:00Z'), row('p2', '2026-02-01T00:00:00Z')];
    const page = [row('a', '2026-12-03T00:00:00Z'), row('b', '2026-12-02T00:00:00Z')];
    expect(mergePinnedFirst(pinned, page).map((r) => r.id)).toEqual(['p2', 'p1', 'a', 'b']);
  });
  it('shows a row that is in both once, in the pinned block', () => {
    const merged = mergePinnedFirst(
      [row('x', '2026-01-01T00:00:00Z')],
      [row('a', '2026-12-03T00:00:00Z'), row('x', '2026-01-01T00:00:00Z')],
    );
    expect(merged.map((r) => r.id)).toEqual(['x', 'a']);
  });
  it('is the page itself with no pins', () => {
    const page = [row('a', '2026-12-03T00:00:00Z')];
    expect(mergePinnedFirst([], page)).toEqual(page);
  });
});
