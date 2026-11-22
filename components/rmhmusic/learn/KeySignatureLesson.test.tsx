/**
 * The key-signature lesson, rendered with `react-dom/server` and no catalog: every card has a
 * text equivalent in words, and the answers are four buttons.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { keySignature, type Key } from '@/lib/rmhmusic/learn/theory/key-signatures';
import { parseNote, type SpelledNote } from '@/lib/rmhmusic/learn/theory/scales';
import { KeySignatureCard, KeySignatureLesson, describeSignature } from './KeySignatureLesson';

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
const t = i18n.getFixedT('en', 'music-scales');
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const key = (id: string, mode: Key['mode']): Key => ({
  tonic: parseNote(id) as SpelledNote,
  mode,
});

describe('describeSignature', () => {
  it('says the signature in words, with its clef', () => {
    expect(describeSignature(t, keySignature(key('Eb', 'major')), 'treble')).toBe(
      'Key signature: 3 flats, treble clef',
    );
    expect(describeSignature(t, keySignature(key('G', 'major')), 'bass')).toBe('Key signature: 1 sharp, bass clef');
    expect(describeSignature(t, keySignature(key('A', 'minor')), 'treble')).toBe(
      'Key signature: no sharps or flats, treble clef',
    );
  });
});

describe('KeySignatureCard', () => {
  it('is an image named by its description and draws one mark per accidental', () => {
    const sig = keySignature(key('Eb', 'major'));
    const html = render(<KeySignatureCard sig={sig} clef="treble" label={describeSignature(t, sig, 'treble')} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Key signature: 3 flats, treble clef"');
    const none = render(<KeySignatureCard sig={keySignature(key('C', 'major'))} clef="bass" label="x" />);
    expect(none.split('<path').length).toBeLessThan(html.split('<path').length);
  });
});

describe('KeySignatureLesson', () => {
  it('shows a card, the question and four key buttons', () => {
    const html = render(<KeySignatureLesson lessonId="key-signatures-major" />);
    expect(html).toContain('Question 1 of 10');
    expect(html).toContain('Which major key has this signature?');
    expect(html).toContain('role="img"');
    expect(html.match(/data-choice/g)).toHaveLength(4);
  });
  it('asks for the minor key in the minor lesson', () => {
    const html = render(<KeySignatureLesson lessonId="key-signatures-minor" />);
    expect(html).toContain('Which minor key has this signature?');
  });
});
