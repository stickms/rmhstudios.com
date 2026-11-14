/**
 * The fretboard is a group of 36 buttons with two-dimensional arrow keys, which a screen reader
 * cannot tell from the group's name alone, so the group carries a description (`aria-describedby`,
 * which every screen reader supports, to a visually hidden sentence).
 *
 * Rendered with `react-dom/server` under a real i18next instance with no catalog.
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
import { FretboardView } from './FretboardView';

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

const html =
  renderToStaticMarkup(
    <I18nextProvider
      i18n={
        i18n
      }
    >
      <FretboardView
        asking
        onAnswer={() => {}}
      />
    </I18nextProvider>,
  );

describe('FretboardView', () => {
  it('describes how its arrow keys move, from the group', () => {
    const group =
      html.match(
        /<div[^>]*role="group"[^>]*>/,
      )?.[0] ??
      '';
    const id =
      group.match(
        /aria-describedby="([^"]+)"/,
      )?.[1];
    expect(
      id,
    ).toBeTruthy();
    const described =
      html.match(
        new RegExp(
          `<[a-z]+[^>]*id="${id}"[^>]*>([^<]*)<`,
        ),
      );
    expect(
      described?.[1],
    ).toMatch(
      /arrow keys/i,
    );
    expect(
      described?.[0],
    ).toContain(
      'sr-only',
    );
  });

  it('has 36 cells, one of them in the tab order', () => {
    const cells =
      html.match(
        /<button\b[^>]*>/g,
      ) ??
      [];
    expect(
      cells,
    ).toHaveLength(
      36,
    );
    expect(
      cells.filter(
        (
          c,
        ) =>
          c.includes(
            'tabindex="0"',
          ),
      ),
    ).toHaveLength(
      1,
    );
  });
});
