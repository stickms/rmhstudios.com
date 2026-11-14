/**
 * StreakChip shows the streak only while there is one. At zero, or when the streak never arrives,
 * the header keeps an empty, same-size, aria-hidden slot (no text, no flame) so nothing moves;
 * above zero it shows the number, with the sentence for screen readers.
 *
 * Rendered with `react-dom/server`, which runs no effects, so "the streak never arrived" (the
 * give-up timer firing) is reached by making the component's first `useState(false)` start true.
 */
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createInstance } from 'i18next';
import {
  I18nextProvider,
  initReactI18next,
} from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';

let gaveUp = false;
vi.mock(
  'react',
  async (
    orig,
  ) => {
    const actual =
      await orig<
        typeof import('react')
      >();
    return {
      ...actual,
      useState:
        ((
          initial: unknown,
        ) =>
          gaveUp &&
          initial ===
            false
            ? [
                true,
                () => {},
              ]
            : actual.useState(
                initial as never,
              )) as unknown as typeof actual.useState,
    };
  },
);

let streak: {
  current: number;
} | null =
  null;
vi.mock(
  '@/lib/useStreak',
  () => ({
    useStreak:
      () =>
        streak,
  }),
);

import { StreakChip } from './StreakChip';

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
  () =>
    renderToStaticMarkup(
      <I18nextProvider
        i18n={
          i18n
        }
      >
        <StreakChip />
      </I18nextProvider>,
    );

/** The visible text and markup of an empty slot: an aria-hidden span with nothing in it. */
const EMPTY =
  /^<span class="inline-flex h-11 w-16 [^"]*" aria-hidden="true"><\/span>$/;

describe('StreakChip', () => {
  afterEach(
    () => {
      streak =
        null;
      gaveUp = false;
    },
  );

  it('shows the number and the sentence above zero', () => {
    streak =
      {
        current: 12,
      };
    const html =
      render();
    expect(
      html,
    ).toContain(
      '>12</span>',
    );
    expect(
      html,
    ).toContain(
      '12 day streak',
    );
    expect(
      html,
    ).toContain(
      '<svg',
    );
  });

  it('says "1 day streak" for one day', () => {
    streak =
      {
        current: 1,
      };
    expect(
      render(),
    ).toContain(
      '1 day streak',
    );
  });

  it('at zero it is an empty aria-hidden slot: no text, no flame', () => {
    streak =
      {
        current: 0,
      };
    expect(
      render(),
    ).toMatch(
      EMPTY,
    );
  });

  it('while the streak loads the slot pulses, hidden from assistive tech', () => {
    streak =
      null;
    const html =
      render();
    expect(
      html,
    ).toContain(
      'app-skeleton',
    );
    expect(
      html,
    ).toContain(
      'aria-hidden="true"',
    );
    expect(
      html,
    ).not.toContain(
      '<svg',
    );
  });

  it('when the streak never arrives it gives up: the same empty slot, no pulse', () => {
    streak =
      null;
    gaveUp = true;
    const html =
      render();
    expect(
      html,
    ).toMatch(
      EMPTY,
    );
    expect(
      html,
    ).not.toContain(
      'app-skeleton',
    );
  });
});
