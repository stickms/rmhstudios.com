/**
 * The flashcard and the note finder draw exactly what they drew before the sight reading game
 * extended the staff (accidentals, chords, bars). Their layout and their markup are pinned as one
 * digest each, taken before the change: any difference to an existing lesson fails here.
 *
 * Rendered with `react-dom/server` under an i18next instance with no catalog (the suite runs in
 * `node`), as in `StaffCard.test.tsx`.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CARD_LOW_MIN_STEP,
  CARD_MIN_STEP,
  CLEF_GLYPHS,
  cardLayout,
  ledgerLine,
  ruledLine,
} from '@/lib/rmhmusic/learn/staff-card-layout';
import { StaffCard, type StaffCardState } from './StaffCard';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['c-rmhmusic'],
  defaultNS: 'c-rmhmusic',
  resources: {},
  interpolation: {
    escapeValue: false,
  },
  initAsync: false,
});

/** FNV-1a (32-bit) of a string. */
function digest(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const CLEFS = ['treble', 'bass'] as const;
const MIDIS = Array.from(
  {
    length: 50,
  },
  (_, i) => 36 + i,
);

describe('existing staff cards are unchanged', () => {
  it('layout: every note on both clefs, both ranges; the ruling and the clefs', () => {
    const parts: unknown[] = [];
    for (const clef of CLEFS) {
      for (const midi of MIDIS) {
        parts.push(
          cardLayout(clef, midi),
          cardLayout(clef, midi, CARD_MIN_STEP),
          cardLayout(clef, midi, CARD_LOW_MIN_STEP),
        );
      }
    }
    for (let i = 0; i < 5; i++) parts.push(ruledLine(i, 4, 196));
    for (let n = 0; n < 4; n++) parts.push(ledgerLine(20 + n * 5, n));
    parts.push(CLEF_GLYPHS);
    expect(digest(JSON.stringify(parts))).toBe(LAYOUT_DIGEST);
  });

  it('markup: every state, range, the octave clef and the caption', () => {
    const html: string[] = [];
    const states: StaffCardState[] = ['ask', 'right', 'wrong'];
    for (const clef of CLEFS) {
      for (const midi of MIDIS.filter((_, i) => i % 3 === 0)) {
        for (const state of states) {
          for (const range of ['deck', 'low'] as const) {
            html.push(
              renderToStaticMarkup(
                <I18nextProvider i18n={i18n}>
                  <StaffCard
                    card={{
                      id: `${clef}:${midi}`,
                      clef,
                      midi,
                    }}
                    state={state}
                    range={range}
                    octaveClef={range === 'low'}
                    {...(state === 'wrong'
                      ? {
                          caption: 'E2',
                          label: 'Find E2',
                        }
                      : {})}
                  />
                </I18nextProvider>,
              ),
            );
          }
        }
      }
    }
    expect(digest(html.join('\n'))).toBe(MARKUP_DIGEST);
  });
});

const LAYOUT_DIGEST = 2413932151;
const MARKUP_DIGEST = 3359830588;
