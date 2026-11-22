/**
 * Interval reading's sentences, under a real i18next instance with no catalog (every string is its
 * `t()` default), as `sprint-text.test.ts` does.
 */
import { describe, expect, it } from 'vitest';
import { createInstance, type TFunction } from 'i18next';
import {
  QUALITY_NAMES,
  SIZE_NAMES,
  type IntervalQuestion,
  type StaffIntervalName,
} from '@/lib/rmhmusic/learn/theory/staff-intervals';
import { intervalCardLabel, intervalHint, intervalLabel, intervalMissSentences } from './interval-text';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  initAsync: false,
  interpolation: { escapeValue: false },
});
const t = i18n.t.bind(i18n) as unknown as TFunction<'c-rmhmusic'>;

const q = (answer: StaffIntervalName, over: Partial<IntervalQuestion> = {}): IntervalQuestion => ({
  clef: 'treble',
  direction: 'up',
  first: { written: 60, accidental: 0 },
  second: { written: 67, accidental: 0 },
  answer,
  ...over,
});

describe('names', () => {
  it('has a word of its own for every size and quality, all different', () => {
    const labels = [...SIZE_NAMES, ...QUALITY_NAMES].map((n) => intervalLabel(t, n));
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l).toMatch(/^[A-Z][a-z ]+$/);
    expect(intervalLabel(t, 'perfect-fifth')).toBe('Perfect fifth');
    expect(intervalLabel(t, 'octave')).toBe('Octave');
  });
});

describe('the card', () => {
  it('names only the staff while asking, so a screen reader does not hear the answer', () => {
    const asked = intervalCardLabel(t, q('fifth'), false);
    expect(asked).toBe('Two notes, one after the other, on the treble staff');
    expect(asked).not.toMatch(/C|G|fifth/);
    expect(intervalCardLabel(t, q('fifth', { clef: 'bass' }), false)).toMatch(/bass staff/);
  });

  it('names the two notes in order once answered', () => {
    expect(intervalCardLabel(t, q('fifth'), true)).toBe('C then G on the treble staff');
    const sharp = q('minor-sixth', { second: { written: 69, accidental: -1 }, clef: 'bass' });
    expect(intervalCardLabel(t, sharp, true)).toBe('C then A♭ on the bass staff');
  });

  it('has a hint for each tier', () => {
    expect(intervalHint(t, 'size')).toMatch(/Count the lines and spaces/);
    expect(intervalHint(t, 'quality')).toMatch(/minor, major or perfect/);
  });
});

describe('a wrong answer', () => {
  it('says what was said and what it is, then how many steps wide or narrow for a size', () => {
    expect(intervalMissSentences(t, q('fifth'), 'fourth')).toEqual([
      'You said Fourth; it is Fifth.',
      'Your answer is one step too narrow.',
    ]);
    expect(intervalMissSentences(t, q('third'), 'sixth')).toEqual([
      'You said Sixth; it is Third.',
      'Your answer is 3 steps too wide.',
    ]);
    expect(intervalMissSentences(t, q('octave'), 'seventh')[1]).toBe('Your answer is one step too narrow.');
    expect(intervalMissSentences(t, q('second'), 'third')[1]).toBe('Your answer is one step too wide.');
  });

  it('counts semitones for a quality, and says wide or narrow', () => {
    expect(intervalMissSentences(t, q('major-third'), 'minor-third')).toEqual([
      'You said Minor third; it is Major third.',
      'Your answer is one semitone too narrow.',
    ]);
    expect(intervalMissSentences(t, q('perfect-fourth'), 'perfect-fifth')[1]).toBe(
      'Your answer is 2 semitones too wide.',
    );
    expect(intervalMissSentences(t, q('tritone'), 'minor-second')[1]).toBe('Your answer is 5 semitones too narrow.');
    expect(intervalMissSentences(t, q('minor-second'), 'major-second')[1]).toBe(
      'Your answer is one semitone too wide.',
    );
  });

  it('has only the lead when the names are the same (nothing was wrong)', () => {
    expect(intervalMissSentences(t, q('third'), 'third')).toHaveLength(1);
  });
});
