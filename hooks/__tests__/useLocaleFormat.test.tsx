// @vitest-environment node
import { renderToString } from 'react-dom/server';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const lang =
  {
    current:
      'en',
  };

vi.mock(
  'react-i18next',
  () => ({
    useTranslation:
      () => ({
        t: (
          _key: string,
          o: {
            defaultValue: string;
          },
        ) =>
          o.defaultValue,
        i18n: {
          language:
            lang.current,
        },
      }),
  }),
);

import { useLocaleFormat } from '../useLocaleFormat';

const AT =
  new Date(
    Date.UTC(
      2026,
      2,
      5,
      14,
      7,
      9,
    ),
  );

function Probe() {
  const f =
    useLocaleFormat();
  return (
    <p>
      {[
        f.locale,
        f.date(
          AT,
          {
            timeZone:
              'UTC',
          },
        ),
        f.number(
          1234567,
        ),
        f.compact(
          1500,
        ),
        f.relative(
          Date.now() -
            3 *
              86_400_000,
        ),
      ].join(
        '|',
      )}
    </p>
  );
}

function html(
  language: string,
): string {
  lang.current =
    language;
  return renderToString(
    <Probe />,
  );
}

describe('useLocaleFormat', () => {
  it('formats in English', () => {
    const out =
      html(
        'en',
      );
    expect(
      out,
    ).toContain(
      'en|3/5/2026|1,234,567|1.5K|3 days ago',
    );
  });

  it('switching the language changes every output', () => {
    const en =
      html(
        'en',
      );
    const ar =
      html(
        'ar',
      );
    const fr =
      html(
        'fr',
      );
    expect(
      new Set(
        [
          en,
          ar,
          fr,
        ],
      )
        .size,
    ).toBe(
      3,
    );
    expect(
      fr,
    ).toContain(
      'il y a 3 jours',
    );
    expect(
      ar,
    ).toContain(
      '\u0642\u0628\u0644',
    );
  });

  it('falls back to en when no language is set', () => {
    expect(
      html(
        '',
      ),
    ).toContain(
      'en|',
    );
  });
});
