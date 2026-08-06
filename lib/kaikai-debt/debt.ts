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
 * ## Why there are three numbers on the page, not one
 *
 * Exponential growth and small line items cannot share a single readout. The
 * counter's growth rate is `total · r`, so visibly rolling digits require a pile
 * in the hundreds of thousands — at which point a $6 burrito is invisible in it.
 * Shrink the pile until the burrito shows and the digits stop moving, and the
 * page looks broken. There is no rate that fixes this; it is the shape of `e^x`.
 *
 * So the page states all three honestly and lets each do its own job:
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
 * The balance already on the books when the counter switched on, in cents.
 *
 * Contributed to the basis at the epoch, so it compounds exactly like every
 * other line. It is a constant rather than a row because it has no author and
 * no itemisation — it is the aggregate the receipts below the fold are slowly
 * explaining, one $6 line at a time.
 *
 * Sized, per the note above, so that interest alone moves the cents column
 * about eight times a second on day one. Interest is the only motor; this is
 * the flywheel it turns.
 */
export const SEED_DEBT_CENTS = 100_000_000;

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
 * What one debt can be worth, in cents: five dollars to two hundred and fifty.
 *
 * The floor is the point of the whole bit — Kaikai's debt is not one dramatic
 * loan, it is two thousand small ones. The ceiling exists so a single entry
 * cannot swamp the ledger, and both are enforced server-side after the model
 * answers, because a prompt is a request and a clamp is a guarantee.
 */
export const MIN_ENTRY_CENTS = 500;
export const MAX_ENTRY_CENTS = 25_000;

/**
 * How hard the sampled distribution leans on the floor. See
 * {@link sampleDebtCents} — 3 puts the median around $8 and makes anything past
 * $100 genuinely rare.
 */
const AMOUNT_SKEW = 3;

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
  const ratio = MAX_ENTRY_CENTS / MIN_ENTRY_CENTS;
  const cents = Math.round(MIN_ENTRY_CENTS * Math.pow(ratio, Math.pow(u, AMOUNT_SKEW)));
  return clampEntryCents(cents);
}

/** Force any proposed amount into the allowed band. Non-finite input floors to the minimum. */
export function clampEntryCents(cents: number): number {
  if (!Number.isFinite(cents)) return MIN_ENTRY_CENTS;
  return Math.min(MAX_ENTRY_CENTS, Math.max(MIN_ENTRY_CENTS, Math.round(cents)));
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
