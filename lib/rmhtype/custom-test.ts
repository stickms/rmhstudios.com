/**
 * RMHType custom tests and the "practice your worst keys" generator (design G1).
 *
 * Two kinds of test come out of here and both are marked the same way:
 *
 *  - **custom** — your own pasted text, or a generated one with punctuation /
 *    numbers / a word list you chose;
 *  - **practice** — generated from your own per-key weaknesses.
 *
 * Neither is eligible for a global leaderboard, and {@link isLeaderboardEligible}
 * is the single place that is decided. A custom test is not comparable: you pick
 * the text, so you pick the difficulty, and one board holding "the alphabet
 * twice" beside a real passage is a board that means nothing. The UI has to say
 * so on the result screen — a run that silently does not count is worse than one
 * that openly does not.
 *
 * Generation is **seeded and deterministic**: the same options and seed produce
 * the same text on any device. That is what lets a custom test be shared, and it
 * is what would let one be replayed (`GameReplay` with `{seed, keystrokes}`)
 * without storing the passage.
 *
 * Pure, client-safe, zod-free — see the note in `./keystats`.
 */

import { MIN_ATTEMPTS_FOR_READING, SPACE_KEY, worstKeys, type KeyStatAggregate } from './keystats';

/* -------------------------------------------------------------------------- */
/* Word lists                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The built-in English pool: the most common words, which is what a typing test
 * is supposed to measure.
 *
 * Only English ships here. The site's `locales/` catalogs are UI strings — menu
 * labels and error messages — not vocabulary, so pointing a word-list feature at
 * them would produce a test made of "Settings", "Cancel" and "Too many
 * requests". Adding a language is one entry in {@link LANGUAGE_WORD_LISTS} with a
 * real word list behind it; the generator already takes `words` for a
 * caller-supplied pool, so a locale pack can be dropped in without touching this
 * module.
 */
// prettier-ignore — the grid layout is how a 200-word list stays readable.
const ENGLISH_WORDS = [
  'the',
  'be',
  'of',
  'and',
  'a',
  'to',
  'in',
  'he',
  'have',
  'it',
  'that',
  'for',
  'they',
  'with',
  'as',
  'not',
  'on',
  'she',
  'at',
  'by',
  'this',
  'we',
  'you',
  'do',
  'but',
  'from',
  'or',
  'which',
  'one',
  'would',
  'all',
  'will',
  'there',
  'say',
  'who',
  'make',
  'when',
  'can',
  'more',
  'if',
  'no',
  'man',
  'out',
  'other',
  'so',
  'what',
  'time',
  'up',
  'go',
  'about',
  'than',
  'into',
  'could',
  'state',
  'only',
  'new',
  'year',
  'some',
  'take',
  'come',
  'these',
  'know',
  'see',
  'use',
  'get',
  'like',
  'then',
  'first',
  'any',
  'work',
  'now',
  'may',
  'such',
  'give',
  'over',
  'think',
  'most',
  'even',
  'find',
  'day',
  'also',
  'after',
  'way',
  'many',
  'must',
  'look',
  'before',
  'great',
  'back',
  'through',
  'long',
  'where',
  'much',
  'should',
  'well',
  'people',
  'down',
  'own',
  'just',
  'because',
  'good',
  'each',
  'those',
  'feel',
  'seem',
  'how',
  'high',
  'too',
  'place',
  'little',
  'world',
  'very',
  'still',
  'nation',
  'hand',
  'old',
  'life',
  'tell',
  'write',
  'become',
  'here',
  'show',
  'house',
  'both',
  'between',
  'need',
  'mean',
  'call',
  'develop',
  'under',
  'last',
  'right',
  'move',
  'thing',
  'general',
  'school',
  'never',
  'same',
  'another',
  'begin',
  'while',
  'number',
  'part',
  'turn',
  'real',
  'leave',
  'might',
  'want',
  'point',
  'form',
  'off',
  'child',
  'few',
  'small',
  'since',
  'against',
  'ask',
  'late',
  'home',
  'interest',
  'large',
  'person',
  'end',
  'open',
  'public',
  'follow',
  'during',
  'present',
  'without',
  'again',
  'hold',
  'govern',
  'around',
  'possible',
  'head',
  'consider',
  'word',
  'program',
  'problem',
  'however',
  'lead',
  'system',
  'set',
  'order',
  'eye',
  'plan',
  'run',
  'keep',
  'face',
  'fact',
  'group',
  'play',
  'stand',
  'increase',
  'early',
  'course',
  'change',
  'help',
  'line',
  'quick',
] as const;

/**
 * Extra English words carrying the letters common English barely uses.
 *
 * Needed because of an obvious-in-hindsight problem: the 200 most common English
 * words contain almost no `q`, `z`, `x` or `j`, and those are exactly the keys a
 * typist is slowest on. Weighting the common pool toward a weak `z` therefore
 * produced a test with no `z` in it — a practice mode that cannot practise the
 * thing it was built for.
 *
 * These are still words, not letter drills: `zzz qqq xxx` would train a
 * finger movement nobody performs while writing, and the point is to type
 * *language* that happens to be full of your weak keys.
 */
// prettier-ignore
const RARE_LETTER_WORDS = [
  'quiz', 'quartz', 'quick', 'quiet', 'queen', 'query', 'quote', 'equal', 'square', 'request',
  'zebra', 'zone', 'puzzle', 'jazz', 'prize', 'dozen', 'hazard', 'wizard', 'size', 'freeze',
  'jacket', 'jungle', 'major', 'object', 'project', 'jolly', 'juice', 'banjo', 'enjoy', 'jigsaw',
  'exact', 'extra', 'mixture', 'oxygen', 'luxury', 'index', 'complex', 'export', 'toxic', 'box',
  'knife', 'kayak', 'kettle', 'basket', 'market', 'vivid', 'volume', 'value', 'velvet', 'wave',
] as const;

/** Word pools by language tag. English is the only one with real vocabulary. */
export const LANGUAGE_WORD_LISTS: Record<string, readonly string[]> = {
  en: ENGLISH_WORDS,
};

export function wordListFor(language: string): readonly string[] {
  return LANGUAGE_WORD_LISTS[language] ?? ENGLISH_WORDS;
}

/** Turn arbitrary text (a paste, a locale pack) into a usable word pool. */
export function deriveWordList(text: string, max = 500): string[] {
  const words = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w.length <= 24);
  return [...new Set(words)].slice(0, max);
}

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export type CustomTestMode =
  /** Random words from a language pool. */
  | 'words'
  /** Text the typist pasted in. */
  | 'custom'
  /** Words weighted toward the typist's slowest / most-missed keys. */
  | 'practice';

export interface CustomTestOptions {
  mode: CustomTestMode;
  /** Target word count (`words`/`practice`). Clamped to 5–200. */
  length?: number;
  /** Sprinkle sentence punctuation. */
  punctuation?: boolean;
  /** Sprinkle numbers. */
  numbers?: boolean;
  /** Language tag for the built-in pool. */
  language?: string;
  /** Explicit pool, overriding `language`. */
  words?: readonly string[];
  /** Required for `custom`: the pasted passage. */
  text?: string;
  /** Per-key aggregates for `practice`. */
  stats?: readonly KeyStatAggregate[];
  /** Deterministic seed. Omit for a random one. */
  seed?: number;
}

export interface GeneratedTest {
  text: string;
  mode: CustomTestMode;
  seed: number;
  wordCount: number;
  /** Always false for everything this module produces — see the module note. */
  leaderboardEligible: boolean;
  /** The keys a `practice` test was built to drill, worst first. */
  targetedKeys: string[];
}

export const TEST_LENGTH_BOUNDS = { min: 5, max: 200 } as const;
/** Hard cap on a pasted passage. Long enough for a chapter, short enough to store. */
export const CUSTOM_TEXT_MAX = 5_000;

/**
 * Nothing generated here counts toward a global board.
 *
 * A function rather than a constant so the rule has one name that call sites can
 * point at, and so the day a fixed, server-chosen "daily custom" becomes
 * comparable, exactly one place changes.
 */
export function isLeaderboardEligible(_test: Pick<GeneratedTest, 'mode'>): boolean {
  return false;
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/** mulberry32 — the same small deterministic generator the games use. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampLength(length: number | undefined): number {
  const n = Math.trunc(length ?? 30);
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(n, TEST_LENGTH_BOUNDS.min), TEST_LENGTH_BOUNDS.max);
}

const PUNCTUATION = ['.', ',', '!', '?', ';', ':'] as const;

/** Pick an index from `weights` proportionally. `weights` must be non-empty. */
function weightedIndex(weights: readonly number[], roll: number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return Math.min(weights.length - 1, Math.floor(roll * weights.length));
  let target = roll * total;
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i];
    if (target <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * How much a word helps with a given set of weak keys.
 *
 * A word scores by how much weak-key mass it contains, normalised by length so a
 * long word is not automatically "better practice" than a short one that is all
 * problem letters. The `+1` floor keeps every word reachable: a pool that only
 * ever emits four words is a drill, not a test, and it stops measuring anything
 * after the second run.
 */
export function practiceWeight(word: string, weights: ReadonlyMap<string, number>): number {
  if (word.length === 0) return 1;
  let score = 0;
  for (const char of word.toLowerCase()) score += weights.get(char) ?? 0;
  return 1 + score / word.length;
}

/**
 * Build a test.
 *
 * `custom` returns the pasted text unchanged apart from whitespace collapsing —
 * the typist chose it, and "helpfully" editing someone's paste is how a test
 * stops matching the thing they wanted to practise.
 */
export function buildCustomTest(options: CustomTestOptions): GeneratedTest {
  const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = createRng(seed);

  if (options.mode === 'custom') {
    const text = (options.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TEXT_MAX);
    return {
      text,
      mode: 'custom',
      seed,
      wordCount: text.length === 0 ? 0 : text.split(' ').length,
      leaderboardEligible: false,
      targetedKeys: [],
    };
  }

  const callerPool = options.words?.length ? options.words : null;
  // Practice draws from the common pool PLUS the rare-letter words, because the
  // common pool alone cannot drill the letters a typist is actually slow on.
  // A caller-supplied pool is left exactly as given — a French word list must
  // not quietly gain English words.
  const pool =
    callerPool ??
    (options.mode === 'practice' && (options.language ?? 'en') === 'en'
      ? [...ENGLISH_WORDS, ...RARE_LETTER_WORDS]
      : wordListFor(options.language ?? 'en'));
  const length = clampLength(options.length);

  // `practice` biases the pool toward the typist's weak keys; `words` leaves it
  // uniform. Both draw from the SAME pool, so a practice test still reads as
  // English rather than as a letter drill.
  let weights: number[] | null = null;
  let targetedKeys: string[] = [];
  if (options.mode === 'practice' && options.stats?.length) {
    const worst = worstKeys(options.stats, { limit: 8, minAttempts: MIN_ATTEMPTS_FOR_READING });
    targetedKeys = worst.map((k) => k.key);
    if (worst.length > 0) {
      // Normalise weakness to 0–1 so the weighting is about relative difficulty,
      // not about absolute milliseconds.
      const max = Math.max(...worst.map((k) => k.weakness));
      const weightByKey = new Map(
        worst
          .filter((k) => k.key !== SPACE_KEY)
          .map((k) => [k.key, max > 0 ? k.weakness / max : 0] as const),
      );
      weights = pool.map((word) => practiceWeight(word, weightByKey));
    }
  }

  const words: string[] = [];
  for (let i = 0; i < length; i++) {
    const index = weights
      ? weightedIndex(weights, rng())
      : Math.floor(rng() * pool.length) % pool.length;
    let word = pool[index];

    if (options.numbers && rng() < 0.1) {
      word = String(Math.floor(rng() * 10_000));
    }
    if (options.punctuation && rng() < 0.15) {
      word += PUNCTUATION[Math.floor(rng() * PUNCTUATION.length)];
    }
    words.push(word);
  }

  if (options.punctuation && words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }

  const text = words.join(' ');
  return {
    text,
    mode: options.mode,
    seed,
    wordCount: words.length,
    leaderboardEligible: false,
    targetedKeys,
  };
}
