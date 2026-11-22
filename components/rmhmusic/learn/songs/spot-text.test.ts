/**
 * The sentences of spot practice, under a real i18next instance with no catalog (every string is its
 * `t()` default), as `sprint-miss-text.test.ts` does.
 */
import { describe, expect, it } from 'vitest';
import { createInstance, type TFunction } from 'i18next';
import { MIN_TEMPO_PCT, type PassResult, type SpotSegment } from '@/lib/rmhmusic/learn/songs/spot';
import { segmentName, spotHeading, spotIntro, spotResultLine, spotTempoLine } from './spot-text';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  initAsync: false,
  interpolation: { escapeValue: false },
});
const t = i18n.t.bind(i18n) as unknown as TFunction<'c-rmhmusic'>;

const seg = (fromNumber: number, toNumber: number): SpotSegment => ({
  from: 0,
  to: 0,
  weakFrom: 0,
  weakTo: 0,
  problems: 1,
  fromNumber,
  toNumber,
});

describe('segmentName', () => {
  it('names one bar, a range, a pickup, and a pickup into the first bar', () => {
    expect(segmentName(t, seg(5, 5))).toBe('Bar 5');
    expect(segmentName(t, seg(5, 6))).toBe('Bars 5–6');
    expect(segmentName(t, seg(0, 0))).toBe('Pickup');
    expect(segmentName(t, seg(0, 1))).toBe('Pickup to bar 1');
  });
});

describe('the lines', () => {
  it('heads the score with the bars and which segment of how many', () => {
    expect(spotHeading(t, { segments: [seg(2, 3), seg(7, 7)], index: 1 })).toBe('Practising Bar 7 (2 of 2)');
  });

  it('introduces the loop for each mode', () => {
    expect(spotIntro(t, 'play', 'Bars 5–6')).toBe(
      'Bars 5–6, on a loop. It starts at 60% of the tempo and speeds up after each clean pass.',
    );
    expect(spotIntro(t, 'wait', 'Bar 3')).toBe('Bar 3, on a loop. Play each note when you are ready.');
  });

  it('shows the tempo and the pass number, or only the pass in Wait for me', () => {
    expect(spotTempoLine(t, { tempoPct: 70, pass: 2 })).toBe('Tempo 70% · Pass 3');
    expect(spotTempoLine(t, { tempoPct: null, pass: 0 })).toBe('Pass 1');
  });
});

describe('spotResultLine', () => {
  const pass = (over: Partial<PassResult>): PassResult => ({
    problems: 0,
    clean: true,
    tempoPct: 60,
    nextTempoPct: 70,
    mastered: false,
    ...over,
  });

  it('announces a faster tempo after a clean pass', () => {
    expect(spotResultLine(t, pass({}))).toBe('Clean pass. Tempo is now 70%.');
  });

  it('says the bars are solid after a clean pass at full tempo', () => {
    expect(spotResultLine(t, pass({ tempoPct: 100, nextTempoPct: 100, mastered: true }))).toBe(
      'Clean at full tempo. These bars are solid.',
    );
  });

  it('announces a slower tempo after a bad pass, and the floor when it cannot go lower', () => {
    expect(spotResultLine(t, pass({ clean: false, problems: 4, tempoPct: 80, nextTempoPct: 70 }))).toBe(
      'Several notes were off. Tempo is back to 70%.',
    );
    expect(
      spotResultLine(t, pass({ clean: false, problems: 4, tempoPct: MIN_TEMPO_PCT, nextTempoPct: MIN_TEMPO_PCT })),
    ).toBe('Several notes were off. Staying at 50%.');
  });

  it('keeps the tempo after one or two problems', () => {
    expect(spotResultLine(t, pass({ clean: false, problems: 2, tempoPct: 80, nextTempoPct: 80 }))).toBe(
      'Almost: 2 to fix. Same tempo again.',
    );
  });

  it('Wait for me has no tempo to announce', () => {
    expect(spotResultLine(t, pass({ tempoPct: null, nextTempoPct: null }))).toBe('Clean pass. These bars are solid.');
    expect(spotResultLine(t, pass({ tempoPct: null, nextTempoPct: null, clean: false, problems: 2 }))).toBe(
      'Not clean yet. Try these bars again.',
    );
  });
});
