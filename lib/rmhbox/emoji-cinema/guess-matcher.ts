/**
 * RMHbox — Emoji Cinema guess matching
 *
 * Classifies an audience guess against the round's movie by comparing WHOLE
 * normalised strings. The old implementation used Fuse.js, whose scoring is
 * substring-based: a guess of "e" matched 170 of the 253 titles, "the"
 * matched 66 and "li" matched The Lion King. A guess is now correct only when
 * it is the title (or one of its aliases) up to case, punctuation, accents,
 * spacing and a leading article, or within a small edit distance of it.
 *
 * Pure and dependency-free so it can be unit-tested against the full dataset.
 */

export type GuessResult =
  | 'correct'
  | 'close'
  | 'wrong';

/** Similarity (1 - edit distance / longer length) at or above which a guess is correct. */
export const EC_GUESS_CORRECT_RATIO = 0.85;
/** Similarity at or above which a wrong guess is reported as "close". */
export const EC_GUESS_CLOSE_RATIO = 0.6;

interface MatchableMovie {
  title: string;
  titleNormalized?: string;
  alternativeTitles?: string[];
  year?: number;
}

/**
 * Normalise a title or guess for comparison: lowercase, strip diacritics,
 * drop apostrophes and periods (so "E.T." is "et" and "Bug's" is "bugs"),
 * turn every other non-alphanumeric run into one space, "&" into "and", and
 * drop one leading article ("the", "a", "an").
 */
export function normalizeTitle(
  text: string,
): string {
  let s =
    text
      .normalize(
        'NFKD',
      )
      .replace(
        /\p{M}+/gu,
        '',
      )
      .toLowerCase()
      .replace(
        /&/g,
        ' and ',
      )
      .replace(
        /['’‘`.]/g,
        '',
      )
      .replace(
        /[^\p{L}\p{N}]+/gu,
        ' ',
      )
      .trim()
      .replace(
        /\s+/g,
        ' ',
      );
  s =
    s.replace(
      /^(the|a|an) (?=\S)/,
      '',
    );
  return s;
}

/** The comparison key: the normalised string without spaces ("spider man" = "spiderman"). */
function compact(
  s: string,
): string {
  return s.replace(
    / /g,
    '',
  );
}

/** The digit runs in a string, in order ("toy story 3" -> ["3"]). Sequels must not cross-match. */
function digitRuns(
  s: string,
): string {
  return (
    s.match(
      /\d+/g,
    ) ??
    []
  ).join(
    ',',
  );
}

/** Classic Levenshtein edit distance (insert / delete / substitute, each cost 1). */
export function levenshtein(
  a: string,
  b: string,
): number {
  if (
    a ===
    b
  )
    return 0;
  if (
    a.length ===
    0
  )
    return b.length;
  if (
    b.length ===
    0
  )
    return a.length;
  let prev =
    new Array<number>(
      b.length +
        1,
    );
  let curr =
    new Array<number>(
      b.length +
        1,
    );
  for (
    let j = 0;
    j <=
    b.length;
    j++
  )
    prev[
      j
    ] =
      j;
  for (
    let i = 1;
    i <=
    a.length;
    i++
  ) {
    curr[0] =
      i;
    for (
      let j = 1;
      j <=
      b.length;
      j++
    ) {
      const cost =
        a.charCodeAt(
          i -
            1,
        ) ===
        b.charCodeAt(
          j -
            1,
        )
          ? 0
          : 1;
      curr[
        j
      ] =
        Math.min(
          prev[
            j
          ]! +
            1,
          curr[
            j -
              1
          ]! +
            1,
          prev[
            j -
              1
          ]! +
            cost,
        );
    }
    [
      prev,
      curr,
    ] =
      [
        curr,
        prev,
      ];
  }
  return prev[
    b
      .length
  ]!;
}

/** Whole-string similarity in [0, 1]: 1 - distance / length of the longer string. */
export function similarityRatio(
  a: string,
  b: string,
): number {
  const longer =
    Math.max(
      a.length,
      b.length,
    );
  if (
    longer ===
    0
  )
    return 1;
  return (
    1 -
    levenshtein(
      a,
      b,
    ) /
      longer
  );
}

/** Drop a trailing release year ("lion king 1994") when it is this film's year and the title does not end in it. */
function stripTrailingYear(
  guess: string,
  target: string,
  year:
    | number
    | undefined,
): string {
  if (
    year ===
      undefined ||
    target.endsWith(
      ` ${year}`,
    )
  )
    return guess;
  return guess.endsWith(
    ` ${year}`,
  )
    ? guess.slice(
        0,
        -` ${year}`
          .length,
      )
    : guess;
}

function classifyAgainst(
  guessNorm: string,
  targetNorm: string,
  year:
    | number
    | undefined,
): GuessResult {
  if (
    !targetNorm
  )
    return 'wrong';
  const g =
    stripTrailingYear(
      guessNorm,
      targetNorm,
      year,
    );
  const gc =
    compact(
      g,
    );
  const tc =
    compact(
      targetNorm,
    );
  if (
    !gc
  )
    return 'wrong';
  if (
    gc ===
    tc
  )
    return 'correct';

  const ratio =
    similarityRatio(
      gc,
      tc,
    );
  // Different sequel numbers ("toy story 2" vs "toy story 3") are never the same film.
  const sameNumbers =
    digitRuns(
      g,
    ) ===
    digitRuns(
      targetNorm,
    );
  if (
    ratio >=
      EC_GUESS_CORRECT_RATIO &&
    sameNumbers
  )
    return 'correct';
  if (
    ratio >=
    EC_GUESS_CLOSE_RATIO
  )
    return 'close';

  // A substantial run of whole words from the title ("harry potter" for
  // "Harry Potter and the Sorcerer's Stone") is close, never correct.
  if (
    gc.length >=
      4 &&
    gc.length *
      2 >=
      tc.length &&
    ` ${targetNorm} `.includes(
      ` ${g} `,
    )
  ) {
    return 'close';
  }
  return 'wrong';
}

/** Classify a guess against a movie's title, normalised title and aliases. */
export function classifyMovieGuess(
  guess: string,
  movie: MatchableMovie,
): GuessResult {
  const guessNorm =
    normalizeTitle(
      guess,
    );
  if (
    !guessNorm
  )
    return 'wrong';
  const targets =
    [
      movie.title,
      movie.titleNormalized ??
        '',
      ...(movie.alternativeTitles ??
        []),
    ].filter(
      Boolean,
    );
  let best: GuessResult =
    'wrong';
  for (const target of targets) {
    const r =
      classifyAgainst(
        guessNorm,
        normalizeTitle(
          target,
        ),
        movie.year,
      );
    if (
      r ===
      'correct'
    )
      return 'correct';
    if (
      r ===
      'close'
    )
      best =
        'close';
  }
  return best;
}
