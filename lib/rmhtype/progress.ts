/**
 * Pure maths for the RMHType progress page: trend smoothing, spread, change
 * against the previous range and the personal-bests table. No I/O, so the server
 * and the page share it and the product suite can pin the edge cases.
 */

export const PROGRESS_RANGES =
  [
    '30d',
    '90d',
    '1y',
    'all',
  ] as const;
export type ProgressRange =
  (typeof PROGRESS_RANGES)[number];

/** Days in each range; `all` has no length, so it has no previous range either. */
export const RANGE_DAYS: Record<
  ProgressRange,
  | number
  | null
> =
  {
    '30d': 30,
    '90d': 90,
    '1y': 365,
    all: null,
  };

export const PROGRESS_MODES =
  [
    'all',
    'solo',
    'races',
  ] as const;
export type ProgressMode =
  (typeof PROGRESS_MODES)[number];

/** Most rows one request scans, and most points one chart draws. */
export const MAX_RUN_ROWS = 5000;
export const MAX_CHART_POINTS = 400;
export const RUNS_PAGE_SIZE = 25;
export const ROLLING_WINDOW = 7;

export type PassageLengthId =
  | 'short'
  | 'medium'
  | 'long';
export type DifficultyId =
  | 'easy'
  | 'medium'
  | 'hard';

const LENGTH_ORDER: readonly string[] =
  [
    'short',
    'medium',
    'long',
  ];
const DIFFICULTY_ORDER: readonly string[] =
  [
    'easy',
    'medium',
    'hard',
  ];

/** One calendar day (in the viewer's time zone) of runs. */
export interface DailyPoint {
  /** `YYYY-MM-DD` in the viewer's time zone. */
  day: string;
  runs: number;
  wpm: number;
  accuracy: number;
}

export interface ProgressSummary {
  runs: number;
  medianWpm:
    | number
    | null;
  /** Median wpm now minus the previous range's, one decimal; null when there is nothing to compare. */
  changeWpm:
    | number
    | null;
  best: {
    wpm: number;
    accuracy: number;
    at: string;
  } | null;
  /** Interquartile range of wpm: how steady the runs are; null under four runs. */
  consistency:
    | number
    | null;
}

export interface BestRun {
  passageLength: string;
  difficulty: string;
  wpm: number;
  accuracy: number;
  /** ISO instant of the run. */
  at: string;
  /** Opens the run list at this run (`runCursor`). */
  cursor: string;
}

export interface RunRow {
  id: string;
  at: string;
  solo: boolean;
  passageLength: string;
  difficulty: string;
  wpm: number;
  accuracy: number;
  /** Placing in a race; null for a solo run. */
  rank:
    | number
    | null;
}

export interface SummaryRun {
  wpm: number;
  accuracy: number;
  at: string;
}

function sortedCopy(
  values: readonly number[],
): number[] {
  return [
    ...values,
  ].sort(
    (
      a,
      b,
    ) =>
      a -
      b,
  );
}

/** Linear-interpolated percentile of an ascending array (what SQL `percentile_cont` does). */
function percentile(
  sorted: readonly number[],
  p: number,
): number {
  const rank =
    (sorted.length -
      1) *
    p;
  const lo =
    Math.floor(
      rank,
    );
  const hi =
    Math.ceil(
      rank,
    );
  const a =
    sorted[
      lo
    ] ??
    0;
  const b =
    sorted[
      hi
    ] ??
    a;
  return (
    a +
    (b -
      a) *
      (rank -
        lo)
  );
}

export function median(
  values: readonly number[],
):
  | number
  | null {
  if (
    values.length ===
    0
  )
    return null;
  return percentile(
    sortedCopy(
      values,
    ),
    0.5,
  );
}

/**
 * Interquartile range. Quartiles of fewer than four runs say nothing about
 * steadiness, so the page shows no figure rather than a misleading one.
 */
export function iqr(
  values: readonly number[],
):
  | number
  | null {
  if (
    values.length <
    4
  )
    return null;
  const sorted =
    sortedCopy(
      values,
    );
  return (
    percentile(
      sorted,
      0.75,
    ) -
    percentile(
      sorted,
      0.25,
    )
  );
}

/**
 * Trailing mean over the last `window` points. At the start of the series the
 * window is whatever exists so far, so the first value is the first point itself
 * and the line never starts late.
 */
export function rollingAverage(
  values: readonly number[],
  window = ROLLING_WINDOW,
): number[] {
  const size =
    Math.max(
      1,
      Math.floor(
        window,
      ),
    );
  return values.map(
    (
      _,
      i,
    ) => {
      const slice =
        values.slice(
          Math.max(
            0,
            i -
              size +
              1,
          ),
          i +
            1,
        );
      return (
        slice.reduce(
          (
            sum,
            v,
          ) =>
            sum +
            v,
          0,
        ) /
        slice.length
      );
    },
  );
}

const round1 =
  (
    n: number,
  ) =>
    Math.round(
      n *
        10,
    ) /
    10;

/** Current median minus the previous range's, one decimal; null when either side has no runs. */
export function changeVsPrevious(
  current:
    | number
    | null,
  previous:
    | number
    | null,
):
  | number
  | null {
  if (
    current ===
      null ||
    previous ===
      null
  )
    return null;
  return round1(
    current -
      previous,
  );
}

/** Better run: higher wpm, then higher accuracy. */
function isBetter(
  a: {
    wpm: number;
    accuracy: number;
  },
  b: {
    wpm: number;
    accuracy: number;
  },
) {
  return (
    a.wpm >
      b.wpm ||
    (a.wpm ===
      b.wpm &&
      a.accuracy >
        b.accuracy)
  );
}

/**
 * One best run per passage length and difficulty: the highest wpm, ties broken
 * by accuracy and then by the earlier run. Ordered short to long, easy to hard.
 */
export function bestsTable(
  rows: readonly BestRun[],
): BestRun[] {
  const best =
    new Map<
      string,
      BestRun
    >();
  for (const row of rows) {
    const key = `${row.passageLength}|${row.difficulty}`;
    const held =
      best.get(
        key,
      );
    if (
      !held ||
      isBetter(
        row,
        held,
      ) ||
      (!isBetter(
        held,
        row,
      ) &&
        row.at <
          held.at)
    ) {
      best.set(
        key,
        row,
      );
    }
  }
  const rank =
    (
      order: readonly string[],
      v: string,
    ) => {
      const i =
        order.indexOf(
          v,
        );
      return i ===
        -1
        ? order.length
        : i;
    };
  return [
    ...best.values(),
  ].sort(
    (
      a,
      b,
    ) =>
      rank(
        LENGTH_ORDER,
        a.passageLength,
      ) -
        rank(
          LENGTH_ORDER,
          b.passageLength,
        ) ||
      rank(
        DIFFICULTY_ORDER,
        a.difficulty,
      ) -
        rank(
          DIFFICULTY_ORDER,
          b.difficulty,
        ),
  );
}

/** Headline figures for the range: `current` runs in it, `previous` wpm values from the range before. */
export function summarizeRuns(
  current: readonly SummaryRun[],
  previous: readonly number[],
): ProgressSummary {
  const wpms =
    current.map(
      (
        r,
      ) =>
        r.wpm,
    );
  let best: SummaryRun | null =
    null;
  for (const run of current)
    if (
      !best ||
      isBetter(
        run,
        best,
      )
    )
      best =
        run;
  const medianWpm =
    median(
      wpms,
    );
  return {
    runs: current.length,
    medianWpm:
      medianWpm ===
      null
        ? null
        : round1(
            medianWpm,
          ),
    changeWpm:
      changeVsPrevious(
        medianWpm,
        median(
          previous,
        ),
      ),
    best: best && {
      wpm: best.wpm,
      accuracy:
        best.accuracy,
      at: best.at,
    },
    consistency:
      ((
        v,
      ) =>
        v ===
        null
          ? null
          : round1(
              v,
            ))(
        iqr(
          wpms,
        ),
      ),
  };
}

/** The most recent `max` points; a chart never draws more than that. */
export function capPoints<
  T,
>(
  points: readonly T[],
  max = MAX_CHART_POINTS,
): T[] {
  return points.length >
    max
    ? points.slice(
        points.length -
          max,
      )
    : [
        ...points,
      ];
}

/**
 * Run-list cursor: the run's instant, optionally with `~id`. With an id it means
 * "strictly after that run in newest-first order"; without, "this instant and
 * older", which is how a personal best opens the list at its own run.
 */
export function encodeRunCursor(
  at: string,
  id?: string,
): string {
  return id
    ? `${at}~${id}`
    : at;
}

export function parseRunCursor(
  cursor: string,
): {
  at: Date;
  id:
    | string
    | null;
} | null {
  const [
    iso,
    id,
  ] =
    cursor.split(
      '~',
      2,
    );
  const at =
    new Date(
      iso ??
        '',
    );
  if (
    Number.isNaN(
      at.getTime(),
    )
  )
    return null;
  return {
    at,
    id: id
      ? id
      : null,
  };
}
