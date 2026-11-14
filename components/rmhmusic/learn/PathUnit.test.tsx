/**
 * PathUnit keeps every fact it used to show as a badge or a star count, now that the eye reads
 * noteheads and a Start button: the lesson's state is still written out for screen readers, the
 * three star slots are always there (so an earned star moves nothing), a lesson that is not ready
 * has no button, and the Start button is still named for its lesson.
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
import type {
  Lesson,
  Unit,
} from '@/lib/rmhmusic/learn/content/path';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';
import { PathUnit } from './PathUnit';

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

const lesson =
  (
    id: string,
    title: string,
    available = true,
  ): Lesson => ({
    id,
    unit: 'u',
    title,
    summary: `About ${title}`,
    mode: 'play-note',
    available,
  });

const UNIT: Unit =
  {
    id: 'u',
    title:
      'A unit',
    lessons:
      [
        lesson(
          'fresh',
          'Fresh lesson',
        ),
        lesson(
          'begun',
          'Begun lesson',
        ),
        lesson(
          'one',
          'One star lesson',
        ),
        lesson(
          'two',
          'Two star lesson',
        ),
        lesson(
          'later',
          'Later lesson',
          false,
        ),
      ],
  };

const row =
  (
    lessonId: string,
    stars: number,
  ): LessonProgressRow => ({
    lessonId,
    stars,
    bestScore: 0,
    completedAt:
      stars >
      0
        ? '2026-01-01T00:00:00.000Z'
        : null,
  });

const PROGRESS =
  new Map(
    [
      [
        'begun',
        row(
          'begun',
          0,
        ),
      ],
      [
        'one',
        row(
          'one',
          1,
        ),
      ],
      [
        'two',
        row(
          'two',
          2,
        ),
      ],
    ],
  );

const render =
  (
    props: {
      placeholder?: boolean;
    } = {},
  ) =>
    renderToStaticMarkup(
      <I18nextProvider
        i18n={
          i18n
        }
      >
        <PathUnit
          unit={
            UNIT
          }
          progress={
            PROGRESS
          }
          {...props}
        />
      </I18nextProvider>,
    );

/** The `<li>` of one lesson, found by its title. */
function rowOf(
  html: string,
  title: string,
): string {
  const items =
    html
      .split(
        '<li ',
      )
      .slice(
        1,
      );
  const found =
    items.find(
      (
        li,
      ) =>
        li.includes(
          `${title}<`,
        ),
    );
  if (
    !found
  )
    throw new Error(
      `no row for ${title}`,
    );
  return found.split(
    '</li>',
  )[0];
}

const srOnly =
  (
    li: string,
  ) =>
    li.match(
      /<span class="sr-only">([^<]*)<\/span>/,
    )?.[1];

describe('PathUnit: the state is written out for screen readers', () => {
  const html =
    render();

  it.each(
    [
      [
        'Fresh lesson',
        ', Not started',
      ],
      [
        'Begun lesson',
        ', Started',
      ],
      [
        'One star lesson',
        ', 1 star',
      ],
      [
        'Two star lesson',
        ', 2 stars',
      ],
      [
        'Later lesson',
        ', Coming soon',
      ],
    ],
  )(
    '%s says "%s"',
    (
      title,
      words,
    ) => {
      expect(
        srOnly(
          rowOf(
            html,
            title,
          ),
        ),
      ).toBe(
        words,
      );
    },
  );
});

describe('PathUnit: stars', () => {
  const html =
    render();
  /** The star slots: the `invisible` flag of each small notehead inside the aria-hidden group. */
  const slots =
    (
      li: string,
    ) => {
      const group =
        li.match(
          /<span aria-hidden="true" class="ms-2[^"]*">(.*?)<\/span>/,
        )?.[1];
      if (
        !group
      )
        return null;
      return [
        ...group.matchAll(
          /<svg[^>]*class="([^"]*)"/g,
        ),
      ].map(
        (
          m,
        ) =>
          !m[1].includes(
            'invisible',
          ),
      );
    };

  it('reserves exactly three slots on an available lesson, filled from the left', () => {
    expect(
      slots(
        rowOf(
          html,
          'Fresh lesson',
        ),
      ),
    ).toEqual(
      [
        false,
        false,
        false,
      ],
    );
    expect(
      slots(
        rowOf(
          html,
          'Begun lesson',
        ),
      ),
    ).toEqual(
      [
        false,
        false,
        false,
      ],
    );
    expect(
      slots(
        rowOf(
          html,
          'One star lesson',
        ),
      ),
    ).toEqual(
      [
        true,
        false,
        false,
      ],
    );
    expect(
      slots(
        rowOf(
          html,
          'Two star lesson',
        ),
      ),
    ).toEqual(
      [
        true,
        true,
        false,
      ],
    );
  });

  it('shows no star slots on a lesson that is not ready', () => {
    expect(
      slots(
        rowOf(
          html,
          'Later lesson',
        ),
      ),
    ).toBeNull();
  });
});

describe('PathUnit: actions', () => {
  const html =
    render();

  it('an available lesson has a Start button named for the lesson', () => {
    const li =
      rowOf(
        html,
        'Fresh lesson',
      );
    expect(
      li,
    ).toContain(
      'aria-label="Start Fresh lesson"',
    );
    expect(
      li,
    ).toMatch(
      /<button[^>]*>Start<\/button>/,
    );
  });

  it('a lesson that is not ready has no button', () => {
    expect(
      rowOf(
        html,
        'Later lesson',
      ),
    ).not.toContain(
      '<button',
    );
  });

  it('there is one button per available lesson and none for the others', () => {
    expect(
      html.match(
        /<button/g,
      ),
    ).toHaveLength(
      4,
    );
  });
});

describe('PathUnit: structure', () => {
  it('the decorative staff is aria-hidden', () => {
    expect(
      render(),
    ).toContain(
      '<div aria-hidden="true" class="rmm-unit__staff"></div>',
    );
  });

  it('the section is named by its title', () => {
    const html =
      render();
    const id =
      html.match(
        /aria-labelledby="([^"]+)"/,
      )?.[1];
    expect(
      id,
    ).toBeTruthy();
    expect(
      html,
    ).toContain(
      `<h2 id="${id}"`,
    );
  });

  it('the placeholder keeps the same rows but hides them from everyone', () => {
    const loaded =
      render();
    const placeholder =
      render(
        {
          placeholder: true,
        },
      );
    expect(
      placeholder,
    ).toContain(
      'aria-hidden="true" class="rmm-unit"',
    );
    expect(
      placeholder,
    ).not.toContain(
      'aria-labelledby',
    );
    expect(
      placeholder.match(
        /<li /g,
      ),
    ).toHaveLength(
      loaded.match(
        /<li /g,
      )!
        .length,
    );
    expect(
      placeholder.match(
        /app-skeleton/g,
      ),
    ).toHaveLength(
      UNIT
        .lessons
        .length,
    );
  });
});
