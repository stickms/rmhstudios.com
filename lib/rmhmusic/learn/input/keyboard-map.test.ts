import { describe, expect, it } from 'vitest';
import { inKeysRange, keyToMidi } from './keyboard-map';

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

  it('returns null when the shifted note leaves the MIDI range', () => {
    expect(keyToMidi('KeyK', 5)).toBeNull();
    expect(keyToMidi('KeyA', -6)).toBeNull();
    expect(keyToMidi('KeyA', 10)).toBeNull();
  });

  it('returns null for a NaN or fractional octave shift', () => {
    expect(keyToMidi('KeyA', Number.NaN)).toBeNull();
    expect(keyToMidi('KeyA', 1.5)).toBeNull();
    expect(keyToMidi('KeyA', 0.5)).toBeNull();
    expect(keyToMidi('KeyA', Infinity)).toBeNull();
  });

  it('still returns notes at the edges of the valid range', () => {
    expect(keyToMidi('KeyA', 5)).toBe(120);
    expect(keyToMidi('KeyK', 4)).toBe(120);
    expect(keyToMidi('KeyA', -5)).toBe(0);
  });

  it('does not match inherited object keys', () => {
    expect(keyToMidi('toString')).toBeNull();
    expect(keyToMidi('constructor')).toBeNull();
  });
});

describe('inKeysRange', () => {
  it('is the notes the home row plays, C4 to C5, and nothing outside them', () => {
    expect(inKeysRange(60)).toBe(true);
    expect(inKeysRange(66)).toBe(true);
    expect(inKeysRange(72)).toBe(true);
    expect(inKeysRange(59)).toBe(false);
    expect(inKeysRange(73)).toBe(false);
    expect(inKeysRange(40)).toBe(false); // the open low E
    expect(inKeysRange(48)).toBe(false); // the two-octave lesson's C3
  });

  it('agrees with what keyToMidi can produce', () => {
    for (let midi = 30; midi < 90; midi++) {
      const played = [
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
      ].some((c) => keyToMidi(c) === midi);
      expect(inKeysRange(midi)).toBe(played);
    }
  });
});
