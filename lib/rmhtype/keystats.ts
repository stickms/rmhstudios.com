/**
 * RMHType per-key analytics — the aggregation rules (design G1).
 *
 * ## The privacy line, stated once
 *
 * This module records **how you type**, never **what you typed**. The unit of
 * storage is one character with three counters — attempts, errors, total ms —
 * and nothing anywhere keeps the ORDER those characters arrived in. That is not
 * a limitation to be worked around later: an ordered keystroke stream is a
 * keylog, and a bigram or trigram table is a keylog with extra steps, because
 * either one reconstructs the words a person typed. Per-finger and per-key
 * analytics need neither, so neither exists.
 *
 * Concretely, the accumulator below is a `Map` from key → counters. There is no
 * array of events, no timestamps, and no sequence field to add one to. The DB
 * table (`RmhTypeKeyStat`, PK `(userId, key, layout)`) has the same shape for the
 * same reason, and its schema comment says so.
 *
 * Client-safe and zod-free: the typing UI imports this on the hot path, and the
 * request schema lives in the API route instead (same reasoning as
 * `lib/appearance/prefs.ts` — a `z.object()` at module scope is not tree-shakable
 * and would ride along into every page that touches the app).
 */

/* -------------------------------------------------------------------------- */
/* Layouts                                                                    */
/* -------------------------------------------------------------------------- */

export const TYPING_LAYOUTS = ['qwerty', 'azerty', 'dvorak', 'colemak'] as const;
export type TypingLayout = (typeof TYPING_LAYOUTS)[number];
export const DEFAULT_LAYOUT: TypingLayout = 'qwerty';

export function isTypingLayout(value: unknown): value is TypingLayout {
  return typeof value === 'string' && (TYPING_LAYOUTS as readonly string[]).includes(value);
}

/**
 * The three alpha rows of each layout, for the heatmap.
 *
 * Rows only — a full keyboard drawing (modifiers, function row, numpad) is a
 * picture of a keyboard, not a picture of your typing, and none of those keys
 * carries a per-key statistic worth reading. The space bar is rendered
 * separately by the heatmap because it is the single most-pressed key and would
 * otherwise dominate a row it does not belong to.
 */
export const KEYBOARD_ROWS: Record<TypingLayout, readonly (readonly string[])[]> = {
  qwerty: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ],
  azerty: [
    ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
    ['w', 'x', 'c', 'v', 'b', 'n', ',', ';', ':', '!'],
  ],
  dvorak: [
    ["'", ',', '.', 'p', 'y', 'f', 'g', 'c', 'r', 'l'],
    ['a', 'o', 'e', 'u', 'i', 'd', 'h', 't', 'n', 's'],
    [';', 'q', 'j', 'k', 'x', 'b', 'm', 'w', 'v', 'z'],
  ],
  colemak: [
    ['q', 'w', 'f', 'p', 'g', 'j', 'l', 'u', 'y', ';'],
    ['a', 'r', 's', 't', 'd', 'h', 'n', 'e', 'i', 'o'],
    ['z', 'x', 'c', 'v', 'b', 'k', 'm', ',', '.', '/'],
  ],
};

/** The key every layout shares and no row contains. */
export const SPACE_KEY = ' ';

/* -------------------------------------------------------------------------- */
/* Aggregates                                                                 */
/* -------------------------------------------------------------------------- */

export interface KeyStatAggregate {
  /** A single normalised character. Never a sequence — see the module note. */
  key: string;
  attempts: number;
  errors: number;
  /** Summed dwell time across every attempt, in ms. */
  totalMs: number;
}

/** Bounds the server enforces and the client pre-applies, stated once. */
export const KEYSTAT_LIMITS = {
  /** Distinct keys one submission may carry. A test cannot touch more. */
  maxKeys: 128,
  /** Attempts per key in one submission. */
  maxAttemptsPerKey: 5_000,
  /**
   * Longest gap counted toward a single keystroke. Past this the typist stopped
   * — took a call, switched tabs — and folding that pause into the average would
   * make one interruption look like a permanent weakness on whatever letter came
   * next.
   */
  maxKeystrokeMs: 2_000,
} as const;

/** Normalise a raw character into a storage key, or `null` if it is not one. */
export function normalizeKey(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  // Any whitespace is the space bar: Enter and Tab are not keys a typing test
  // scores, and collapsing them here keeps the table to real characters.
  if (/^\s$/.test(raw)) return SPACE_KEY;
  // One code point, so the key column can never hold a fragment of text. A
  // surrogate pair (emoji) is one code point and two UTF-16 units, hence the
  // spread rather than `.length`.
  const points = [...raw];
  if (points.length !== 1) return null;
  const char = points[0];
  // Control characters carry no typing signal and would render as blanks.
  if (char.codePointAt(0)! < 0x20) return null;
  return char.toLowerCase();
}

/**
 * The client-side collector.
 *
 * `record` is called once per keystroke and immediately folds it into the
 * counters — the keystroke itself is not retained, which is what makes this an
 * aggregator rather than a log. There is deliberately no way to read the events
 * back out, because there is nothing to read.
 */
export interface KeyStatAccumulator {
  record(rawKey: string, elapsedMs: number, correct: boolean): void;
  /** The aggregates so far, ready to submit. Order is arbitrary and irrelevant. */
  snapshot(): KeyStatAggregate[];
  reset(): void;
}

export function createKeyStatAccumulator(): KeyStatAccumulator {
  const counters = new Map<string, { attempts: number; errors: number; totalMs: number }>();

  return {
    record(rawKey, elapsedMs, correct) {
      const key = normalizeKey(rawKey);
      if (!key) return;
      if (counters.size >= KEYSTAT_LIMITS.maxKeys && !counters.has(key)) return;

      const ms = Number.isFinite(elapsedMs)
        ? Math.min(Math.max(Math.round(elapsedMs), 0), KEYSTAT_LIMITS.maxKeystrokeMs)
        : 0;

      const entry = counters.get(key) ?? { attempts: 0, errors: 0, totalMs: 0 };
      entry.attempts += 1;
      if (!correct) entry.errors += 1;
      entry.totalMs += ms;
      counters.set(key, entry);
    },

    snapshot() {
      return [...counters.entries()].map(([key, value]) => ({ key, ...value }));
    },

    reset() {
      counters.clear();
    },
  };
}

/** Fold two aggregate lists together (a fresh test onto a stored profile). */
export function mergeAggregates(
  base: readonly KeyStatAggregate[],
  incoming: readonly KeyStatAggregate[],
): KeyStatAggregate[] {
  const merged = new Map<string, KeyStatAggregate>();
  for (const stat of [...base, ...incoming]) {
    const existing = merged.get(stat.key);
    if (existing) {
      existing.attempts += stat.attempts;
      existing.errors += stat.errors;
      existing.totalMs += stat.totalMs;
    } else {
      merged.set(stat.key, { ...stat });
    }
  }
  return [...merged.values()];
}

/**
 * Drop anything a submission should not carry: unknown keys, negative counts,
 * more errors than attempts, impossible dwell times. Applied on the server
 * before the write — the client running it too is a courtesy, not the check.
 */
export function sanitizeAggregates(input: readonly KeyStatAggregate[]): KeyStatAggregate[] {
  const out: KeyStatAggregate[] = [];
  for (const stat of input) {
    if (out.length >= KEYSTAT_LIMITS.maxKeys) break;
    const key = normalizeKey(stat.key);
    if (!key) continue;

    const attempts = Math.min(
      Math.max(Math.trunc(stat.attempts) || 0, 0),
      KEYSTAT_LIMITS.maxAttemptsPerKey,
    );
    if (attempts === 0) continue;
    const errors = Math.min(Math.max(Math.trunc(stat.errors) || 0, 0), attempts);
    const totalMs = Math.min(
      Math.max(Math.trunc(stat.totalMs) || 0, 0),
      attempts * KEYSTAT_LIMITS.maxKeystrokeMs,
    );

    out.push({ key, attempts, errors, totalMs });
  }
  // A payload that names the same key twice would otherwise write it twice.
  return mergeAggregates([], out);
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export interface KeyMetrics extends KeyStatAggregate {
  /** Mean dwell time in ms. */
  msPerKey: number;
  /** 0–1. */
  errorRate: number;
  /** Higher is worse — the ordering used by "practice your worst keys". */
  weakness: number;
}

/**
 * Attempts below this and a key has no reading yet: two mistyped `z`s out of
 * three is a 67% error rate and means nothing.
 */
export const MIN_ATTEMPTS_FOR_READING = 5;

export function keyMetrics(stat: KeyStatAggregate): KeyMetrics {
  const attempts = Math.max(stat.attempts, 1);
  const msPerKey = stat.totalMs / attempts;
  const errorRate = stat.errors / attempts;
  return {
    ...stat,
    msPerKey,
    errorRate,
    // Slowness in ms, inflated by errors. An error costs far more than a slow
    // press in real typing (backspace, re-read, lost rhythm), hence the ×4.
    weakness: msPerKey * (1 + errorRate * 4),
  };
}

export type HeatLevel = 'untested' | 'strong' | 'ok' | 'slow' | 'weak';

/**
 * Bucket a key for the heatmap.
 *
 * Thresholds are absolute rather than relative to the typist's own average on
 * purpose: a relative scale always paints someone's worst keys red, including
 * the typist whose worst key is fine, which turns the heatmap into decoration.
 */
export function heatLevel(metrics: KeyMetrics): HeatLevel {
  if (metrics.attempts < MIN_ATTEMPTS_FOR_READING) return 'untested';
  if (metrics.errorRate >= 0.1 || metrics.msPerKey >= 400) return 'weak';
  if (metrics.errorRate >= 0.05 || metrics.msPerKey >= 260) return 'slow';
  if (metrics.msPerKey >= 160) return 'ok';
  return 'strong';
}

/**
 * The token each level paints in.
 *
 * These are the three SEMANTIC site tokens, and that is the whole point: the
 * colour-vision modes in Settings → Appearance retint `--site-success`,
 * `--site-warning` and `--site-danger` to an Okabe–Ito palette that stays
 * separable under deuteranopia, protanopia and tritanopia (app/globals.css,
 * "COLOUR-VISION MODES"). A hand-picked red→green ramp — the canonical
 * accessibility failure for a heatmap, and the one the most common colour-vision
 * deficiency collapses entirely — would be invisible to that machinery.
 *
 * Colour is still never the only carrier: `KeyHeatmap` prints the millisecond
 * figure on every key and names the level in each key's accessible label.
 *
 * `ok` and `untested` paint in no hue at all rather than in the accent. Under
 * deuteranopia the retinted `--site-success` IS a blue, and most of the site's
 * themes accent in blue — a "steady" key and a "fast" key would then be the same
 * colour for the viewers this palette exists to serve. A neutral middle keeps
 * the scale to three hues that stay apart in every mode.
 */
export const HEAT_TOKENS: Record<HeatLevel, string | null> = {
  untested: null,
  strong: '--site-success',
  ok: null,
  slow: '--site-warning',
  weak: '--site-danger',
};

/** Legend order, best to worst. */
export const HEAT_LEVELS: readonly HeatLevel[] = [
  'strong',
  'ok',
  'slow',
  'weak',
  'untested',
] as const;

/** English labels for the levels; callers translate. */
export const HEAT_LABELS: Record<HeatLevel, string> = {
  untested: 'Not enough data',
  strong: 'Fast',
  ok: 'Steady',
  slow: 'Slow',
  weak: 'Weak',
};

/* -------------------------------------------------------------------------- */
/* Worst keys                                                                 */
/* -------------------------------------------------------------------------- */

export interface WorstKeysOptions {
  limit?: number;
  /** Ignore keys with fewer attempts than this. */
  minAttempts?: number;
}

/**
 * The keys worth practising, worst first.
 *
 * This is the function that turns analytics into a reason to come back: it feeds
 * the practice generator in `./custom-test`, so a heatmap is not just a picture
 * of a problem but the input to a test that fixes it.
 */
export function worstKeys(
  stats: readonly KeyStatAggregate[],
  options: WorstKeysOptions = {},
): KeyMetrics[] {
  const limit = Math.max(1, Math.trunc(options.limit ?? 10));
  const minAttempts = Math.max(1, Math.trunc(options.minAttempts ?? MIN_ATTEMPTS_FOR_READING));

  return (
    stats
      .filter((s) => s.attempts >= minAttempts)
      .map(keyMetrics)
      // The space bar is pressed between every word, so it always dominates a
      // slowness ranking — and "practise your space bar" is not advice.
      .filter((m) => m.key !== SPACE_KEY)
      .sort((a, b) => b.weakness - a.weakness || a.key.localeCompare(b.key))
      .slice(0, limit)
  );
}

/** Overall typing summary derived from the same aggregates. */
export interface TypingSummary {
  totalAttempts: number;
  totalErrors: number;
  accuracy: number;
  /** Mean ms per keystroke across every tracked key. */
  msPerKey: number;
  /**
   * Words per minute implied by the aggregate dwell time, using the standard
   * five-characters-per-word convention. Derived from per-key sums rather than
   * from a test's wall clock, so it excludes the pauses between tests.
   */
  impliedWpm: number;
  trackedKeys: number;
}

export function summarize(stats: readonly KeyStatAggregate[]): TypingSummary {
  let totalAttempts = 0;
  let totalErrors = 0;
  let totalMs = 0;
  for (const stat of stats) {
    totalAttempts += stat.attempts;
    totalErrors += stat.errors;
    totalMs += stat.totalMs;
  }
  const msPerKey = totalAttempts > 0 ? totalMs / totalAttempts : 0;
  return {
    totalAttempts,
    totalErrors,
    accuracy: totalAttempts > 0 ? (totalAttempts - totalErrors) / totalAttempts : 0,
    msPerKey,
    impliedWpm: msPerKey > 0 ? 60_000 / (msPerKey * 5) : 0,
    trackedKeys: stats.length,
  };
}
