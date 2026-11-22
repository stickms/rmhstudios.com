/**
 * The scale lesson, rendered with `react-dom/server` under a real i18next instance with no
 * catalog (the English defaults show): its first scale on the on-screen keys, the guitar's
 * fretboard, and the eight places with their marks and spelling. The grading itself (F sharp in
 * G major, in order, once) is `machines/play-scale.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { playScaleQuestions } from '@/lib/rmhmusic/learn/machines/play-scale';
import { parseNote, type SpelledNote } from '@/lib/rmhmusic/learn/theory/scales';
import { PlayScaleLesson, ScaleSlots, playedName } from './PlayScaleLesson';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['music-scales', 'c-rmhmusic'],
  defaultNS: 'music-scales',
  resources: {},
  interpolation: {
    escapeValue: false,
  },
  initAsync: false,
});

const render = (node: React.ReactElement) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);

const profile = (instrument: 'piano' | 'guitar') =>
  useLearnStore.setState({
    profile: {
      instrument,
      input: 'screen',
      sound: null,
    } as never,
  });

afterEach(() =>
  useLearnStore.setState({
    profile: null,
  } as never),
);

describe('PlayScaleLesson', () => {
  it('asks the first scale by name with eight empty places and the on-screen keys', () => {
    profile('piano');
    const html = render(<PlayScaleLesson lessonId="scales-major-white" />);
    expect(html).toContain('Scale 1 of 4');
    expect(html).toContain('\u2069 major<');
    expect(html).toContain('one octave up');
    expect(html).toContain('Right hand fingers: 1 2 3 1 2 3 4 5');
    expect(html.match(/<li/g)).toHaveLength(8);
    expect(html).toContain('rmm-keys');
    expect(html).not.toContain('rmm-fret');
  });

  it('shows the fretboard on guitar, with one position and no fingering', () => {
    profile('guitar');
    const html = render(<PlayScaleLesson lessonId="scales-major-white" />);
    expect(html).toContain('rmm-fret__cell');
    expect(html).toContain('Any octave will do');
    expect(html).not.toContain('Right hand fingers');
    expect(html).not.toContain('rmm-keys__bed');
  });

  it('asks nothing for a lesson that is not a scale lesson', () => {
    expect(playScaleQuestions('key-signatures-major', 'piano')).toEqual([]);
  });
});

describe('ScaleSlots', () => {
  const g = playScaleQuestions('scales-major-white', 'piano')[1]!;

  it('marks each note played, right with a check and wrong with a cross, in words as well', () => {
    const html = render(<ScaleSlots question={g} midis={[67, 69, 70]} />);
    expect(html.match(/>right</g)).toHaveLength(2);
    expect(html.match(/>wrong</g)).toHaveLength(1);
    expect(html).toContain('G');
  });

  it('spells the notes the way the scale does', () => {
    const html = render(<ScaleSlots question={g} midis={[67, 69, 71, 72, 74, 76, 78, 79]} />);
    expect(html).toContain('F♯');
    expect(html).not.toContain('>wrong<');
  });
});

describe('playedName', () => {
  const n = (id: string) => parseNote(id) as SpelledNote;
  it('uses the scale spelling for an enharmonic note and a sharp name for a stray one', () => {
    expect(playedName(70, n('Bb'))).toBe('B♭');
    expect(playedName(78, n('F#'))).toBe('F♯');
    expect(playedName(71, n('Bb'))).toBe('B');
    expect(playedName(61, n('E'))).toBe('C♯');
    expect(playedName(60, undefined)).toBe('C');
  });
});
