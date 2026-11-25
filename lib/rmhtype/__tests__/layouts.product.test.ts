import { describe, expect, it } from 'vitest';
import { KEYBOARD_ROWS, TYPING_LAYOUTS } from '@/lib/rmhtype/keystats';
import { FINGER_OF, fingerFor, shiftFingerFor } from '@/lib/rmhtype/lessons';
import { fingerForOn, keyboardRows, mapKey, shiftFingerForOn } from '@/lib/rmhtype/layouts';

const QWERTY_LETTER_ROWS = KEYBOARD_ROWS.qwerty.flat();

describe('mapKey', () => {
  it('keeps QWERTY unchanged', () => {
    for (const key of QWERTY_LETTER_ROWS) expect(mapKey(key, 'qwerty')).toBe(key);
  });

  it.each(TYPING_LAYOUTS)('maps every QWERTY letter-row key to one key on %s, as a bijection', (layout) => {
    const mapped = QWERTY_LETTER_ROWS.map((key) => mapKey(key, layout));
    expect(new Set(mapped).size).toBe(QWERTY_LETTER_ROWS.length);
    expect([...mapped].sort()).toEqual([...KEYBOARD_ROWS[layout].flat()].sort());
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(mapped).toContain(letter);
  });

  it('maps by position: the QWERTY home row is the layout home row', () => {
    const home = (layout: (typeof TYPING_LAYOUTS)[number]) =>
      [...'asdfghjkl;'].map((key) => mapKey(key, layout)).join('');
    expect(home('dvorak')).toBe('aoeuidhtns');
    expect(home('colemak')).toBe('arstdhneio');
    expect(home('azerty')).toBe('qsdfghjklm');
  });

  it('teaches unit 1 on Dvorak as uh, et, on, as, id', () => {
    expect(['fj', 'dk', 'sl', 'a;', 'gh'].map((pair) => [...pair].map((k) => mapKey(k, 'dvorak')).join(''))).toEqual([
      'uh',
      'et',
      'on',
      'as',
      'id',
    ]);
  });

  it('returns a character that is not on a key position unchanged', () => {
    expect(mapKey('Q', 'dvorak')).toBe('Q');
    expect(mapKey('~', 'colemak')).toBe('~');
  });
});

describe('keyboardRows', () => {
  it('draws QWERTY exactly as the course keyboard always did', () => {
    expect(keyboardRows('qwerty')).toEqual(['1234567890-', 'qwertyuiop', "asdfghjkl;'", 'zxcvbnm,./']);
  });

  it('puts the layout home row on the third row', () => {
    expect(keyboardRows('dvorak')[2]?.slice(0, 10)).toBe('aoeuidhtns');
    expect(keyboardRows('colemak')[2]?.slice(0, 10)).toBe('arstdhneio');
  });
});

describe('fingerForOn', () => {
  it('agrees with the QWERTY finger table for every character the course types', () => {
    for (const [char, finger] of Object.entries(FINGER_OF)) expect(fingerForOn('qwerty', char)).toBe(finger);
    for (const char of ['?', '!', ':', '(', ')', '"', 'A', 'Z']) {
      expect(fingerForOn('qwerty', char)).toBe(fingerFor(char));
      expect(shiftFingerForOn('qwerty', char)).toBe(shiftFingerFor(char));
    }
  });

  it('follows position, not the character', () => {
    // The key under the left index finger's home position.
    expect(fingerForOn('dvorak', 'u')).toBe('left-index');
    expect(fingerForOn('dvorak', 'h')).toBe('right-index');
    expect(fingerForOn('colemak', 't')).toBe('left-index');
    expect(fingerForOn('colemak', 'n')).toBe('right-index');
    expect(fingerForOn('azerty', 'q')).toBe('left-pinky');
    expect(fingerForOn('azerty', 'm')).toBe('right-pinky');
    expect(fingerForOn('dvorak', 'a')).toBe('left-pinky');
    expect(fingerForOn('dvorak', 's')).toBe('right-pinky');
  });

  it('uses the thumb for space and holds Shift with the opposite hand', () => {
    expect(fingerForOn('dvorak', ' ')).toBe('thumb');
    expect(shiftFingerForOn('dvorak', 'U')).toBe('right-pinky');
    expect(shiftFingerForOn('dvorak', 'H')).toBe('left-pinky');
    expect(shiftFingerForOn('dvorak', 'u')).toBeNull();
  });
});
