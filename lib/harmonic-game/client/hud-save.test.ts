import { describe, expect, it } from 'vitest';
import { readHudState, emptyHarmonicHud, isHarmonicHud } from './hud-state';
import {
  HARMONIC_SAVE_KEY,
  clearHarmonicSave,
  parseHarmonicSave,
  readHarmonicSave,
  saveLevelStart,
  writeHarmonicSave,
  type SaveStorage,
} from './save';
import { loadPrefs, savePrefs } from './prefs';

function memory(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const throwing: SaveStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('readHudState', () => {
  it('reads health and death', () => {
    expect(readHudState({ player: { health: 63.4, dead: false } })).toMatchObject({
      health: 63,
      maxHealth: 100,
      dead: false,
    });
    const dead = readHudState({ player: { health: 0, dead: true } });
    expect(dead.dead).toBe(true);
    expect(dead.health).toBe(0);
  });
  it('clamps and leaves later slices undefined', () => {
    const s = readHudState({ player: { health: 900, dead: false } });
    expect(s.health).toBe(100);
    expect(s.cold).toBeUndefined();
    expect(s.weapon).toBeUndefined();
    expect(s.subtitles).toEqual([]);
    expect(isHarmonicHud(s)).toBe(true);
    expect(isHarmonicHud(null)).toBe(false);
    expect(readHudState({ player: { health: NaN, dead: false } }).dead).toBe(true);
  });
  it('gives fresh objects', () => {
    expect(emptyHarmonicHud().subtitles).not.toBe(emptyHarmonicHud().subtitles);
  });
});

describe('save', () => {
  it('round-trips', () => {
    const s = memory();
    expect(
      writeHarmonicSave(
        { v: 1, level: 'dev_box', flags: { a: true, b: 'x', c: 3 }, savedAt: 5 },
        s,
      ),
    ).toBe(true);
    expect(readHarmonicSave(s)).toEqual({
      v: 1,
      level: 'dev_box',
      flags: { a: true, b: 'x', c: 3 },
      savedAt: 5,
    });
  });
  it('treats corrupt data as no save', () => {
    const s = memory();
    s.setItem(HARMONIC_SAVE_KEY, '{not json');
    expect(readHarmonicSave(s)).toBeNull();
    s.setItem(HARMONIC_SAVE_KEY, JSON.stringify({ v: 1, level: '../x', flags: {}, savedAt: 1 }));
    expect(readHarmonicSave(s)).toBeNull();
    s.setItem(HARMONIC_SAVE_KEY, JSON.stringify({ v: 1, level: 'a', flags: [], savedAt: 1 }));
    expect(readHarmonicSave(s)).toBeNull();
  });
  it('rejects another version and unknown levels', () => {
    expect(parseHarmonicSave({ v: 2, level: 'dev_box', flags: {}, savedAt: 1 })).toBeNull();
    expect(
      parseHarmonicSave({ v: 1, level: 'gone', flags: {}, savedAt: 1 }, ['dev_box']),
    ).toBeNull();
  });
  it('drops flags of the wrong type', () => {
    expect(
      parseHarmonicSave({ v: 1, level: 'a', flags: { ok: 1, bad: {}, n: null }, savedAt: 1 })
        ?.flags,
    ).toEqual({ ok: 1 });
  });
  it('level start keeps flags; clear removes', () => {
    const s = memory();
    writeHarmonicSave({ v: 1, level: 'a', flags: { k: true }, savedAt: 1 }, s);
    saveLevelStart('b', s, 9);
    expect(readHarmonicSave(s)).toEqual({ v: 1, level: 'b', flags: { k: true }, savedAt: 9 });
    clearHarmonicSave(s);
    expect(readHarmonicSave(s)).toBeNull();
  });
  it('survives a storage that throws or is absent', () => {
    expect(readHarmonicSave(throwing)).toBeNull();
    expect(saveLevelStart('a', throwing)).toBe(false);
    expect(() => clearHarmonicSave(throwing)).not.toThrow();
    expect(saveLevelStart('a', null)).toBe(false);
  });
});

describe('prefs', () => {
  it('defaults, round-trips and ignores junk', () => {
    const s = memory();
    expect(loadPrefs(s).subtitleSize).toBe('medium');
    savePrefs({ subtitleSize: 'large' }, s);
    expect(loadPrefs(s).subtitleSize).toBe('large');
    s.setItem('harmonic:prefs', '{"subtitleSize":"huge"}');
    expect(loadPrefs(s).subtitleSize).toBe('medium');
    expect(loadPrefs(throwing).subtitleSize).toBe('medium');
  });
});
