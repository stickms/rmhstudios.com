/**
 * StaffCard's SVG text is set in a fixed frame of coordinates (the note's x, the clef's 8), so it
 * must not follow the page's writing direction. Under `dir="rtl"` (ar, ur) an SVG `<text>` with
 * `text-anchor: start` ends at its x instead of starting there, which put the note finder's
 * pencilled name on top of the notehead. Every `<text>` therefore pins `direction="ltr"`.
 *
 * Rendered with `react-dom/server` (the suite's environment is `node`) under a real i18next
 * instance with no catalog, so every string is the `t()` call's own default.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffCard } from './StaffCard';

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

const render = (props: Partial<Parameters<typeof StaffCard>[0]>) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <StaffCard
        card={{
          id: 'guitar:40',
          clef: 'treble',
          midi: 52,
        }}
        state="ask"
        range="low"
        {...props}
      />
    </I18nextProvider>,
  );

const texts = (html: string) => html.match(/<text\b[^>]*>/g) ?? [];

describe('StaffCard text', () => {
  it('pins direction="ltr" on the note finder\'s caption and on the clef\'s 8', () => {
    const found = texts(
      render({
        octaveClef: true,
        caption: 'E2',
      }),
    );
    expect(found).toHaveLength(2);
    for (const tag of found) expect(tag).toContain('direction="ltr"');
  });

  it('has a caption text to pin even without the 8', () => {
    const found = texts(
      render({
        caption: 'E2',
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('direction="ltr"');
  });

  it('draws no text at all for a plain flashcard (its letter is in HTML under the card)', () => {
    expect(
      texts(
        render({
          range: 'deck',
        }),
      ),
    ).toHaveLength(0);
  });
});

describe('StaffCard played note', () => {
  const card = { id: 'treble:64', clef: 'treble', midi: 64 } as const;

  it('draws the played note beside the right one once answered wrong, and names it in the label', () => {
    const html = render({ card, state: 'wrong', played: 62 });
    expect(html).toContain('data-played-note');
    expect(html).toContain('E4 on the treble staff; you played D4');
    // Two noteheads: the right one and the played one.
    expect(html.match(/<ellipse/g)).toHaveLength(2);
  });

  it('draws no played note while asking, when right, or when none was given', () => {
    expect(render({ card, state: 'ask', played: 62 })).not.toContain('data-played-note');
    expect(render({ card, state: 'right', played: 62 })).not.toContain('data-played-note');
    expect(render({ card, state: 'wrong' })).not.toContain('data-played-note');
    expect(render({ card, state: 'wrong', played: null })).not.toContain('data-played-note');
  });

  it('gives the played note its own ledger lines when it sits below the staff', () => {
    const html = render({ card, state: 'wrong', played: 57 }); // A3: one ledger line under the staff
    expect(html).toContain('data-played-note');
    expect(html).toMatch(/data-played-note[^>]*>\s*<path/);
  });
});

describe('StaffCard spelled cards', () => {
  const title = (html: string) => html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? '';
  const caption = (html: string) => html.match(/<figcaption[^>]*>(?:<span[^>]*>)?([^<]*)/)?.[1] ?? '';
  const fSharp = { id: 'treble:66:sharp', clef: 'treble', midi: 66, written: 65, accidental: 1 } as const;
  const bFlat = { id: 'treble:70:flat', clef: 'treble', midi: 70, written: 71, accidental: -1 } as const;
  const fInG = { id: 'key:G:treble:66', clef: 'treble', midi: 66, written: 65, key: 'G' } as const;
  const gInG = { id: 'key:G:treble:67', clef: 'treble', midi: 67, key: 'G' } as const;
  const bInEb = { id: 'key:Eb:bass:46', clef: 'bass', midi: 46, written: 47, key: 'Eb' } as const;

  it('prints the sign before the notehead of an accidental card, a sharp or a flat', () => {
    expect(render({ card: fSharp, state: 'ask', range: 'deck' })).toContain('data-accidental="sharp"');
    expect(render({ card: bFlat, state: 'ask', range: 'deck' })).toContain('data-accidental="flat"');
  });

  it('draws a natural card with no sign and no key signature', () => {
    const html = render({ card: { id: 'treble:64', clef: 'treble', midi: 64 }, state: 'ask', range: 'deck' });
    expect(html).not.toContain('data-accidental');
    expect(html).not.toContain('data-key-signature');
  });

  it('puts the note on the natural it is written on: B♭ sits on the B line, not the A', () => {
    // The head's y is cardY(clefStep(treble, 71)): B4 is step 4 (the middle line), y = 52.
    const y = (html: string) => Number(html.match(/<ellipse cx="122" cy="([\d.]+)"/)?.[1]);
    expect(y(render({ card: bFlat, state: 'ask', range: 'deck' }))).toBe(52);
    expect(y(render({ card: { id: 'treble:71', clef: 'treble', midi: 71 }, state: 'ask', range: 'deck' }))).toBe(52);
  });

  it('draws a key card’s signature after the clef, one sign per accidental, with no sign on the note', () => {
    const sigs = (html: string) => (html.match(/data-key-signature="[^"]+"/g) ?? []).length;
    const g = render({ card: fInG, state: 'ask', range: 'deck' });
    expect(sigs(g)).toBe(1);
    expect(g).not.toContain('data-accidental');
    // One sign for G (F♯), three for E♭ (B♭ E♭ A♭): one path each inside the key-signature group.
    const paths = (html: string) => {
      const m = html.match(/<g[^>]*data-key-signature[^>]*>(.*?)<\/g>/);
      return (m?.[1].match(/<path/g) ?? []).length;
    };
    expect(paths(g)).toBe(1);
    expect(paths(render({ card: bInEb, state: 'ask', range: 'deck' }))).toBe(3);
  });

  it('names a spelled card by letter and sign under the card once answered', () => {
    expect(caption(render({ card: fSharp, state: 'right', range: 'deck' }))).toBe('F♯');
    expect(caption(render({ card: bFlat, state: 'wrong', range: 'deck' }))).toBe('B♭');
    expect(caption(render({ card: fInG, state: 'right', range: 'deck' }))).toBe('F♯');
    expect(caption(render({ card: gInG, state: 'right', range: 'deck' }))).toBe('G');
    expect(caption(render({ card: fSharp, state: 'ask', range: 'deck' }))).toBe('');
  });

  it('says a sign in words in the image’s title, and never gives the answer away while asking', () => {
    expect(title(render({ card: fSharp, state: 'right', range: 'deck' }))).toBe('F sharp 4 on the treble staff');
    expect(title(render({ card: bFlat, state: 'right', range: 'deck' }))).toBe('B flat 4 on the treble staff');
    expect(title(render({ card: fSharp, state: 'ask', range: 'deck' }))).toBe(
      'A sharp or flat note on the treble staff',
    );
    expect(title(render({ card: fInG, state: 'ask', range: 'deck' }))).toBe('A note on the treble staff, in G major');
    expect(title(render({ card: bInEb, state: 'right', range: 'deck' }))).toBe(
      'B flat 2 on the bass staff, in E♭ major',
    );
  });

  it('draws a wrong answer’s own sign beside its head, on the natural it is written on', () => {
    // G♭ for an F♯: drawn on the G line (y = 62 for G4) with a flat before it.
    const html = render({
      card: fSharp,
      state: 'wrong',
      range: 'deck',
      played: { midi: 66, written: 67, accidental: -1 },
    });
    const played = html.match(/<g[^>]*data-played-note[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    expect(played).toContain('<ellipse cx="94" cy="62"');
    expect(played).toContain('<path d="M'); // the flat
    expect(title(html)).toBe('F sharp 4 on the treble staff; you played G flat 4');
  });

  it('keeps a bare-number played note working, a natural with no sign', () => {
    const html = render({ card: fSharp, state: 'wrong', range: 'deck', played: 62 });
    expect(html).toContain('data-played-note');
    expect(title(html)).toBe('F sharp 4 on the treble staff; you played D4');
  });
});
