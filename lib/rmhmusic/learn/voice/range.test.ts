import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE_RANGE,
  VOICE_RANGE,
  foldIntoRange,
  rangeNaturals,
  resolveVoiceRange,
  staffCardRange,
  voiceReading,
  voiceStaff,
  writtenRange,
} from './range';
import { VOICE_RANGES } from '../schemas';
import { clefStep } from '../theory/clef';
import { CARD_LOW_MIN_STEP, CARD_MAX_STEP, CARD_MIN_STEP } from '../staff-card-layout';

describe('voice ranges', () => {
  it('cover soprano, alto, tenor and bass with sensible beginner compasses', () => {
    expect([...VOICE_RANGES]).toEqual(['soprano', 'alto', 'tenor', 'bass']);
    expect(VOICE_RANGE.soprano).toMatchObject({
      low: 60,
      high: 79,
    });
    expect(VOICE_RANGE.alto).toMatchObject({
      low: 55,
      high: 74,
    });
    expect(VOICE_RANGE.tenor).toMatchObject({
      low: 48,
      high: 67,
    });
    expect(VOICE_RANGE.bass).toMatchObject({
      low: 43,
      high: 60,
    });
    for (const r of VOICE_RANGES) expect(VOICE_RANGE[r].high - VOICE_RANGE[r].low).toBeGreaterThanOrEqual(17);
  });

  it('read on the right staff: treble, treble with the 8 for tenor, bass for bass', () => {
    expect(voiceReading('soprano')).toEqual({
      clef: 'treble',
      octaveClef: false,
      writtenShift: 0,
    });
    expect(voiceReading('alto')).toEqual({
      clef: 'treble',
      octaveClef: false,
      writtenShift: 0,
    });
    expect(voiceReading('tenor')).toEqual({
      clef: 'treble',
      octaveClef: true,
      writtenShift: 12,
    });
    expect(voiceReading('bass')).toEqual({
      clef: 'bass',
      octaveClef: false,
      writtenShift: 0,
    });
  });

  it('place a sung note on its staff (tenor written an octave up)', () => {
    expect(voiceStaff(57, 'alto')).toEqual({
      clef: 'treble',
      midi: 57,
      octaveClef: false,
    });
    expect(voiceStaff(50, 'tenor')).toEqual({
      clef: 'treble',
      midi: 62,
      octaveClef: true,
    });
    expect(voiceStaff(48, 'bass')).toEqual({
      clef: 'bass',
      midi: 48,
      octaveClef: false,
    });
    expect(writtenRange('tenor')).toEqual([60, 79]);
    expect(writtenRange('bass')).toEqual([43, 60]);
  });

  it('list the naturals of a range, lowest first', () => {
    expect(rangeNaturals('alto')).toEqual([55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74]);
    expect(rangeNaturals('bass')[0]).toBe(43);
    expect(rangeNaturals('bass').at(-1)).toBe(60);
  });

  it('fold a pitch by whole octaves into the range, keeping its letter', () => {
    expect(foldIntoRange(84, 'alto')).toBe(72);
    expect(foldIntoRange(40, 'alto')).toBe(64);
    expect(foldIntoRange(64, 'bass')).toBe(52);
    expect(foldIntoRange(61, 'soprano')).toBe(61);
    for (const r of VOICE_RANGES)
      for (let m = 30; m < 100; m++) {
        const f = foldIntoRange(m, r);
        expect(f % 12).toBe(m % 12);
        expect(f).toBeGreaterThanOrEqual(VOICE_RANGE[r].low);
        expect(f).toBeLessThanOrEqual(VOICE_RANGE[r].high);
      }
  });

  it('read a stored range, falling back to alto for null or junk', () => {
    expect(DEFAULT_VOICE_RANGE).toBe('alto');
    expect(resolveVoiceRange('bass')).toBe('bass');
    expect(resolveVoiceRange(null)).toBe('alto');
    expect(resolveVoiceRange('baritone')).toBe('alto');
  });
});

describe('the staff card a range reads on', () => {
  it('an alto (down to G3, below the deck card’s two ledger lines) reads on the low card; the rest on the deck card', () => {
    expect(staffCardRange('alto')).toBe('low');
    expect(staffCardRange('soprano')).toBe('deck');
    expect(staffCardRange('tenor')).toBe('deck');
    expect(staffCardRange('bass')).toBe('deck');
  });

  it('every note of every range is drawn inside its card', () => {
    for (const range of VOICE_RANGES) {
      const { clef } = voiceReading(range);
      const [lo, hi] = writtenRange(range);
      const min = staffCardRange(range) === 'low' ? CARD_LOW_MIN_STEP : CARD_MIN_STEP;
      expect(clefStep(clef, lo), range).toBeGreaterThanOrEqual(min);
      expect(clefStep(clef, hi), range).toBeLessThanOrEqual(CARD_MAX_STEP);
    }
  });
});
