/**
 * The bass clef unit's cards say where their note sits, in words: "Bass staff, second line". Rendered
 * with `react-dom/server` under an i18next instance with no catalog, so every string is its default.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffCard } from './StaffCard';
import type { Card } from '@/lib/rmhmusic/learn/content/decks';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['c-rmhmusic', 'bass-clef'],
  defaultNS: 'c-rmhmusic',
  resources: {},
  interpolation: { escapeValue: false },
  initAsync: false,
});

const render = (card: Card, props: Partial<Parameters<typeof StaffCard>[0]> = {}) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <StaffCard card={card} state="ask" {...props} />
    </I18nextProvider>,
  );

const title = (html: string) => html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? '';

describe('staff card text alternatives on the bass staff and the grand staff', () => {
  it('announces a bass staff card with its line or space, without naming the note', () => {
    const card: Card = { id: 'bass:47', clef: 'bass', midi: 47 };
    expect(title(render(card, { announcePlace: true }))).toBe('Bass staff, second line');
    expect(title(render({ id: 'bass:45', clef: 'bass', midi: 45 }, { announcePlace: true }))).toBe(
      'Bass staff, first space',
    );
  });

  it('names the note too once answered', () => {
    const card: Card = { id: 'bass:47', clef: 'bass', midi: 47 };
    expect(title(render(card, { announcePlace: true, state: 'right' }))).toBe('B2, Bass staff, second line');
  });

  it('keeps the old words for a bass card on a screen that does not announce place', () => {
    expect(title(render({ id: 'bass:47', clef: 'bass', midi: 47 }))).toBe('A note on the bass staff');
  });

  it('says which staff of the grand staff middle C is written on, and where', () => {
    const treble: Card = { id: 'grand:treble:60', clef: 'treble', midi: 60, grand: true };
    const bass: Card = { id: 'grand:bass:60', clef: 'bass', midi: 60, grand: true };
    expect(title(render(treble))).toBe('Grand staff, Treble staff, first ledger line below the staff');
    expect(title(render(bass))).toBe('Grand staff, Bass staff, first ledger line above the staff');
  });

  it('draws two staves and a brace for a grand staff card, one for a plain card', () => {
    const grand = render({ id: 'grand:bass:57', clef: 'bass', midi: 57, grand: true });
    expect(grand).toContain('data-grand-brace');
    expect(grand.match(/<path d="M 4 /g)?.length).toBeGreaterThanOrEqual(10);
    expect(render({ id: 'bass:57', clef: 'bass', midi: 57 })).not.toContain('data-grand-brace');
  });
});
