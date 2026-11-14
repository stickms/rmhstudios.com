/**
 * StaffCard's SVG text is set in a fixed frame of coordinates (the note's x, the clef's 8), so it
 * must not follow the page's writing direction. Under `dir="rtl"` (ar, ur) an SVG `<text>` with
 * `text-anchor: start` ends at its x instead of starting there, which put the note finder's
 * pencilled name on top of the notehead. Every `<text>` therefore pins `direction="ltr"`.
 *
 * Rendered with `react-dom/server` (the suite's environment is `node`) under a real i18next
 * instance with no catalog, so every string is the `t()` call's own default.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import { createInstance } from 'i18next';
import {
  I18nextProvider,
  initReactI18next,
} from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffCard } from './StaffCard';

const i18n =
  createInstance();
void i18n
  .use(
    initReactI18next,
  )
  .init(
    {
      lng: 'en',
      fallbackLng:
        'en',
      ns: [
        'c-rmhmusic',
      ],
      defaultNS:
        'c-rmhmusic',
      resources:
        {},
      interpolation:
        {
          escapeValue: false,
        },
      initAsync: false,
    },
  );

const render =
  (
    props: Partial<
      Parameters<
        typeof StaffCard
      >[0]
    >,
  ) =>
    renderToStaticMarkup(
      <I18nextProvider
        i18n={
          i18n
        }
      >
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

const texts =
  (
    html: string,
  ) =>
    html.match(
      /<text\b[^>]*>/g,
    ) ??
    [];

describe('StaffCard text', () => {
  it('pins direction="ltr" on the note finder\'s caption and on the clef\'s 8', () => {
    const found =
      texts(
        render(
          {
            octaveClef: true,
            caption:
              'E2',
          },
        ),
      );
    expect(
      found,
    ).toHaveLength(
      2,
    );
    for (const tag of found)
      expect(
        tag,
      ).toContain(
        'direction="ltr"',
      );
  });

  it('has a caption text to pin even without the 8', () => {
    const found =
      texts(
        render(
          {
            caption:
              'E2',
          },
        ),
      );
    expect(
      found,
    ).toHaveLength(
      1,
    );
    expect(
      found[0],
    ).toContain(
      'direction="ltr"',
    );
  });

  it('draws no text at all for a plain flashcard (its letter is in HTML under the card)', () => {
    expect(
      texts(
        render(
          {
            range:
              'deck',
          },
        ),
      ),
    ).toHaveLength(
      0,
    );
  });
});
