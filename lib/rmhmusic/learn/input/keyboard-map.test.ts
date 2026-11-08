import { describe, expect, it } from 'vitest';
import { keyToMidi } from './keyboard-map';

describe('keyToMidi', () => {
  it('maps the home row to C4..C5 with sharps on the row above', () => {
    const codes = [
      'KeyA',
      'KeyW',
      'KeyS',
      'KeyE',
      'KeyD',
      'KeyF',
      'KeyT',
      'KeyG',
      'KeyY',
      'KeyH',
      'KeyU',
      'KeyJ',
      'KeyK',
    ];
    expect(codes.map((c) => keyToMidi(c))).toEqual([
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
    ]);
  });

  it('returns null for unmapped keys', () => {
    expect(keyToMidi('KeyQ')).toBeNull();
    expect(keyToMidi('Space')).toBeNull();
    expect(keyToMidi('')).toBeNull();
  });

  it('applies the octave shift', () => {
    expect(keyToMidi('KeyA', 1)).toBe(72);
    expect(keyToMidi('KeyA', -1)).toBe(48);
    expect(keyToMidi('KeyQ', 1)).toBeNull();
  });

  it('does not match inherited object keys', () => {
    expect(keyToMidi('toString')).toBeNull();
    expect(keyToMidi('constructor')).toBeNull();
  });
});
