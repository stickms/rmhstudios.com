/**
 * The chord reading lessons, rendered with `react-dom/server` and no catalog: every card has a text
 * alternative naming its staff and its three notes, and every answer is a button.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeTriad } from '@/lib/rmhmusic/learn/machines/staff-chords';
import { parseNote, type SpelledNote } from '@/lib/rmhmusic/learn/theory/scales';
import { StaffChordsLesson, chordCardLabel, chordName, inversionWord, qualityWord } from './StaffChordsLesson';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['music-chords', 'c-rmhmusic'],
  defaultNS: 'music-chords',
  resources: {},
  interpolation: {
    escapeValue: false,
  },
  initAsync: false,
});
const t = i18n.getFixedT('en', 'music-chords');
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const triad = (id: string, quality: 'major' | 'minor' | 'diminished' | 'augmented', inversion: 0 | 1 | 2 = 0) =>
  writeTriad({ root: parseNote(id) as SpelledNote, quality }, 'treble', inversion);

describe('chordCardLabel', () => {
  it('names the staff and the three notes, lowest first', () => {
    const q = triad('F#', 'major');
    expect(chordCardLabel(t, 'en', q.clef, q.notes)).toBe('Treble staff: F sharp, A sharp, C sharp');
  });
  it('says flats and naturals, and the bass staff', () => {
    const q = triad('Eb', 'minor');
    expect(chordCardLabel(t, 'en', 'bass', q.notes)).toBe('Bass staff: E flat, G flat, B flat');
    const c = triad('C', 'major');
    expect(chordCardLabel(t, 'en', 'treble', c.notes)).toBe('Treble staff: C, E, G');
  });
  it('follows the inversion: E G C is C major with the third lowest', () => {
    const q = triad('C', 'major', 1);
    expect(chordCardLabel(t, 'en', q.clef, q.notes)).toBe('Treble staff: E, G, C');
  });
});

describe('the words', () => {
  it('names the chord and the inversion as the feedback says them', () => {
    const q = triad('F#', 'major', 1);
    expect(chordName(t, q, false)).toBe('F♯ major');
    expect(chordName(t, q, true)).toBe('F♯ major, first inversion');
    expect(qualityWord(t, 'diminished')).toBe('diminished');
    expect(inversionWord(t, 2)).toBe('Second inversion');
  });
});

describe('StaffChordsLesson', () => {
  it('shows a card with a text alternative and the root, sign and quality buttons', () => {
    const html = render(<StaffChordsLesson lessonId="chords-read-root-position" />);
    expect(html).toContain('Chord 1 of 10');
    expect(html).toContain('role="img"');
    expect(html).toMatch(/<title[^>]*>Treble staff: [^<]+<\/title>/);
    for (const letter of ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
      expect(html).toContain(`<span dir="ltr">${letter}</span>`);
    for (const word of ['sharp', 'flat', 'natural', 'major', 'minor', 'diminished', 'augmented', 'Check']) {
      expect(html).toContain(word);
    }
    expect(html).not.toContain('First inversion');
    // Seven letters, three signs, four qualities and Check: every answer is a native button.
    expect(html.match(/<button/g)?.length).toBeGreaterThanOrEqual(15);
    expect(html).toContain('aria-label="Root note"');
    expect(html).toContain('aria-label="Kind of chord"');
  });
  it('asks the inversion too in the inversion lesson', () => {
    const html = render(<StaffChordsLesson lessonId="chords-read-inversions" />);
    expect(html).toContain('Root position');
    expect(html).toContain('First inversion');
    expect(html).toContain('Second inversion');
    expect(html).toContain('aria-label="Inversion"');
    expect(html).not.toContain('diminished');
  });
  it('renders nothing for a lesson that is not a chord reading lesson', () => {
    expect(render(<StaffChordsLesson lessonId="chord-play-c-major" />)).toBe('');
  });
});
