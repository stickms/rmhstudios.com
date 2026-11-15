/**
 * NoteValues marks the asked value for screen readers as well as by the pencilled underline: its
 * `<li>` is `aria-current` and carries a screen-reader-only word, and no other item does. The beat
 * counts stay out of the accessibility tree until the question has been answered, so marking the
 * asked note never says the answer. Rendered with `react-dom/server`.
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
import { NoteValues } from './NoteValues';

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
    props: Parameters<
      typeof NoteValues
    >[0],
  ) =>
    renderToStaticMarkup(
      <I18nextProvider
        i18n={
          i18n
        }
      >
        <NoteValues
          {...props}
        />
      </I18nextProvider>,
    );

const items =
  (
    html: string,
  ) =>
    html.match(
      /<li\b[\s\S]*?<\/li>/g,
    ) ??
    [];

describe('NoteValues', () => {
  it('marks only the asked note as current, with a word for screen readers', () => {
    const lis =
      items(
        render(
          {
            asked:
              'half',
          },
        ),
      );
    expect(
      lis,
    ).toHaveLength(
      4,
    );
    const marked =
      lis.filter(
        (
          li,
        ) =>
          li.includes(
            'aria-current="true"',
          ),
      );
    expect(
      marked,
    ).toHaveLength(
      1,
    );
    expect(
      marked[0],
    ).toContain(
      'half',
    );
    expect(
      marked[0],
    ).toMatch(
      /<span class="sr-only">underlined<\/span>/,
    );
    expect(
      lis.filter(
        (
          li,
        ) =>
          li.includes(
            'sr-only',
          ),
      ),
    ).toHaveLength(
      1,
    );
  });

  it('marks nothing when no note is asked', () => {
    const html =
      render(
        {
          asked:
            null,
        },
      );
    expect(
      html,
    ).not.toContain(
      'aria-current',
    );
    expect(
      html,
    ).not.toContain(
      'sr-only',
    );
  });

  it('does not say the answer while asking: the counts are hidden from the accessibility tree', () => {
    const html =
      render(
        {
          asked:
            'quarter',
          counts: false,
        },
      );
    // `invisible` is visibility: hidden, which screen readers skip.
    for (const label of [
      '4 beats',
      '2 beats',
      '1 beat',
      'half a beat',
    ]) {
      const at =
        html.indexOf(
          label,
        );
      expect(
        at,
      ).toBeGreaterThan(
        -1,
      );
      expect(
        html.slice(
          html.lastIndexOf(
            '<span',
            at,
          ),
          at,
        ),
      ).toContain(
        'invisible',
      );
    }
  });

  it('adds nothing to the layout: the mark is out of flow and the row’s classes are the same', () => {
    const plain =
      render(
        {
          asked:
            null,
        },
      );
    const asked =
      render(
        {
          asked:
            'whole',
        },
      );
    expect(
      asked,
    ).toContain(
      'rmm-values grid grid-cols-4',
    );
    expect(
      plain,
    ).toContain(
      'rmm-values grid grid-cols-4',
    );
    // The only extra markup is the attribute and the sr-only span (absolutely positioned).
    const strip =
      (
        h: string,
      ) =>
        h
          .replace(
            / aria-current="true"/g,
            '',
          )
          .replace(
            /<span class="sr-only">underlined<\/span>/g,
            '',
          );
    const norm =
      (
        h: string,
      ) =>
        h
          .replace(
            /text-app-text(-muted)?\b/g,
            'T',
          )
          .replace(
            /border-app-accent|border-transparent/g,
            'B',
          );
    expect(
      norm(
        strip(
          asked,
        ),
      ),
    ).toBe(
      norm(
        plain,
      ),
    );
  });
});
