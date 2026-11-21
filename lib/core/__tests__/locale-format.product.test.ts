import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  clearFormatterCache,
  currentDocumentLocale,
  formatDate,
  formatDateTime,
  formatDurationLong,
  formatNumber,
  formatTime,
  formatterCacheSize,
} from '../format';

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
const UTC =
  {
    timeZone:
      'UTC',
  } as const;

afterEach(
  () => {
    vi.unstubAllGlobals();
    clearFormatterCache();
  },
);

describe('formatDate / formatTime / formatDateTime', () => {
  it('match the toLocale*String calls they replace, per locale', () => {
    for (const locale of [
      'en',
      'ar',
      'ja',
      'fr',
    ]) {
      expect(
        formatDate(
          AT,
          locale,
          UTC,
        ),
      ).toBe(
        AT.toLocaleDateString(
          locale,
          UTC,
        ),
      );
      expect(
        formatTime(
          AT,
          locale,
          UTC,
        ),
      ).toBe(
        AT.toLocaleTimeString(
          locale,
          UTC,
        ),
      );
      expect(
        formatDateTime(
          AT,
          locale,
          UTC,
        ),
      ).toBe(
        AT.toLocaleString(
          locale,
          UTC,
        ),
      );
    }
  });

  it('keeps the options the call used', () => {
    const opts =
      {
        ...UTC,
        month:
          'long',
        year: 'numeric',
      } as const;
    expect(
      formatDate(
        AT,
        'fr',
        opts,
      ),
    ).toBe(
      'mars 2026',
    );
    expect(
      formatDateTime(
        AT,
        'ja',
        {
          ...UTC,
          dateStyle:
            'medium',
        },
      ),
    ).toBe(
      AT.toLocaleString(
        'ja',
        {
          ...UTC,
          dateStyle:
            'medium',
        },
      ),
    );
  });

  it('uses each locale, not the runtime default', () => {
    expect(
      formatDate(
        AT,
        'ar',
        UTC,
      ),
    ).not.toBe(
      formatDate(
        AT,
        'en',
        UTC,
      ),
    );
    expect(
      formatDate(
        AT,
        'ja',
        UTC,
      ),
    ).toContain(
      '2026',
    );
  });

  it('accepts ISO strings and epoch milliseconds', () => {
    expect(
      formatDate(
        AT.toISOString(),
        'fr',
        UTC,
      ),
    ).toBe(
      formatDate(
        AT.getTime(),
        'fr',
        UTC,
      ),
    );
  });

  it('time keeps toLocaleTimeString defaults (hour, minute, second)', () => {
    expect(
      formatTime(
        AT,
        'en',
        UTC,
      ),
    ).toBe(
      '2:07:09 PM',
    );
  });
});

describe('invalid dates', () => {
  it('answer Invalid Date like toLocale*String instead of throwing', () => {
    expect(
      formatDate(
        'nope',
        'fr',
      ),
    ).toBe(
      'Invalid Date',
    );
    expect(
      formatTime(
        'nope',
        'fr',
      ),
    ).toBe(
      'Invalid Date',
    );
    expect(
      formatDateTime(
        'nope',
        'fr',
      ),
    ).toBe(
      'Invalid Date',
    );
  });
});

describe('formatNumber', () => {
  it('groups and writes digits the way the locale does', () => {
    expect(
      formatNumber(
        1234567.5,
        'fr',
      ),
    ).toBe(
      (1234567.5).toLocaleString(
        'fr',
      ),
    );
    expect(
      formatNumber(
        1234567,
        'en',
      ),
    ).toBe(
      '1,234,567',
    );
    expect(
      formatNumber(
        1234567,
        'ar',
      ),
    ).toBe(
      (1234567).toLocaleString(
        'ar',
      ),
    );
    // Whatever digits CLDR picks for `ar` (and `ar-EG`), Intl decides, nothing is forced.
    expect(
      formatNumber(
        1234567,
        'ar-EG',
      ),
    ).toBe(
      (1234567).toLocaleString(
        'ar-EG',
      ),
    );
  });

  it('passes options through', () => {
    expect(
      formatNumber(
        0.256,
        'en',
        {
          style:
            'percent',
        },
      ),
    ).toBe(
      '26%',
    );
  });
});

describe('formatDurationLong', () => {
  it('names the unit in the locale with no in/ago', () => {
    expect(
      formatDurationLong(
        5 *
          60_000,
        'en',
      ),
    ).toBe(
      '5 minutes',
    );
    expect(
      formatDurationLong(
        2 *
          3_600_000,
        'fr',
      ),
    ).toBe(
      (2).toLocaleString(
        'fr',
        {
          style:
            'unit',
          unit: 'hour',
          unitDisplay:
            'long',
        },
      ),
    );
  });
});

describe('formatter cache', () => {
  it('reuses one formatter per (kind, locale, options)', () => {
    clearFormatterCache();
    formatDate(
      AT,
      'fr',
      UTC,
    );
    formatDate(
      AT,
      'fr',
      UTC,
    );
    formatDate(
      AT,
      'fr',
      {
        ...UTC,
      },
    );
    expect(
      formatterCacheSize(),
    ).toBe(
      1,
    );
    formatDate(
      AT,
      'ja',
      UTC,
    );
    formatNumber(
      1,
      'ja',
    );
    expect(
      formatterCacheSize(),
    ).toBe(
      3,
    );
  });

  it('is bounded at 200 entries', () => {
    clearFormatterCache();
    for (
      let i = 0;
      i <
      260;
      i++
    )
      formatNumber(
        1,
        'en',
        {
          maximumFractionDigits:
            i %
            20,
          minimumFractionDigits: 0,
          minimumIntegerDigits:
            1 +
            (Math.floor(
              i /
                20,
            ) %
              20),
        },
      );
    expect(
      formatterCacheSize(),
    ).toBeLessThanOrEqual(
      200,
    );
  });
});

describe('currentDocumentLocale', () => {
  it('falls back to en without a document', () => {
    expect(
      currentDocumentLocale(),
    ).toBe(
      'en',
    );
  });

  it('reads <html lang>, and falls back to en when it is empty', () => {
    vi.stubGlobal(
      'document',
      {
        documentElement:
          {
            lang: 'ar',
          },
      },
    );
    expect(
      currentDocumentLocale(),
    ).toBe(
      'ar',
    );
    vi.stubGlobal(
      'document',
      {
        documentElement:
          {
            lang: '',
          },
      },
    );
    expect(
      currentDocumentLocale(),
    ).toBe(
      'en',
    );
  });
});
