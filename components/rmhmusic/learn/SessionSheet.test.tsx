/**
 * At 200% text on a 320px phone the sheet's title ("Chord 1 of 3") and its sentence (a hint, what
 * went wrong) are many lines of large type, not one and two. A box that clamps them to a fixed
 * number of lines cuts the count and the instruction off ("Chor…"), which is a loss of content at a
 * text size the page must support. The boxes keep their one-line / two-line height as a minimum, so
 * nothing moves at the normal size, and grow when the text needs more room.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionSheet, type QuestionSession } from './QuestionSession';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['c-rmhmusic'],
  defaultNS: 'c-rmhmusic',
  resources: {},
  interpolation: { escapeValue: false },
  initAsync: false,
});

const session = {
  lesson: { kind: 'asking', index: 0 },
  nextButton: { current: null },
} as unknown as QuestionSession<string, string>;

const html = renderToStaticMarkup(
  <I18nextProvider i18n={i18n}>
    <SessionSheet
      session={session}
      title="Chord 1 of 3"
      question={null}
      line="Tap C, E, and G together: use several fingers, or tap quickly."
      lineKey="hint"
      said=""
    />
  </I18nextProvider>,
);

describe('SessionSheet at large text', () => {
  it('never clamps the title or the sentence to a fixed number of lines', () => {
    expect(html).not.toContain('line-clamp');
  });

  it('keeps the one-line title and the two-line sentence height as a minimum', () => {
    expect(html).toMatch(/<h2[^>]*class="[^"]*\bmin-h-8\b/);
    expect(html).toMatch(/class="[^"]*\bmin-h-10\b/);
  });
});
