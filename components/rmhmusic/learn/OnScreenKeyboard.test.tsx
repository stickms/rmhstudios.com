/**
 * The note finder asks the learner to find a key, so the keys must not already say which they
 * are: `hideLabels` takes the letters (and middle C's name) off the white keys. The keys keep
 * their accessible names (a screen reader finds a key by name), and everywhere else the letters
 * stay.
 *
 * Rendered with `react-dom/server` under a real i18next instance with no catalog.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { OnScreenKeyboard } from './OnScreenKeyboard';

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

const render = (props: Partial<Parameters<typeof OnScreenKeyboard>[0]>) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <OnScreenKeyboard {...props} />
    </I18nextProvider>,
  );

/** The visible text inside the white keys: `<span aria-hidden="true">C4</span>`. */
const keyLetters = (html: string) =>
  [...html.matchAll(/<span aria-hidden="true">([A-G]#?-?\d*)<\/span>/g)].map((m) => m[1]);

describe('OnScreenKeyboard letters', () => {
  it('writes a letter on every white key by default, and the octave on each C', () => {
    const letters = keyLetters(render({}));
    expect(letters).toHaveLength(14);
    expect(letters.slice(0, 7)).toEqual(['C4', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('writes none when hideLabels is set, but keeps the keys named for assistive tech', () => {
    const html = render({ hideLabels: true });
    expect(keyLetters(html)).toEqual([]);
    expect(html).toContain('aria-label="C4"');
    expect(html).toContain('aria-label="D4"');
  });
});
