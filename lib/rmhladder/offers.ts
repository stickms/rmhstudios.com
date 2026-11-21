/**
 * RMHLadder offers — the pure half (sprint 03, feature 17). Client-safe: no
 * Prisma, no zod.
 *
 * Amounts are minor units (cents) held as `number`: the schema bounds every
 * amount to 10^12, so a sum of a few of them stays far below 2^53. They cross
 * the wire as digit strings (`OfferDto`), the way BigInt columns are serialised.
 *
 * Nothing here converts between currencies. Offers in different currencies are
 * compared within each currency (`highestPerCurrency`), and the page says so.
 */
import {
  addDays,
  dayOf,
  dayString,
  parseDay,
} from '@/lib/calendar/tz';
import { encodeCsv } from '@/lib/rmhladder/csv';

/** Upper bound for every stored amount, in minor units. */
export const MAX_MINOR_UNITS = 1_000_000_000_000;
/** An application has at most one offer; a member keeps at most this many. */
export const MAX_OFFERS_PER_MEMBER = 50;
/** Kept revisions per offer; the oldest fall off. */
export const MAX_REVISIONS = 20;
/** The full-time year the posting-pay normaliser also uses (`lib/rmhladder/pay.ts`). */
export const WEEKS_PER_YEAR = 52;

export const PAY_PERIODS =
  [
    'year',
    'month',
    'hour',
  ] as const;
export type OfferPayPeriod =
  (typeof PAY_PERIODS)[number];
export const REMOTE_POLICIES =
  [
    'onsite',
    'hybrid',
    'remote',
  ] as const;
export type OfferRemote =
  (typeof REMOTE_POLICIES)[number];
export const OFFER_STATES =
  [
    'open',
    'accepted',
    'declined',
  ] as const;
export type OfferState =
  (typeof OFFER_STATES)[number];

/** ISO 4217 active codes (a static list: validated server-side without a runtime lookup). */
export const CURRENCY_CODES =
  [
    'AED',
    'AFN',
    'ALL',
    'AMD',
    'ANG',
    'AOA',
    'ARS',
    'AUD',
    'AWG',
    'AZN',
    'BAM',
    'BBD',
    'BDT',
    'BGN',
    'BHD',
    'BIF',
    'BMD',
    'BND',
    'BOB',
    'BRL',
    'BSD',
    'BTN',
    'BWP',
    'BYN',
    'BZD',
    'CAD',
    'CDF',
    'CHF',
    'CLP',
    'CNY',
    'COP',
    'CRC',
    'CUP',
    'CVE',
    'CZK',
    'DJF',
    'DKK',
    'DOP',
    'DZD',
    'EGP',
    'ERN',
    'ETB',
    'EUR',
    'FJD',
    'FKP',
    'GBP',
    'GEL',
    'GHS',
    'GIP',
    'GMD',
    'GNF',
    'GTQ',
    'GYD',
    'HKD',
    'HNL',
    'HTG',
    'HUF',
    'IDR',
    'ILS',
    'INR',
    'IQD',
    'IRR',
    'ISK',
    'JMD',
    'JOD',
    'JPY',
    'KES',
    'KGS',
    'KHR',
    'KMF',
    'KPW',
    'KRW',
    'KWD',
    'KYD',
    'KZT',
    'LAK',
    'LBP',
    'LKR',
    'LRD',
    'LSL',
    'LYD',
    'MAD',
    'MDL',
    'MGA',
    'MKD',
    'MMK',
    'MNT',
    'MOP',
    'MRU',
    'MUR',
    'MVR',
    'MWK',
    'MXN',
    'MYR',
    'MZN',
    'NAD',
    'NGN',
    'NIO',
    'NOK',
    'NPR',
    'NZD',
    'OMR',
    'PAB',
    'PEN',
    'PGK',
    'PHP',
    'PKR',
    'PLN',
    'PYG',
    'QAR',
    'RON',
    'RSD',
    'RUB',
    'RWF',
    'SAR',
    'SBD',
    'SCR',
    'SDG',
    'SEK',
    'SGD',
    'SHP',
    'SLE',
    'SOS',
    'SRD',
    'SSP',
    'STN',
    'SVC',
    'SYP',
    'SZL',
    'THB',
    'TJS',
    'TMT',
    'TND',
    'TOP',
    'TRY',
    'TTD',
    'TWD',
    'TZS',
    'UAH',
    'UGX',
    'USD',
    'UYU',
    'UZS',
    'VES',
    'VND',
    'VUV',
    'WST',
    'XAF',
    'XCD',
    'XOF',
    'XPF',
    'YER',
    'ZAR',
    'ZMW',
    'ZWL',
  ] as const;
export type CurrencyCode =
  (typeof CURRENCY_CODES)[number];

/** The fields whose change is a revision (notes, location, dates and the like are not). */
export const AMOUNT_FIELDS =
  [
    'currency',
    'basePay',
    'payPeriod',
    'hoursPerWeek',
    'bonusAmount',
    'bonusPercent',
    'signOn',
    'equityGrant',
    'equityYears',
  ] as const;
export type AmountField =
  (typeof AMOUNT_FIELDS)[number];

/** Amount fields as they travel: minor units as digit strings. */
export interface AmountSnapshot {
  currency: string;
  basePay: string;
  payPeriod: OfferPayPeriod;
  hoursPerWeek:
    | number
    | null;
  bonusAmount:
    | string
    | null;
  bonusPercent:
    | number
    | null;
  signOn:
    | string
    | null;
  equityGrant:
    | string
    | null;
  equityYears:
    | number
    | null;
}

export interface OfferRevision {
  /** ISO instant the amounts were replaced. */
  at: string;
  /** The amounts before that change. */
  previous: AmountSnapshot;
}

/** An offer as the API returns it (dates as `YYYY-MM-DD`, amounts as strings). */
export interface OfferDto extends AmountSnapshot {
  id: string;
  applicationId: string;
  equityNote:
    | string
    | null;
  location:
    | string
    | null;
  remote: OfferRemote | null;
  ptoDays:
    | number
    | null;
  startDate:
    | string
    | null;
  deadline:
    | string
    | null;
  notes:
    | string
    | null;
  state: OfferState;
  revisions: OfferRevision[];
  createdAt: string;
  updatedAt: string;
  company: string;
  title: string;
  /** The posting's advertised pay, annual, in whole currency units. */
  postingPay: {
    min: number;
    max: number;
    currency: string;
  } | null;
}

/** An application at Offer that has no offer recorded yet. */
export interface PendingOfferApplication {
  applicationId: string;
  company: string;
  title: string;
}

/** An application that "Accept" may offer to withdraw. */
export interface OpenApplication {
  id: string;
  company: string;
  title: string;
  status: string;
}

export interface OfferTotals {
  /** Base pay for a full-time year, minor units. */
  annualBase: number;
  /** Target bonus per year. */
  bonus: number;
  signOn: number;
  equityPerYear: number;
  /** Year one: base + bonus + sign-on + equity per year. */
  firstYear: number;
  /** After year one: base + bonus + equity per year. */
  yearly: number;
}

type TotalsInput =
  Pick<
    AmountSnapshot,
    | 'basePay'
    | 'payPeriod'
    | 'hoursPerWeek'
    | 'bonusAmount'
    | 'bonusPercent'
    | 'signOn'
    | 'equityGrant'
    | 'equityYears'
  >;

function minor(
  value:
    | string
    | number
    | null
    | undefined,
): number {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  )
    return 0;
  const n =
    typeof value ===
    'number'
      ? value
      : Number(
          value,
        );
  return Number.isFinite(
    n,
  )
    ? n
    : 0;
}

/** Base pay for a year: monthly x 12, hourly x hours per week x 52. */
export function annualise(
  basePay:
    | string
    | number,
  payPeriod: OfferPayPeriod,
  hoursPerWeek:
    | number
    | null,
): number {
  const base =
    minor(
      basePay,
    );
  if (
    payPeriod ===
    'month'
  )
    return (
      base *
      12
    );
  if (
    payPeriod ===
    'hour'
  )
    return (
      base *
      (hoursPerWeek ??
        0) *
      WEEKS_PER_YEAR
    );
  return base;
}

export function offerTotals(
  offer: TotalsInput,
): OfferTotals {
  const annualBase =
    annualise(
      offer.basePay,
      offer.payPeriod,
      offer.hoursPerWeek,
    );
  const bonus =
    offer.bonusAmount !==
      null &&
    offer.bonusAmount !==
      undefined
      ? minor(
          offer.bonusAmount,
        )
      : offer.bonusPercent !==
            null &&
          offer.bonusPercent !==
            undefined
        ? Math.round(
            (annualBase *
              offer.bonusPercent) /
              100,
          )
        : 0;
  const signOn =
    minor(
      offer.signOn,
    );
  const equityPerYear =
    offer.equityGrant &&
    offer.equityYears
      ? Math.round(
          minor(
            offer.equityGrant,
          ) /
            offer.equityYears,
        )
      : 0;
  return {
    annualBase,
    bonus,
    signOn,
    equityPerYear,
    firstYear:
      annualBase +
      bonus +
      signOn +
      equityPerYear,
    yearly:
      annualBase +
      bonus +
      equityPerYear,
  };
}

export interface HighestMarks {
  firstYear: Set<string>;
  yearly: Set<string>;
}

/**
 * The offer(s) with the highest first-year and yearly total in each currency.
 * Declined offers are out of the comparison, and a currency with fewer than two
 * live offers has nothing to be highest against. Ties are all marked.
 */
export function highestPerCurrency(
  offers: Array<
    TotalsInput & {
      id: string;
      currency: string;
      state: string;
    }
  >,
): HighestMarks {
  const byCurrency =
    new Map<
      string,
      Array<{
        id: string;
        totals: OfferTotals;
      }>
    >();
  for (const offer of offers) {
    if (
      offer.state ===
      'declined'
    )
      continue;
    const list =
      byCurrency.get(
        offer.currency,
      ) ??
      [];
    list.push(
      {
        id: offer.id,
        totals:
          offerTotals(
            offer,
          ),
      },
    );
    byCurrency.set(
      offer.currency,
      list,
    );
  }
  const marks: HighestMarks =
    {
      firstYear:
        new Set(),
      yearly:
        new Set(),
    };
  for (const list of byCurrency.values()) {
    if (
      list.length <
      2
    )
      continue;
    const topFirst =
      Math.max(
        ...list.map(
          (
            o,
          ) =>
            o
              .totals
              .firstYear,
        ),
      );
    const topYearly =
      Math.max(
        ...list.map(
          (
            o,
          ) =>
            o
              .totals
              .yearly,
        ),
      );
    for (const o of list) {
      if (
        o
          .totals
          .firstYear ===
        topFirst
      )
        marks.firstYear.add(
          o.id,
        );
      if (
        o
          .totals
          .yearly ===
        topYearly
      )
        marks.yearly.add(
          o.id,
        );
    }
  }
  return marks;
}

/** Fraction digits of a currency (2 for USD, 0 for JPY, 3 for KWD). */
export function currencyDigits(
  currency: string,
): number {
  try {
    return (
      new Intl.NumberFormat(
        'en',
        {
          style:
            'currency',
          currency,
        },
      ).resolvedOptions()
        .maximumFractionDigits ??
      2
    );
  } catch {
    return 2;
  }
}

/** Minor units to a plain decimal string in major units ("85000.50"), no grouping. */
export function minorToDecimal(
  value:
    | string
    | number,
  currency: string,
): string {
  const digits =
    currencyDigits(
      currency,
    );
  const n =
    minor(
      value,
    );
  if (
    digits ===
    0
  )
    return String(
      n,
    );
  const scale =
    10 **
    digits;
  const whole =
    Math.floor(
      n /
        scale,
    );
  const frac =
    String(
      n %
        scale,
    ).padStart(
      digits,
      '0',
    );
  return `${whole}.${frac}`;
}

/** A typed major-unit amount ("85,000.5", "85000") to minor units; null when it is not an amount. */
export function decimalToMinor(
  text: string,
  currency: string,
):
  | number
  | null {
  const cleaned =
    text
      .trim()
      .replace(
        /[\s,_]/g,
        '',
      );
  if (
    !/^\d+(\.\d+)?$/.test(
      cleaned,
    )
  )
    return null;
  const digits =
    currencyDigits(
      currency,
    );
  const [
    whole = '0',
    frac = '',
  ] =
    cleaned.split(
      '.',
    );
  if (
    frac.length >
    digits
  )
    return null;
  const n =
    Number(
      whole,
    ) *
      10 **
        digits +
    Number(
      frac.padEnd(
        digits,
        '0',
      ) ||
        '0',
    );
  return Number.isSafeInteger(
    n,
  )
    ? n
    : null;
}

/** Cross-field problems, as codes the form turns into messages. Empty when the offer is sound. */
export type OfferProblem =
  | 'hoursRequired'
  | 'bonusBoth'
  | 'equityPair';

export function offerProblems(
  offer: Pick<
    AmountSnapshot,
    | 'payPeriod'
    | 'hoursPerWeek'
    | 'bonusAmount'
    | 'bonusPercent'
    | 'equityGrant'
    | 'equityYears'
  >,
): OfferProblem[] {
  const problems: OfferProblem[] =
    [];
  if (
    offer.payPeriod ===
      'hour' &&
    !offer.hoursPerWeek
  )
    problems.push(
      'hoursRequired',
    );
  if (
    offer.bonusAmount !==
      null &&
    offer.bonusPercent !==
      null
  )
    problems.push(
      'bonusBoth',
    );
  if (
    (offer.equityGrant ===
      null) !==
    (offer.equityYears ===
      null)
  )
    problems.push(
      'equityPair',
    );
  return problems;
}

function snapshotValue(
  value: unknown,
):
  | string
  | number
  | null {
  if (
    value ===
      null ||
    value ===
      undefined
  )
    return null;
  return typeof value ===
    'number'
    ? value
    : String(
        value,
      );
}

/** The amount fields of a stored or incoming offer, normalised for comparison. */
export function amountSnapshot(
  offer: Record<
    AmountField,
    unknown
  >,
): AmountSnapshot {
  return {
    currency:
      String(
        offer.currency,
      ),
    basePay:
      String(
        offer.basePay,
      ),
    payPeriod:
      offer.payPeriod as OfferPayPeriod,
    hoursPerWeek:
      snapshotValue(
        offer.hoursPerWeek,
      ) as
        | number
        | null,
    bonusAmount:
      snapshotValue(
        offer.bonusAmount,
      ) as
        | string
        | null,
    bonusPercent:
      snapshotValue(
        offer.bonusPercent,
      ) as
        | number
        | null,
    signOn:
      snapshotValue(
        offer.signOn,
      ) as
        | string
        | null,
    equityGrant:
      snapshotValue(
        offer.equityGrant,
      ) as
        | string
        | null,
    equityYears:
      snapshotValue(
        offer.equityYears,
      ) as
        | number
        | null,
  };
}

/**
 * The revision to store when an edit changes any amount: the previous amounts
 * and when they were replaced. `null` when no amount changed (a change to notes,
 * location or dates is not a revision).
 */
export function revisionFor(
  previous: Record<
    AmountField,
    unknown
  >,
  next: Record<
    AmountField,
    unknown
  >,
  now: Date,
): OfferRevision | null {
  const before =
    amountSnapshot(
      previous,
    );
  const after =
    amountSnapshot(
      next,
    );
  const changed =
    AMOUNT_FIELDS.some(
      (
        field,
      ) =>
        before[
          field
        ] !==
        after[
          field
        ],
    );
  return changed
    ? {
        at: now.toISOString(),
        previous:
          before,
      }
    : null;
}

/** Append a revision, keeping the newest `MAX_REVISIONS`. */
export function appendRevision(
  existing: OfferRevision[],
  revision: OfferRevision | null,
): OfferRevision[] {
  if (
    !revision
  )
    return existing;
  return [
    ...existing,
    revision,
  ].slice(
    -MAX_REVISIONS,
  );
}

/**
 * The follow-up date a deadline asks for: the day before the deadline (never
 * earlier than today, so a deadline tomorrow still reminds today), unless the
 * member already has a follow-up that is earlier than that and not yet past.
 * Days are UTC calendar days (offer dates are stored as UTC midnight). Returns
 * the date to store, or `null` to leave `followUpDate` as it is.
 */
export function followUpForDeadline(
  deadline: Date,
  existing: Date | null,
  now: Date,
): Date | null {
  const today =
    dayOf(
      now.getTime(),
      'UTC',
    );
  const dayBefore =
    addDays(
      dayOf(
        deadline.getTime(),
        'UTC',
      ),
      -1,
    );
  const candidate =
    dayBefore <
    today
      ? today
      : dayBefore;
  if (
    existing
  ) {
    const existingDay =
      dayOf(
        existing.getTime(),
        'UTC',
      );
    if (
      existingDay >=
        today &&
      existingDay <=
        candidate
    )
      return null;
  }
  const p =
    parseDay(
      candidate,
    );
  if (
    !p
  )
    return null;
  return new Date(
    Date.UTC(
      p.y,
      p.mo -
        1,
      p.d,
    ),
  );
}

/** `YYYY-MM-DD` of a date stored at UTC midnight. */
export function dayKey(
  date: Date,
): string {
  return dayString(
    date.getUTCFullYear(),
    date.getUTCMonth() +
      1,
    date.getUTCDate(),
  );
}

export const OFFER_CSV_COLUMNS =
  [
    'company',
    'role',
    'state',
    'currency',
    'basePay',
    'payPeriod',
    'annualBase',
    'targetBonus',
    'signOn',
    'equityPerYear',
    'firstYearTotal',
    'yearlyTotal',
    'location',
    'remote',
    'ptoDays',
    'startDate',
    'deadline',
    'notes',
  ] as const;

/** The comparison as CSV: amounts in major units, one row per offer. */
export function offersToCsv(
  offers: Array<
    Pick<
      OfferDto,
      | 'company'
      | 'title'
      | 'state'
      | 'currency'
      | 'basePay'
      | 'payPeriod'
      | 'hoursPerWeek'
      | 'bonusAmount'
      | 'bonusPercent'
      | 'signOn'
      | 'equityGrant'
      | 'equityYears'
      | 'location'
      | 'remote'
      | 'ptoDays'
      | 'startDate'
      | 'deadline'
      | 'notes'
    >
  >,
): string {
  const rows =
    offers.map(
      (
        offer,
      ) => {
        const totals =
          offerTotals(
            offer,
          );
        const money =
          (
            value: number,
          ) =>
            minorToDecimal(
              value,
              offer.currency,
            );
        return {
          company:
            offer.company,
          role: offer.title,
          state:
            offer.state,
          currency:
            offer.currency,
          basePay:
            minorToDecimal(
              offer.basePay,
              offer.currency,
            ),
          payPeriod:
            offer.payPeriod,
          annualBase:
            money(
              totals.annualBase,
            ),
          targetBonus:
            money(
              totals.bonus,
            ),
          signOn:
            money(
              totals.signOn,
            ),
          equityPerYear:
            money(
              totals.equityPerYear,
            ),
          firstYearTotal:
            money(
              totals.firstYear,
            ),
          yearlyTotal:
            money(
              totals.yearly,
            ),
          location:
            offer.location,
          remote:
            offer.remote,
          ptoDays:
            offer.ptoDays,
          startDate:
            offer.startDate,
          deadline:
            offer.deadline,
          notes:
            offer.notes,
        };
      },
    );
  return encodeCsv(
    rows,
    [
      ...OFFER_CSV_COLUMNS,
    ],
  );
}

/** A minor-unit amount as localised money ("$85,000.00"). */
export function formatMinor(
  value:
    | string
    | number,
  currency: string,
  locale: string,
): string {
  const digits =
    currencyDigits(
      currency,
    );
  const amount =
    minor(
      value,
    ) /
    10 **
      digits;
  try {
    return new Intl.NumberFormat(
      locale,
      {
        style:
          'currency',
        currency,
        maximumFractionDigits:
          digits,
      },
    ).format(
      amount,
    );
  } catch {
    return `${amount} ${currency}`;
  }
}

/** A `YYYY-MM-DD` day as a localised date; the day is a calendar date, so no time zone shifts it. */
export function formatDay(
  day: string,
  locale: string,
): string {
  const p =
    parseDay(
      day,
    );
  if (
    !p
  )
    return day;
  return new Intl.DateTimeFormat(
    locale,
    {
      dateStyle:
        'medium',
      timeZone:
        'UTC',
    },
  ).format(
    new Date(
      Date.UTC(
        p.y,
        p.mo -
          1,
        p.d,
      ),
    ),
  );
}
