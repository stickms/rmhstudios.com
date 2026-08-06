/**
 * Kaikai's credit score. Client-safe, pure, and violently unstable.
 *
 * ## It is a function of the clock, and that is the whole design
 *
 * `score(atMs, inputs)` takes a timestamp and returns a number. It holds no
 * state, starts no timer and remembers nothing, which buys four separate things
 * that would each otherwise need their own machinery:
 *
 *  1. **SSR and hydration agree by construction.** The server renders the score
 *     at its own clock and hands that instant down; the client's first paint
 *     evaluates the same function at the same instant and produces the same
 *     string. The counter above it uses exactly this trick (`DebtCounter`) for
 *     exactly this reason.
 *  2. **Everyone watching sees the same number.** Two people on the page at the
 *     same moment see the same score, because there is no per-session random
 *     seed anywhere — the "randomness" is a hash of the time bucket. A shared
 *     hallucination is much funnier than a private one.
 *  3. **The history chart is free.** A rolling chart normally has to accumulate
 *     samples and therefore starts empty and fills in over a minute. This one
 *     evaluates the last five minutes on mount and is fully populated on the
 *     first frame — and scrubbing *backwards* through it is exact rather than
 *     an approximation from a buffer.
 *  4. **Nothing drifts.** A tab that slept for an hour resumes at the correct
 *     value with no reconciliation, because there is no accumulated state to be
 *     wrong.
 *
 * ## Where the volatility comes from
 *
 * Three superimposed mechanisms, because one alone reads as fake:
 *
 *  - **Waves** — six sinusoids on deliberately incommensurate periods (0.41s to
 *    ~15 minutes). Their sum never repeats on any timescale a viewer will watch,
 *    which is what stops the readout looking like a looping animation.
 *  - **Value noise** — hash-derived samples at {@link NOISE_HZ}, smoothstep-
 *    interpolated between them. This is the flicker: it is what makes the last
 *    two digits unreadable, without making the *line* on the chart a solid band
 *    of static.
 *  - **Shocks** — discrete events on a fixed grid, each fired or not by a hash of
 *    its own slot, with a hard onset and an exponential decay. These are the
 *    cliffs: the score drops eighty points in a frame and claws back over the
 *    next few seconds, which is the behaviour that makes it read as a live feed
 *    of something going badly rather than as a decorative wobble.
 *
 * All three are scaled by a `volatility` multiplier so the panel's stress-test
 * control has something honest to move — it changes the amplitude of the model,
 * not the rendering.
 *
 * ## It is a joke, and the arithmetic is still real
 *
 * The anchor is derived from the actual ledger: utilisation from the compounded
 * balance, history length from the oldest row, credit mix from how many
 * categories he has managed to owe money in. So the number is nonsense in the
 * way a credit score is nonsense, not in the way a random number generator is —
 * add a large debt and the whole distribution shifts down, permanently.
 */

import { accrualFactor } from './debt';

/* -------------------------------------------------------------------------- */
/* The scale                                                                  */
/* -------------------------------------------------------------------------- */

/** The floor and ceiling of the scale, matching the one everybody recognises. */
export const CREDIT_MIN = 300;
export const CREDIT_MAX = 850;

/**
 * The score a perfect borrower would have, before any of Kaikai's penalties.
 * Nothing ever reaches it; it is the number the deductions are taken from.
 */
const CREDIT_PERFECT = 850;

/**
 * How often the viewer repaints, in ms — ~14×/second, the same cadence as the
 * odometer and for the same reason: fast enough that the last digits blur, slow
 * enough that it is a text write rather than a frame budget.
 */
export const CREDIT_TICK_MS = 70;

/** Reduced motion: still live, just not strobing. */
export const CREDIT_REDUCED_TICK_MS = 1_000;

/* -------------------------------------------------------------------------- */
/* Bands                                                                      */
/* -------------------------------------------------------------------------- */

export const CREDIT_BANDS = ['ruinous', 'poor', 'fair', 'good', 'exceptional'] as const;
export type CreditBand = (typeof CREDIT_BANDS)[number];

/**
 * Lower bound of each band. The bottom one is `ruinous` rather than the usual
 * `very poor`, because the usual scale does not have a word for somebody whose
 * balance compounds at 249% a year and who has never made a payment.
 */
const BAND_FLOORS: readonly { band: CreditBand; from: number }[] = [
  { band: 'exceptional', from: 800 },
  { band: 'good', from: 670 },
  { band: 'fair', from: 580 },
  { band: 'poor', from: 480 },
  { band: 'ruinous', from: CREDIT_MIN },
];

export function creditBand(score: number): CreditBand {
  for (const entry of BAND_FLOORS) if (score >= entry.from) return entry.band;
  return 'ruinous';
}

/** The band's span, so a gauge can draw the coloured arcs from the same source. */
export function bandRange(band: CreditBand): { from: number; to: number } {
  const index = BAND_FLOORS.findIndex((b) => b.band === band);
  const from = BAND_FLOORS[index]?.from ?? CREDIT_MIN;
  const to = index <= 0 ? CREDIT_MAX : BAND_FLOORS[index - 1]!.from;
  return { from, to };
}

/** Every band with its span, top first — the gauge's track. */
export function bandTrack(): { band: CreditBand; from: number; to: number }[] {
  return BAND_FLOORS.map((entry) => ({ band: entry.band, ...bandRange(entry.band) }));
}

/* -------------------------------------------------------------------------- */
/* Deterministic noise                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Integer hash → `[0, 1)`.
 *
 * Written with `Math.imul` and `>>> 0` so every step stays inside 32-bit
 * integer arithmetic. That is not a micro-optimisation: it is what makes the
 * result *identical* on the server and in the browser, which is the whole
 * premise of a score that is a function of the clock. A hash that used floating
 * multiplication would be free to differ in the last bit between two engines,
 * and the score would flicker once on hydration.
 */
function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4_294_967_296;
}

/** Hash of a slot, offset by a salt so two features never share a sequence. */
const hashAt = (slot: number, salt: number): number => hash01((slot | 0) + Math.imul(salt, 0x9e37));

/** Hermite ease. Smooths the steps between noise samples into a continuous line. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** How many independent noise samples a second — the flicker's frequency. */
const NOISE_HZ = 11;

/**
 * Interpolated value noise at `atMs`, in `[-1, 1]`.
 *
 * Smoothstep between hashed samples rather than raw per-frame randomness: raw
 * noise at 14Hz makes the *chart* a solid rectangle of static, in which nothing
 * — including a genuine eighty-point shock — is visible. Interpolation keeps the
 * digits unreadable while leaving the line legible.
 */
function valueNoise(atMs: number, salt: number): number {
  const position = (atMs / 1000) * NOISE_HZ;
  const slot = Math.floor(position);
  const t = smooth(position - slot);
  const a = hashAt(slot, salt) * 2 - 1;
  const b = hashAt(slot + 1, salt) * 2 - 1;
  return a + (b - a) * t;
}

/* -------------------------------------------------------------------------- */
/* The waves                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Six sinusoids, in seconds and points.
 *
 * The periods are deliberately not multiples of each other — 0.41, 1.7, 6.3,
 * 23.9, 97.3, 907.1 — so the sum has no period any viewer will ever see repeat.
 * The amplitudes are front-loaded toward the fast components, because the point
 * of this readout is that it is *jumpy*; the slow ones exist so that leaving the
 * page open for ten minutes shows a trend underneath the noise rather than a
 * band of constant width.
 */
const WAVES: readonly { seconds: number; points: number; phase: number }[] = [
  { seconds: 0.41, points: 26, phase: 0.0 },
  { seconds: 1.7, points: 34, phase: 1.9 },
  { seconds: 6.3, points: 41, phase: 3.4 },
  { seconds: 23.9, points: 33, phase: 0.7 },
  { seconds: 97.3, points: 28, phase: 5.1 },
  { seconds: 907.1, points: 22, phase: 2.2 },
];

/* -------------------------------------------------------------------------- */
/* The shocks                                                                 */
/* -------------------------------------------------------------------------- */

/** The grid shocks can fire on, in ms. One candidate every 1.3 seconds. */
const SHOCK_SLOT_MS = 1_300;
/** Fraction of slots that actually fire. */
const SHOCK_RATE = 0.34;
/** Peak magnitude of a shock, in points. */
const SHOCK_POINTS = 96;
/** How fast a shock decays, in seconds (1/e time). */
const SHOCK_DECAY_S = 2.6;
/** How many slots back are still capable of contributing. */
const SHOCK_LOOKBACK = 8;

/**
 * The sum of every live shock at `atMs`, in points.
 *
 * Each slot is a coin flip by hash, so the pattern is fixed for all time and
 * identical everywhere — two people watching see the same crash at the same
 * second. Magnitude and sign are hashed too, with the sign biased downward: a
 * borrower like this has more bad news than good, and a symmetric shock process
 * would make the score look like it was merely oscillating rather than
 * repeatedly taking damage.
 */
function shocksAt(atMs: number): number {
  const slot = Math.floor(atMs / SHOCK_SLOT_MS);
  let sum = 0;
  for (let back = 0; back < SHOCK_LOOKBACK; back++) {
    const s = slot - back;
    if (hashAt(s, 17) > SHOCK_RATE) continue;
    const age = (atMs - s * SHOCK_SLOT_MS) / 1000;
    if (age < 0) continue;
    const magnitude = SHOCK_POINTS * (0.35 + 0.65 * hashAt(s, 91));
    // 62% of shocks are downward. The asymmetry is the character of the thing.
    const sign = hashAt(s, 233) < 0.62 ? -1 : 1;
    sum += sign * magnitude * Math.exp(-age / SHOCK_DECAY_S);
  }
  return sum;
}

/* -------------------------------------------------------------------------- */
/* The anchor — where the real ledger enters                                  */
/* -------------------------------------------------------------------------- */

/**
 * What the model knows about the actual books.
 *
 * Everything here comes from the stats payload, so the score reacts to the
 * ledger rather than floating free of it: log a $400 debt and the anchor drops
 * and never comes back up.
 */
export interface CreditInputs {
  /** The counter's basis. Compounded at read time, so utilisation moves live. */
  basisCents: number;
  /** Face value on the books. */
  principalCents: number;
  /** How many lines exist. */
  entryCount: number;
  /** How many were added by real people — the "hard inquiries" analogue. */
  memberEntryCount: number;
  /** Oldest row on the books, epoch millis. The length of his credit history. */
  oldestMs: number;
  /** How many of the eight categories he has managed to owe money in. */
  categoriesUsed: number;
}

/**
 * The notional credit limit utilisation is measured against: **five hundred
 * dollars**.
 *
 * Small on purpose. A limit large enough for the utilisation ratio to ever be
 * under 100% would be a limit nobody would extend to this borrower, and the
 * ratio is the single most important input to the anchor — pinning it at "vastly
 * exceeded" from the first burrito onward is the accurate reading, not a
 * pessimistic one.
 */
export const CREDIT_LIMIT_CENTS = 50_000;

/** One factor of the score, as the breakdown renders it. */
export interface CreditFactor {
  id: 'payment' | 'utilization' | 'age' | 'mix' | 'inquiries';
  /** Share of the score this factor carries, 0–1. Sums to 1 across the five. */
  weight: number;
  /** How healthy it is, 0 (catastrophic) to 1 (perfect). */
  health: number;
  /** Points this factor is currently costing him, relative to a perfect one. */
  penaltyPoints: number;
  /** The raw figure worth showing next to the bar (a ratio, a count, years). */
  value: number;
}

/** Weights, in the proportions everyone half-remembers from the real thing. */
const WEIGHTS: Record<CreditFactor['id'], number> = {
  payment: 0.35,
  utilization: 0.3,
  age: 0.15,
  mix: 0.1,
  inquiries: 0.1,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The five factors, evaluated against the books at `atMs`.
 *
 * Every `health` is a real ratio computed from real rows. The one that is
 * hardcoded is `payment`, at exactly zero, and that is not a shortcut: there is
 * no repayment path in this system at all — `ledger.server.ts` can only insert —
 * so a payment history of "none, ever" is the literal truth about the data.
 */
export function creditFactors(inputs: CreditInputs, atMs: number): CreditFactor[] {
  const owed = inputs.basisCents * accrualFactor(atMs);
  const utilisation = owed / CREDIT_LIMIT_CENTS;
  const historyYears = Math.max(0, (atMs - inputs.oldestMs) / (365.2425 * 24 * 3_600_000));
  const mix = inputs.categoriesUsed / 8;
  // "Recent inquiries": every member line is somebody opening an account in his
  // name. There is no window on it, because he has never had one age off.
  const inquiries = inputs.memberEntryCount;

  const health: Record<CreditFactor['id'], number> = {
    payment: 0,
    // Health falls off as a reciprocal, so it approaches zero without ever
    // reaching it — an infinitely bad ratio is still worse than a merely
    // terrible one, and the bar should keep moving as the debt compounds.
    utilization: clamp01(1 / (1 + utilisation)),
    // Ten years of history is the point at which this factor stops improving.
    age: clamp01(historyYears / 10),
    mix: clamp01(mix),
    // Six inquiries is a wreck by the real scale's standards. He is at
    // thousands, so this pins at zero almost immediately and stays there.
    inquiries: clamp01(1 - inquiries / 6),
  };

  const values: Record<CreditFactor['id'], number> = {
    payment: 0,
    utilization: utilisation,
    age: historyYears,
    mix: inputs.categoriesUsed,
    inquiries,
  };

  const span = CREDIT_PERFECT - CREDIT_MIN;
  return (Object.keys(WEIGHTS) as CreditFactor['id'][]).map((id) => ({
    id,
    weight: WEIGHTS[id],
    health: health[id],
    penaltyPoints: (1 - health[id]) * WEIGHTS[id] * span,
    value: values[id],
  }));
}

/**
 * The anchor: what the score would be if it held still.
 *
 * The weighted factor health, mapped onto the scale. It moves only when the
 * books move (or when the balance compounds, which is continuously but slowly)
 * — everything fast on screen is the volatility layered on top of this.
 *
 * One consequence is worth stating rather than hiding, because it is real and it
 * is the funniest thing about the model: **the only factor that ever gives
 * points back is length of history.** Utilisation falls off as `1/(1+u)`, so
 * once the ratio is catastrophic — which it is within about a day — further debt
 * barely moves it, while the history keeps lengthening at one year per year. Run
 * the anchor forward over a long enough horizon and it drifts very slightly
 * *up*. That is exactly how the real thing behaves for a borrower who has
 * already bottomed out every other factor, and the honest reading of it is that
 * the only thing improving Kaikai's credit is that he continues to exist.
 */
export function creditAnchor(inputs: CreditInputs, atMs: number): number {
  const factors = creditFactors(inputs, atMs);
  const penalty = factors.reduce((sum, f) => sum + f.penaltyPoints, 0);
  return CREDIT_PERFECT - penalty;
}

/* -------------------------------------------------------------------------- */
/* The score                                                                  */
/* -------------------------------------------------------------------------- */

/** How hard the volatility is pushed. 1 is the shipped default. */
export interface CreditOptions {
  /** Multiplies waves, noise and shocks alike. The stress-test control. */
  volatility?: number;
}

/**
 * The live score at `atMs`.
 *
 * Anchor + waves + noise + shocks, clamped to the scale. The clamp is the reason
 * the readout spends so much time pinned at 300: the anchor sits far below the
 * middle of the range almost immediately, so roughly half the distribution is
 * cut off by the floor — which is exactly what a score for this borrower should
 * look like, and is a property of the model rather than a rendering trick.
 */
export function creditScoreAt(
  inputs: CreditInputs,
  atMs: number,
  options: CreditOptions = {},
): number {
  const volatility = Number.isFinite(options.volatility) ? Math.max(0, options.volatility!) : 1;
  const seconds = atMs / 1000;

  let swing = 0;
  for (const wave of WAVES) {
    swing += wave.points * Math.sin((2 * Math.PI * seconds) / wave.seconds + wave.phase);
  }
  swing += valueNoise(atMs, 3) * 38;
  swing += shocksAt(atMs);

  const raw = creditAnchor(inputs, atMs) + swing * volatility;
  return Math.min(CREDIT_MAX, Math.max(CREDIT_MIN, raw));
}

/** One sample of the score history. */
export interface CreditSample {
  atMs: number;
  score: number;
}

/**
 * The score over `[fromMs, toMs]`, at `count + 1` evenly spaced samples.
 *
 * This is how the chart is drawn, and it is why the chart is complete on the
 * first frame instead of filling in over the following minute: the history is
 * computed, not remembered. It is also how the window selector works — asking
 * for the last hour is the same call with different bounds, not a longer buffer.
 */
export function sampleCredit(
  inputs: CreditInputs,
  fromMs: number,
  toMs: number,
  count: number,
  options: CreditOptions = {},
): CreditSample[] {
  const n = Math.max(1, Math.floor(count));
  const out: CreditSample[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const atMs = fromMs + ((toMs - fromMs) * i) / n;
    out[i] = { atMs, score: creditScoreAt(inputs, atMs, options) };
  }
  return out;
}

/** Min, max, mean and population standard deviation over a set of samples. */
export function creditStats(samples: readonly CreditSample[]): {
  min: number;
  max: number;
  mean: number;
  stdev: number;
} {
  if (samples.length === 0) return { min: 0, max: 0, mean: 0, stdev: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const s of samples) {
    if (s.score < min) min = s.score;
    if (s.score > max) max = s.score;
    sum += s.score;
  }
  const mean = sum / samples.length;
  let variance = 0;
  for (const s of samples) variance += (s.score - mean) ** 2;
  return { min, max, mean, stdev: Math.sqrt(variance / samples.length) };
}

/**
 * The windows the viewer offers, in ms.
 *
 * Deliberately short at the fast end: at one minute the shocks are individually
 * legible as cliffs, which is the thing worth looking at. The long windows exist
 * so the same control can show that the *envelope* is flat — the score is not
 * going anywhere, it is only thrashing.
 */
export const CREDIT_WINDOWS = [60_000, 300_000, 900_000, 3_600_000] as const;
export type CreditWindow = (typeof CREDIT_WINDOWS)[number];
