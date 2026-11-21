import {
  describe,
  expect,
  it,
} from 'vitest';
import { readFileSync } from 'node:fs';
import {
  annualise,
  appendRevision,
  currencyDigits,
  decimalToMinor,
  followUpForDeadline,
  highestPerCurrency,
  minorToDecimal,
  offerProblems,
  offerTotals,
  offersToCsv,
  revisionFor,
  MAX_REVISIONS,
  type OfferDto,
} from '@/lib/rmhladder/offers';
import {
  offerBody,
  offerPatchBody,
} from '@/lib/rmhladder/offers-schema';

const amounts =
  {
    currency:
      'USD',
    basePay:
      '10000000',
    payPeriod:
      'year' as const,
    hoursPerWeek:
      null,
    bonusAmount:
      null,
    bonusPercent:
      null,
    signOn:
      null,
    equityGrant:
      null,
    equityYears:
      null,
  };

describe('annualise', () => {
  it('multiplies monthly pay by 12 and hourly pay by hours x 52', () => {
    expect(
      annualise(
        '800000',
        'month',
        null,
      ),
    ).toBe(
      9_600_000,
    );
    expect(
      annualise(
        '5000',
        'hour',
        40,
      ),
    ).toBe(
      10_400_000,
    );
    expect(
      annualise(
        '5000',
        'hour',
        20,
      ),
    ).toBe(
      5_200_000,
    );
    expect(
      annualise(
        '10000000',
        'year',
        null,
      ),
    ).toBe(
      10_000_000,
    );
  });
});

describe('offerTotals', () => {
  it('adds base, bonus, sign-on and equity per year for year one, without sign-on after', () => {
    const t =
      offerTotals(
        {
          ...amounts,
          bonusAmount:
            '1000000',
          signOn:
            '2000000',
          equityGrant:
            '40000000',
          equityYears: 4,
        },
      );
    expect(
      t.equityPerYear,
    ).toBe(
      10_000_000,
    );
    expect(
      t.firstYear,
    ).toBe(
      10_000_000 +
        1_000_000 +
        2_000_000 +
        10_000_000,
    );
    expect(
      t.yearly,
    ).toBe(
      10_000_000 +
        1_000_000 +
        10_000_000,
    );
  });

  it('takes a bonus percent of the annual base, including hourly and monthly bases', () => {
    expect(
      offerTotals(
        {
          ...amounts,
          bonusPercent: 15,
        },
      )
        .bonus,
    ).toBe(
      1_500_000,
    );
    expect(
      offerTotals(
        {
          ...amounts,
          basePay:
            '800000',
          payPeriod:
            'month',
          bonusPercent: 10,
        },
      )
        .bonus,
    ).toBe(
      960_000,
    );
    expect(
      offerTotals(
        {
          ...amounts,
          basePay:
            '5000',
          payPeriod:
            'hour',
          hoursPerWeek: 40,
          bonusPercent: 10,
        },
      )
        .bonus,
    ).toBe(
      1_040_000,
    );
  });

  it('counts no equity without both a grant and vesting years', () => {
    expect(
      offerTotals(
        {
          ...amounts,
          equityGrant:
            '100',
          equityYears:
            null,
        },
      )
        .equityPerYear,
    ).toBe(
      0,
    );
  });
});

describe('highestPerCurrency', () => {
  const offer =
    (
      id: string,
      currency: string,
      basePay: string,
      state = 'open',
      signOn:
        | string
        | null = null,
    ) => ({
      ...amounts,
      id,
      currency,
      basePay,
      state,
      signOn,
    });

  it('marks the highest first-year and yearly total within each currency', () => {
    const marks =
      highestPerCurrency(
        [
          offer(
            'a',
            'USD',
            '9000000',
          ),
          offer(
            'b',
            'USD',
            '9500000',
          ),
          offer(
            'c',
            'EUR',
            '5000000',
          ),
          offer(
            'd',
            'EUR',
            '4000000',
            'open',
            '2000000',
          ),
        ],
      );
    expect(
      [
        ...marks.firstYear,
      ].sort(),
    ).toEqual(
      [
        'b',
        'd',
      ],
    );
    expect(
      [
        ...marks.yearly,
      ].sort(),
    ).toEqual(
      [
        'b',
        'c',
      ],
    );
  });

  it('marks nothing for a lone offer in a currency, ignores declined offers, and marks ties', () => {
    expect(
      highestPerCurrency(
        [
          offer(
            'a',
            'USD',
            '9000000',
          ),
        ],
      )
        .firstYear
        .size,
    ).toBe(
      0,
    );
    expect(
      highestPerCurrency(
        [
          offer(
            'a',
            'USD',
            '9000000',
          ),
          offer(
            'b',
            'USD',
            '99000000',
            'declined',
          ),
        ],
      )
        .firstYear
        .size,
    ).toBe(
      0,
    );
    expect(
      [
        ...highestPerCurrency(
          [
            offer(
              'a',
              'USD',
              '9',
            ),
            offer(
              'b',
              'USD',
              '9',
            ),
          ],
        )
          .firstYear,
      ].sort(),
    ).toEqual(
      [
        'a',
        'b',
      ],
    );
  });
});

describe('revisions', () => {
  it('records the previous amounts only when an amount changed', () => {
    const now =
      new Date(
        '2026-11-10T00:00:00Z',
      );
    expect(
      revisionFor(
        amounts,
        {
          ...amounts,
          basePay:
            '11000000',
        },
        now,
      ),
    ).toEqual(
      {
        at: now.toISOString(),
        previous:
          amounts,
      },
    );
    expect(
      revisionFor(
        amounts,
        {
          ...amounts,
        },
        now,
      ),
    ).toBeNull();
    expect(
      revisionFor(
        {
          ...amounts,
          signOn:
            null,
        },
        {
          ...amounts,
          signOn:
            '5',
        },
        now,
      ),
    ).not.toBeNull();
  });

  it('treats a bigint and its digit string as the same amount, and keeps only the newest revisions', () => {
    expect(
      revisionFor(
        {
          ...amounts,
          basePay:
            10000000n,
        },
        amounts,
        new Date(),
      ),
    ).toBeNull();
    const many =
      Array.from(
        {
          length:
            MAX_REVISIONS +
            3,
        },
        (
          _,
          i,
        ) => ({
          at: String(
            i,
          ),
          previous:
            {
              ...amounts,
            },
        }),
      );
    const kept =
      appendRevision(
        many.slice(
          0,
          MAX_REVISIONS,
        ),
        many[
          MAX_REVISIONS
        ]!,
      );
    expect(
      kept,
    ).toHaveLength(
      MAX_REVISIONS,
    );
    expect(
      kept[
        MAX_REVISIONS -
          1
      ]!
        .at,
    ).toBe(
      String(
        MAX_REVISIONS,
      ),
    );
  });
});

describe('followUpForDeadline', () => {
  const now =
    new Date(
      '2026-11-10T09:00:00Z',
    );
  it('is the day before the deadline, never before today', () => {
    expect(
      followUpForDeadline(
        new Date(
          '2026-11-20T00:00:00Z',
        ),
        null,
        now,
      ),
    ).toEqual(
      new Date(
        '2026-11-19T00:00:00Z',
      ),
    );
    expect(
      followUpForDeadline(
        new Date(
          '2026-11-10T00:00:00Z',
        ),
        null,
        now,
      ),
    ).toEqual(
      new Date(
        '2026-11-10T00:00:00Z',
      ),
    );
  });
  it('keeps an earlier follow-up that has not passed', () => {
    expect(
      followUpForDeadline(
        new Date(
          '2026-11-20T00:00:00Z',
        ),
        new Date(
          '2026-11-12T00:00:00Z',
        ),
        now,
      ),
    ).toBeNull();
    expect(
      followUpForDeadline(
        new Date(
          '2026-11-20T00:00:00Z',
        ),
        new Date(
          '2026-11-01T00:00:00Z',
        ),
        now,
      ),
    ).toEqual(
      new Date(
        '2026-11-19T00:00:00Z',
      ),
    );
  });
});

describe('money text', () => {
  it('converts between typed major units and minor units per currency', () => {
    expect(
      currencyDigits(
        'USD',
      ),
    ).toBe(
      2,
    );
    expect(
      currencyDigits(
        'JPY',
      ),
    ).toBe(
      0,
    );
    expect(
      decimalToMinor(
        '85,000.5',
        'USD',
      ),
    ).toBe(
      8_500_050,
    );
    expect(
      decimalToMinor(
        '85000',
        'JPY',
      ),
    ).toBe(
      85_000,
    );
    expect(
      decimalToMinor(
        '1.234',
        'USD',
      ),
    ).toBeNull();
    expect(
      decimalToMinor(
        'abc',
        'USD',
      ),
    ).toBeNull();
    expect(
      decimalToMinor(
        '-5',
        'USD',
      ),
    ).toBeNull();
    expect(
      minorToDecimal(
        '8500050',
        'USD',
      ),
    ).toBe(
      '85000.50',
    );
    expect(
      minorToDecimal(
        '5',
        'USD',
      ),
    ).toBe(
      '0.05',
    );
    expect(
      minorToDecimal(
        '85000',
        'JPY',
      ),
    ).toBe(
      '85000',
    );
  });
});

describe('offerProblems', () => {
  it('flags hourly without hours, a double bonus and half an equity grant', () => {
    expect(
      offerProblems(
        {
          ...amounts,
          payPeriod:
            'hour',
        },
      ),
    ).toEqual(
      [
        'hoursRequired',
      ],
    );
    expect(
      offerProblems(
        {
          ...amounts,
          bonusAmount:
            '1',
          bonusPercent: 1,
        },
      ),
    ).toEqual(
      [
        'bonusBoth',
      ],
    );
    expect(
      offerProblems(
        {
          ...amounts,
          equityGrant:
            '1',
        },
      ),
    ).toEqual(
      [
        'equityPair',
      ],
    );
    expect(
      offerProblems(
        amounts,
      ),
    ).toEqual(
      [],
    );
  });
});

describe('request schemas', () => {
  const body =
    {
      applicationId:
        'a',
      ...amounts,
      equityNote:
        null,
      location:
        null,
      remote:
        null,
      ptoDays:
        null,
      startDate:
        null,
      deadline:
        null,
      notes:
        null,
    };
  it('bounds amounts to 10^12 minor units and takes ISO currency codes only', () => {
    expect(
      offerBody.safeParse(
        body,
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      offerBody.safeParse(
        {
          ...body,
          basePay:
            '1000000000000',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      offerBody.safeParse(
        {
          ...body,
          basePay:
            '1000000000001',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      offerBody.safeParse(
        {
          ...body,
          basePay:
            '-1',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      offerBody.safeParse(
        {
          ...body,
          basePay:
            '1.5',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      offerBody.safeParse(
        {
          ...body,
          currency:
            'XXX',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      offerBody.safeParse(
        {
          ...body,
          deadline:
            '2026-02-31',
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
  it('accepts any subset on a patch', () => {
    expect(
      offerPatchBody.safeParse(
        {},
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      offerPatchBody.safeParse(
        {
          notes:
            'x',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      offerPatchBody.safeParse(
        {
          basePay:
            'x',
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('offersToCsv', () => {
  const dto =
    (
      over: Partial<OfferDto>,
    ): OfferDto =>
      ({
        ...amounts,
        id: 'o',
        applicationId:
          'a',
        company:
          'Acme',
        title:
          'Engineer',
        state:
          'open',
        location:
          null,
        remote:
          null,
        ptoDays:
          null,
        startDate:
          null,
        deadline:
          null,
        notes:
          null,
        ...over,
      }) as OfferDto;

  it('writes major units and totals, one row per offer', () => {
    const [
      header,
      row,
    ] =
      offersToCsv(
        [
          dto(
            {
              bonusPercent: 10,
            },
          ),
        ],
      ).split(
        '\r\n',
      );
    expect(
      header!.startsWith(
        'company,role,state,currency,basePay',
      ),
    ).toBe(
      true,
    );
    expect(
      row,
    ).toContain(
      'Acme,Engineer,open,USD,100000.00,year,100000.00,10000.00,0.00,0.00,110000.00,110000.00',
    );
  });

  it('quotes commas, quotes and newlines and defuses spreadsheet formulas', () => {
    const csv =
      offersToCsv(
        [
          dto(
            {
              company:
                'Acme, Inc.',
              title:
                'He said "hi"',
              notes:
                'line one\nline two',
              location:
                '=HYPERLINK("x")',
            },
          ),
        ],
      );
    expect(
      csv,
    ).toContain(
      '"Acme, Inc."',
    );
    expect(
      csv,
    ).toContain(
      '"He said ""hi"""',
    );
    expect(
      csv,
    ).toContain(
      '"line one\nline two"',
    );
    expect(
      csv,
    ).toContain(
      `"'=HYPERLINK(""x"")"`,
    );
  });
});

describe('table name', () => {
  it('maps the model to the ladder_offer table', () => {
    const schema =
      readFileSync(
        'prisma/schema/rmhladder.prisma',
        'utf8',
      );
    expect(
      schema,
    ).toMatch(
      /model LadderOffer \{[\s\S]*?@@map\("ladder_offer"\)/,
    );
  });
});
