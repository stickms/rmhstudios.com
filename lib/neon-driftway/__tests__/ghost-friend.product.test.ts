/**
 * s12-03: the ghost switch has four modes, old stored values stay valid, and the friend is remembered per level.
 * Pure: storage is a stand-in, no DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGhostQuery } from '@/lib/game/replay-schema';
import {
  GHOST_MODES,
  nextGhostMode,
  parseFriendMemory,
  parseGhostMode,
  readGhostFriend,
  readGhostMode,
  writeGhostFriend,
  writeGhostMode,
} from '@/lib/neon-driftway/ghost';

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

describe('ghost mode cycle', () => {
  it('cycles off, your best, world #1, a friend and back', () => {
    expect(GHOST_MODES).toEqual(['off', 'pb', 'top', 'friend']);
    expect(nextGhostMode('off')).toBe('pb');
    expect(nextGhostMode('pb')).toBe('top');
    expect(nextGhostMode('top')).toBe('friend');
    expect(nextGhostMode('friend')).toBe('off');
  });

  it('keeps every earlier stored value valid and falls back to your best', () => {
    for (const mode of ['off', 'pb', 'top', 'friend'] as const) expect(parseGhostMode(mode)).toBe(mode);
    expect(parseGhostMode(null)).toBe('pb');
    expect(parseGhostMode('world')).toBe('pb');
  });
});

describe('stored choices', () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = stubStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stores the mode under the existing key', () => {
    writeGhostMode('friend');
    expect(data.get('ndw-ghost-mode')).toBe('friend');
    expect(readGhostMode()).toBe('friend');
    data.set('ndw-ghost-mode', 'top');
    expect(readGhostMode()).toBe('top');
  });

  it('remembers a friend per level, one level never overwriting another', () => {
    writeGhostFriend(1, { userId: 'ada', name: 'Ada' });
    writeGhostFriend(3, { userId: 'bo', name: 'Bo' });
    expect(readGhostFriend(1)).toEqual({ userId: 'ada', name: 'Ada' });
    expect(readGhostFriend(2)).toBeNull();
    expect(readGhostFriend(3)).toEqual({ userId: 'bo', name: 'Bo' });
    writeGhostFriend(1, { userId: 'cy', name: 'Cy' });
    expect(readGhostFriend(1)?.userId).toBe('cy');
    expect(readGhostFriend(3)?.userId).toBe('bo');
  });

  it('forgets one level without touching the rest', () => {
    writeGhostFriend(1, { userId: 'ada', name: 'Ada' });
    writeGhostFriend(2, { userId: 'bo', name: 'Bo' });
    writeGhostFriend(1, null);
    expect(readGhostFriend(1)).toBeNull();
    expect(readGhostFriend(2)?.userId).toBe('bo');
  });

  it('reads nothing from a damaged value, and never throws', () => {
    data.set('ndw-ghost-friend', '{not json');
    expect(readGhostFriend(1)).toBeNull();
    data.set('ndw-ghost-friend', JSON.stringify({ 1: { userId: 42 }, 2: 'x', 9: { userId: 'z', name: 'Z' } }));
    expect(readGhostFriend(1)).toBeNull();
    expect(readGhostFriend(2)).toBeNull();
    expect(parseFriendMemory([])).toBeUndefined();
    expect(parseFriendMemory(null)).toBeUndefined();
  });
});

describe('the ghost request', () => {
  it('needs a friend id when the mode is friend, and keeps pb and top as they were', () => {
    const base = { game: 'neon-driftway', level: '2' };
    expect(getGhostQuery.safeParse({ ...base, vs: 'friend' }).success).toBe(false);
    expect(getGhostQuery.safeParse({ ...base, vs: 'friend', friend: 'ada' }).success).toBe(true);
    expect(getGhostQuery.parse(base).vs).toBe('pb');
    expect(getGhostQuery.safeParse({ ...base, vs: 'top' }).success).toBe(true);
  });
});
