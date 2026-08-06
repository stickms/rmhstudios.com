/**
 * The Kaikai Debt Counter — the arithmetic, the contract, the constants.
 *
 * Client-safe on purpose. The counter has to tick at frame rate in the browser
 * AND render a stable number during SSR, which only works if both sides run the
 * *same* function over the *same* inputs. Anything that reaches for Prisma lives
 * in `ledger.server.ts` / `receipts.server.ts`; everything here is pure.
 *
 * ## How the number goes up
 *
 * Interest. Only interest. There is no flat per-second drip bolted on to make
 * the digits move — one growth mechanism, compounded continuously:
 *
 * ```
 *   total(t) = basis · e^(r · years(t))
 * ```
 *
 * Every debt earns interest **from the moment it was logged**, so a burrito
 * Kaikai owed you in February is worth more today than one from this morning.
 * That is the whole reason anyone would bother logging it.
 *
 * Naively that is a sum of N exponentials and the client would need every row to
 * draw one number. It isn't, because the sum factorises:
 *
 * ```
 *   Σ aᵢ·e^(r·(t − tᵢ))  =  e^(r·t) · Σ aᵢ·e^(−r·tᵢ)
 *                                     └──── constant ────┘
 * ```
 *
 * That trailing sum is the **basis**: one scalar, computed once by the server,
 * that carries the whole ledger's accrual history. The client multiplies it by
 * `e^(r·t)` on every frame and gets an exact answer; a new entry arriving over
 * SSE is `basis += contribution(entry)` — no refetch, no drift, no per-row
 * bookkeeping in the browser. It is also what makes an *infinite* ledger
 * affordable: the counter never needs to hold, or even know about, the rows.
 *
 * ## He starts at zero
 *
 * There is no opening balance. The counter begins at $0.00 and every cent on it
 * was put there by somebody — which means the number is *earned*, and the log
 * below it is a complete explanation of the total rather than a footnote to a
 * seeded figure.
 *
 * The consequence, stated plainly because it is visible on day one: the growth
 * rate is `total · r`, so an empty ledger grows at exactly nothing and a small
 * one grows slowly. At $50 of logged debt the fourth decimal moves about once a
 * minute. That is not a bug to paper over with a fake drip — it is what "he
 * starts at zero and only interest grows it" means. {@link odometerDecimals}
 * handles the *presentation* side by showing more precision while the pile is
 * small, so the counter reads as alive at every scale, but the economics are
 * left honest: no debt, no growth.
 *
 * ## Why there are three numbers on the page, not one
 *
 * Exponential growth and small line items still cannot share a single readout —
 * once the pile is large, a $6 burrito is invisible in it. So the page states
 * all three and lets each do its own job:
 *
 *  - **the counter** — `projectDebtCents`, interest on everything, the spectacle;
 *  - **itemised** — face value of every receipt on the books, which is what
 *    grows as you scroll;
 *  - **logged by members** — face value of what actual people added.
 *
 * Every row additionally shows its own compounded worth ({@link entryValueCents}),
 * so an individual debt has somewhere its growth is legible.
 *
 * ## Money representation
 *
 * Logged amounts are **integer cents** (`KaikaiDebtEntry.amountCents`) — exact,
 * and what the ledger is audited against. The *projection* is a float, because
 * continuous compounding is a float and rounding it per-frame would make the
 * counter stutter. Never round-trip a projected value back into the database.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * When the meter started running. Fixed forever — moving it retroactively
 * rewrites every number on the page, including screenshots people have already
 * posted.
 *
 * It is also the boundary the ledger is built around: member entries are logged
 * after it, and the generated receipts walk backwards from it into the years
 * before anyone was counting.
 */
export const DEBT_EPOCH_MS = Date.UTC(2026, 0, 1);

/**
 * The balance on the books before anyone added anything: **zero**.
 *
 * Kaikai starts clean. Every cent the counter shows is traceable to a row in
 * the log, which is what makes the log an explanation of the total rather than
 * a decorative list next to a made-up number.
 *
 * Kept as a named constant rather than deleted, because it is still the place
 * the basis starts from (`ledger.server.ts` folds it in exactly once) and
 * because "the opening balance is zero, deliberately" is a fact worth being
 * able to point at. Setting it non-zero would work — it would just be a debt
 * nobody can account for.
 */
export const SEED_DEBT_CENTS = 0;

/**
 * Continuously compounded annual rate. 1.25 ≈ 249% APY, which is a number no
 * real lender would write down and exactly the number this bit calls for.
 *
 * It also sets the horizon: the pile multiplies by ~3.5× a year, so the counter
 * stays readable for years and eventually becomes absurd, which is the intended
 * arc rather than a defect.
 */
export const ANNUAL_INTEREST_RATE = 1.25;

/** Mean Gregorian year. Used only to convert the rate; nothing depends on the calendar. */
const SECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60;

/* --- Line items ----------------------------------------------------------- */

/**
 * The band the **generated** receipts are drawn from: $5 to $250.
 *
 * This is the texture of his back history — not one dramatic loan, a few
 * thousand small ones. It applies only to `sampleDebtCents`; a debt a real
 * person adds is priced by the appraiser and is not bounded by it (see
 * {@link MAX_STORABLE_CENTS}).
 */
export const MIN_RECEIPT_CENTS = 500;
export const MAX_RECEIPT_CENTS = 25_000;

/**
 * How hard the sampled distribution leans on the floor. See
 * {@link sampleDebtCents} — 3 puts the median around $8 and makes anything past
 * $100 genuinely rare.
 */
const AMOUNT_SKEW = 3;

/**
 * The smallest debt that can be logged. One cent — the floor exists only to
 * stop a zero or a negative, either of which would be a credit rather than a
 * debt and would let the counter go *down*.
 */
export const MIN_ENTRY_CENTS = 1;

/**
 * The largest amount that can be stored, in cents — **not a policy limit**.
 *
 * There is deliberately no cap on what a member's debt can be appraised at: if
 * the appraiser decides Kaikai owes you a car, it owes you a car. This number is
 * the `Int` column's ceiling (`2^31 − 1` cents ≈ $21.47M) and exists so an
 * absurd appraisal is clamped instead of throwing on insert. A ceiling imposed
 * by the storage type is worth naming as exactly that, so nobody later reads it
 * as an editorial judgement about how much he is allowed to owe.
 *
 * Widening it means migrating the column to `BigInt`, at which point the basis
 * arithmetic (doubles) becomes the next limit — around $90 trillion, which is
 * comfortably past the point where the joke has stopped being legible anyway.
 */
export const MAX_STORABLE_CENTS = 2_147_483_647;

/** Length ceilings, enforced on both the model's output and the user's input. */
export const MAX_CLAIM_CHARS = 500;
export const MAX_QUESTION_CHARS = 300;
export const MAX_ITEM_CHARS = 80;
export const MAX_NOTE_CHARS = 180;

/** How many rows one page of the infinite ledger carries. */
export const LEDGER_PAGE_SIZE = 20;

/**
 * How far apart generated receipts sit in time, walking backwards from the
 * epoch. ~3.2 hours, so a page of 20 covers a bit under three days and scrolling
 * for a while genuinely walks back through years of small purchases.
 *
 * Deterministic rather than jittered: the value is what makes each generated
 * `createdAt` unique, and uniqueness is what keeps keyset pagination total. Two
 * rows sharing a timestamp is a page boundary that can drop or repeat a row.
 */
export const RECEIPT_STRIDE_MS = 11_500_000;

/**
 * Where a row came from.
 *
 * `member` — a signed-in person added it, `addedById` is set, and `claim` holds
 * what they actually typed.
 * `ledger`  — generated by DeepSeek and cached, filling the history below the
 * fold. No author, because nobody wrote it.
 */
export const DEBT_SOURCES = ['member', 'ledger'] as const;
export type DebtSource = (typeof DEBT_SOURCES)[number];

/**
 * What a debt can be. A closed list rather than free text so the log can be
 * filtered and totalled by kind, and so the model cannot invent a taxonomy that
 * grows by one category per submission.
 */
export const DEBT_CATEGORIES = [
  'food',
  'transit',
  'rent',
  'gear',
  'gambling',
  'emotional',
  'temporal',
  'other',
] as const;

export type DebtCategory = (typeof DEBT_CATEGORIES)[number];

export function isDebtCategory(value: unknown): value is DebtCategory {
  return typeof value === 'string' && (DEBT_CATEGORIES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* The arithmetic                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Seconds since the epoch, floored at zero.
 *
 * The floor is load-bearing twice over: it stops a client whose clock is set
 * early from rendering a total that ticks *down*, and it is what gives the
 * pre-epoch generated receipts an accrual factor of exactly 1 — a receipt from
 * 2019 contributes its face value to the basis rather than an exponentially
 * discounted sliver of it.
 */
export function secondsSinceEpoch(atMs: number): number {
  return Math.max(0, (atMs - DEBT_EPOCH_MS) / 1000);
}

/**
 * `e^(r·t)` — what one cent logged at the epoch is worth at `atMs`.
 *
 * Also the divisor in {@link basisContribution}, which is what keeps the two in
 * step: an entry's contribution is defined as "whatever, multiplied by this
 * factor at its own timestamp, gives back its face value".
 */
export function accrualFactor(atMs: number): number {
  return Math.exp((ANNUAL_INTEREST_RATE * secondsSinceEpoch(atMs)) / SECONDS_PER_YEAR);
}

/**
 * An entry's share of the basis: its face value discounted back to the epoch.
 *
 * Summing this over the ledger gives the scalar the projection needs. Adding one
 * entry to a known basis is a `+=`, which is what makes the live stream cheap.
 */
export function basisContribution(amountCents: number, createdAtMs: number): number {
  return amountCents / accrualFactor(createdAtMs);
}

/** What a single logged debt is worth right now — face value, compounded since it was logged. */
export function entryValueCents(amountCents: number, createdAtMs: number, atMs: number): number {
  return basisContribution(amountCents, createdAtMs) * accrualFactor(atMs);
}

/**
 * The headline number, in cents, at `atMs`.
 *
 * `basisCents` already includes {@link SEED_DEBT_CENTS} — the server folds it in
 * so there is exactly one place that decides what the opening balance is.
 */
export function projectDebtCents(basisCents: number, atMs: number): number {
  return basisCents * accrualFactor(atMs);
}

/**
 * How fast the total is currently climbing, in cents per second.
 *
 * The derivative of the projection: `d/dt (basis·e^(r·t)) = r · total`. Shown
 * under the counter so the growth is legible as a rate and not just as a blur,
 * and genuinely derived rather than a second hardcoded number that could
 * disagree with the digits above it.
 */
export function debtVelocityCentsPerSecond(basisCents: number, atMs: number): number {
  return (projectDebtCents(basisCents, atMs) * ANNUAL_INTEREST_RATE) / SECONDS_PER_YEAR;
}

/** The window a growth rate is quoted over. */
export type VelocityUnit = 'second' | 'minute' | 'hour' | 'day';

const VELOCITY_WINDOWS: readonly { unit: VelocityUnit; seconds: number }[] = [
  { unit: 'second', seconds: 1 },
  { unit: 'minute', seconds: 60 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'day', seconds: 86_400 },
];

/**
 * The growth rate, quoted over whatever window makes it a readable number.
 *
 * Without an opening balance the rate spans orders of magnitude: a young ledger
 * grows by a fraction of a cent per second, a mature one by dollars. Quoting
 * everything per-second means the honest early answer renders as "+$0.00 every
 * second", which tells the reader the counter is broken rather than that it is
 * young. So the window widens until the figure has something in it — cents per
 * second at scale, dollars per day at the start.
 *
 * Returns the `second` window for a zero rate: "nothing per second" is the
 * correct statement for a debt of nothing, and widening the window would not
 * make it any less zero.
 */
export function describeVelocity(
  basisCents: number,
  atMs: number,
): { cents: number; unit: VelocityUnit } {
  const perSecond = debtVelocityCentsPerSecond(basisCents, atMs);
  if (!Number.isFinite(perSecond) || perSecond <= 0) return { cents: 0, unit: 'second' };
  for (const { unit, seconds } of VELOCITY_WINDOWS) {
    const scaled = perSecond * seconds;
    // One cent is the smallest thing `formatDebt` can show, so that is the bar
    // for a window being worth quoting.
    if (scaled >= 1 || unit === 'day') return { cents: scaled, unit };
  }
  return { cents: perSecond, unit: 'second' };
}

/**
 * Draw one debt amount in cents, skewed hard toward the $5 floor.
 *
 * A uniform draw over [$5, $250] averages $127, which would make every receipt
 * feel like a car repair. Raising a uniform `u` to a power before mapping it
 * across the range geometrically pulls the mass down to the floor: at
 * {@link AMOUNT_SKEW} = 3 the median lands near $8, three quarters of the draws
 * are under $20, and $250 shows up roughly once in a thousand — which is the
 * shape of somebody's actual spending, and the shape the joke needs.
 *
 * Takes its randomness as an argument so the distribution is testable without
 * stubbing globals, and so a caller that needs a reproducible batch can pass a
 * seeded generator.
 */
export function sampleDebtCents(random: () => number = Math.random): number {
  const u = Math.min(1, Math.max(0, random()));
  const ratio = MAX_RECEIPT_CENTS / MIN_RECEIPT_CENTS;
  const cents = Math.round(MIN_RECEIPT_CENTS * Math.pow(ratio, Math.pow(u, AMOUNT_SKEW)));
  return Math.min(MAX_RECEIPT_CENTS, Math.max(MIN_RECEIPT_CENTS, cents));
}

/**
 * Make an appraised amount storable.
 *
 * Not a policy clamp — there is no upper limit on what a member's debt may be
 * worth. This only enforces the two things the database and the arithmetic
 * genuinely require: a positive whole number of cents, and one that fits the
 * column ({@link MAX_STORABLE_CENTS}).
 *
 * Non-finite input floors to the minimum rather than saturating at the maximum.
 * Non-finite means the appraisal came back garbage, and garbage should buy the
 * smallest possible entry, never the largest.
 */
export function clampEntryCents(cents: number): number {
  if (!Number.isFinite(cents)) return MIN_ENTRY_CENTS;
  return Math.min(MAX_STORABLE_CENTS, Math.max(MIN_ENTRY_CENTS, Math.round(cents)));
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const DEBT_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `1234.5` cents → `"$12.35"`.
 *
 * Locale-independent on purpose. Every other number on the site is formatted for
 * the reader's locale; this one is not, because the counter is a fixed-width
 * odometer and a locale that groups digits differently changes its width mid-tick
 * — the whole row would jitter sideways eight times a second. The currency is a
 * joke denominated in dollars regardless of who is reading it.
 */
export function formatDebt(cents: number): string {
  return DEBT_FORMAT.format(cents / 100);
}

/** `1500` cents → `"$15.00"`. Same formatter; named for the call sites that mean "a price". */
export const formatCents = formatDebt;

/**
 * Sub-cent digits the odometer shows, beyond the two in {@link formatDebt}.
 *
 * With no opening balance the counter has to work across an enormous range: on
 * launch day the whole debt might be $12, and a year of people adding to it
 * could put it in the millions. Growth is `total · r`, so a fixed precision is
 * wrong at one end or the other — two decimals on a $12 debt is a display that
 * changes once an hour and reads as broken, while six decimals on a $2M debt is
 * four columns of pure noise.
 *
 * So the precision follows the number: enough digits that the last one turns a
 * few times a second, and no more. It is presentation only — nothing about the
 * debt itself changes — and because the total only ever grows, the digit count
 * only ever shrinks, one column at a time, and never oscillates.
 *
 * Returns 0 for a zero (or non-finite) total: nothing is accruing, and
 * `$0.000000` would be pretending otherwise.
 */
export function odometerDecimals(totalCents: number): number {
  const velocity = (totalCents * ANNUAL_INTEREST_RATE) / SECONDS_PER_YEAR;
  if (!Number.isFinite(velocity) || velocity <= 0) return 0;
  const needed = Math.ceil(Math.log10(TARGET_TICKS_PER_SECOND / velocity));
  return Math.min(MAX_ODOMETER_DECIMALS, Math.max(0, needed));
}

/** How often the last displayed digit should turn over, in Hz. Fast enough to blur. */
const TARGET_TICKS_PER_SECOND = 4;

/**
 * Four extra columns is the most that still reads as a number rather than as a
 * hash. Below roughly $200 of total debt the last digit turns slower than the
 * target — correctly, because at that point there is barely any debt to accrue.
 */
const MAX_ODOMETER_DECIMALS = 4;

/**
 * The sub-cent digits themselves, zero-padded — e.g. `1234.5678` cents with
 * `digits = 3` → `"567"`. Rendered small and dim next to {@link formatDebt}.
 */
export function formatMicroDigits(cents: number, digits: number): string {
  if (digits <= 0) return '';
  const fraction = cents - Math.floor(cents);
  return String(Math.floor(fraction * 10 ** digits)).padStart(digits, '0');
}

/* -------------------------------------------------------------------------- */
/* Wire contract                                                              */
/* -------------------------------------------------------------------------- */

/** One line of the debt log, as the API serialises it. */
export interface DebtEntryDto {
  id: string;
  source: DebtSource;
  /** What he owes. The headline of the log row. */
  item: string;
  /** Why he owes it — the one-line justification. This is the "log" part of the debt log. */
  note: string;
  category: DebtCategory;
  amountCents: number;
  /** What the submitter actually typed. Null on generated rows, which had no submitter. */
  claim: string | null;
  /** Epoch millis — a number, not an ISO string, because the client does maths with it. */
  createdAtMs: number;
  addedBy: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  } | null;
}

/** One page of the infinite ledger. */
export interface DebtLedgerPage {
  entries: DebtEntryDto[];
  /**
   * Opaque cursor for the next page (the oldest `createdAtMs` returned), or null
   * when the server could not extend the ledger this time — a generation lock
   * held elsewhere, AI unconfigured, or an anonymous reader at the frontier.
   * Null means "ask again later", never "the debt is finite".
   */
  nextCursor: string | null;
  /** True when this page was freshly conjured rather than served from cache. */
  generated: boolean;
  /** Running totals after this page, so the counter self-heals as you scroll. */
  basisCents: number;
  principalCents: number;
  entryCount: number;
}

/** Everything the page needs to draw a live counter with no second request. */
export interface DebtSnapshot {
  /** Sum of every entry discounted to the epoch, plus the seed. Feeds {@link projectDebtCents}. */
  basisCents: number;
  /** Face value of every row on the books, undiscounted. Grows as the ledger is itemised. */
  principalCents: number;
  /** Face value of just the member-added rows — what actual people put on his tab. */
  memberPrincipalCents: number;
  entryCount: number;
  memberEntryCount: number;
  /** Distinct signed-in humans who have added something. */
  contributorCount: number;
  /** Server clock when this was built. The client renders THIS first, then goes live. */
  asOfMs: number;
  entries: DebtEntryDto[];
  nextCursor: string | null;
  /** False when `DEEPSEEK_API_KEY` is unset — the page hides its AI affordances. */
  aiEnabled: boolean;
}

/** Pushed to every open counter when someone adds to the pile. */
export interface DebtStreamEvent {
  type: 'entry.added';
  entry: DebtEntryDto;
  /** The authoritative post-insert values, so a client that missed an event self-heals. */
  basisCents: number;
  principalCents: number;
  memberPrincipalCents: number;
  entryCount: number;
  memberEntryCount: number;
  /**
   * Included even though it usually does not change: a first-time creditor's
   * addition is exactly when it does, and a stat that only corrects itself on
   * reload is a stat that is wrong on the one occasion anyone is watching it.
   */
  contributorCount: number;
}
