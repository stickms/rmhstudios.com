/**
 * Daily puzzle statistics, as one pure function.
 *
 * The server feeds it a member's `DailyPuzzleScore` rows and the guest page feeds it
 * the same shape built from the local store (`local-rows.ts`), so both agree on what a
 * streak, a solve and a bucket are. Day keys are the puzzles' own `YYYY-MM-DD` keys
 * (America/New_York, the drop clock), so "consecutive days" is plain calendar
 * arithmetic on the key and no time zone enters here.
 *
 * Counting rules (the hub's, made explicit): a day counts toward the streak and a run
 * counts as a solve when it was finished. A lights-out run with `dnf` and a globeset
 * run that used the auto-solver (`dnf` on globeset) were not finished by the player,
 * so they count as played but not as solved.
 *
 * Client-safe: no server imports, so the guest page ships it too.
 */
import { addDays } from '@/lib/calendar/tz';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';

export const STAT_MODES: readonly string[] =
  DESK_MODES.map(
    (
      m,
    ) =>
      m.id,
  );

/** The columns of `DailyPuzzleScore` the statistics read. */
export interface DailyStatRow {
  gameMode: string;
  dateKey: string;
  score: number;
  moves:
    | number
    | null;
  dnf:
    | boolean
    | null;
  timeSeconds:
    | number
    | null;
}

/** What a mode's figure measures: points (higher is better), moves or seconds (lower is better). */
export type StatMetric =
  | 'score'
  | 'moves'
  | 'time';

export function metricOf(
  mode: string,
): StatMetric {
  if (
    mode ===
    'lights-out'
  )
    return 'moves';
  if (
    mode ===
    'globeset'
  )
    return 'time';
  return 'score';
}

/** One distribution bucket: results from `min` up to and including `max` (`null` = no upper bound). */
export interface StatBucket {
  min: number;
  max:
    | number
    | null;
  count: number;
}

/** Lower bound of each bucket, per metric. At most 8 each; the last is open-ended. */
const BUCKET_STARTS: Record<
  StatMetric,
  readonly number[]
> =
  {
    score:
      [
        0,
        125,
        250,
        375,
        500,
        625,
        750,
        875,
      ],
    moves:
      [
        0,
        6,
        11,
        16,
        21,
        31,
        41,
        61,
      ],
    time: [
      0,
      60,
      120,
      180,
      300,
      600,
      900,
      1800,
    ],
  };

export function bucketsFor(
  metric: StatMetric,
): StatBucket[] {
  const starts =
    BUCKET_STARTS[
      metric
    ];
  return starts.map(
    (
      min,
      i,
    ) => ({
      min,
      max:
        i +
          1 <
        starts.length
          ? starts[
              i +
                1
            ] -
            1
          : null,
      count: 0,
    }),
  );
}

export interface ModeStats {
  mode: string;
  metric: StatMetric;
  played: number;
  solved: number;
  /** solved / played, 0 to 1 (0 when nothing was played). */
  solveRate: number;
  currentStreak: number;
  longestStreak: number;
  /** Highest score, or fewest moves, or fastest time; null until a solve has the figure. */
  best:
    | number
    | null;
  average:
    | number
    | null;
  distribution: StatBucket[];
}

export interface DailyStats {
  currentStreak: number;
  longestStreak: number;
  daysPlayed: number;
  totalSolves: number;
  modes: ModeStats[];
  /** Day key -> the modes solved that day (a day with only unfinished runs is absent). */
  days: Record<
    string,
    string[]
  >;
  /** The earliest day key in `days`, for calendar navigation; null with no solves. */
  firstDay:
    | string
    | null;
}

/** Whether the run was finished by the player. */
export function isSolved(
  row: Pick<
    DailyStatRow,
    'dnf'
  >,
): boolean {
  return (
    row.dnf !==
    true
  );
}

/**
 * Current and longest run of consecutive day keys. The current run may end today or
 * yesterday (today not played yet keeps the streak alive, as the hub always did).
 */
export function streaks(
  dayKeys: Iterable<string>,
  todayKey: string,
): {
  current: number;
  longest: number;
} {
  const set =
    new Set(
      dayKeys,
    );
  let longest = 0;
  for (const key of set) {
    if (
      set.has(
        addDays(
          key,
          -1,
        ),
      )
    )
      continue; // not the start of a run
    let len = 0;
    for (
      let d =
        key;
      set.has(
        d,
      );
      d =
        addDays(
          d,
          1,
        )
    )
      len++;
    if (
      len >
      longest
    )
      longest =
        len;
  }
  let cursor =
    todayKey;
  if (
    !set.has(
      cursor,
    )
  )
    cursor =
      addDays(
        todayKey,
        -1,
      );
  let current = 0;
  while (
    set.has(
      cursor,
    )
  ) {
    current++;
    cursor =
      addDays(
        cursor,
        -1,
      );
  }
  return {
    current,
    longest,
  };
}

function modeStats(
  mode: string,
  rows: DailyStatRow[],
  todayKey: string,
): ModeStats {
  const metric =
    metricOf(
      mode,
    );
  const solvedRows =
    rows.filter(
      isSolved,
    );
  const values: number[] =
    [];
  for (const r of solvedRows) {
    const v =
      metric ===
      'moves'
        ? r.moves
        : metric ===
            'time'
          ? r.timeSeconds
          : r.score;
    if (
      typeof v ===
        'number' &&
      Number.isFinite(
        v,
      )
    )
      values.push(
        v,
      );
  }
  const distribution =
    bucketsFor(
      metric,
    );
  for (const v of values) {
    let i =
      distribution.length -
      1;
    while (
      i >
        0 &&
      v <
        distribution[
          i
        ]
          .min
    )
      i--;
    distribution[
      i
    ]
      .count++;
  }
  const {
    current,
    longest,
  } =
    streaks(
      solvedRows.map(
        (
          r,
        ) =>
          r.dateKey,
      ),
      todayKey,
    );
  const best =
    values.length ===
    0
      ? null
      : metric ===
          'score'
        ? Math.max(
            ...values,
          )
        : Math.min(
            ...values,
          );
  const average =
    values.length ===
    0
      ? null
      : Math.round(
          (values.reduce(
            (
              a,
              b,
            ) =>
              a +
              b,
            0,
          ) /
            values.length) *
            10,
        ) /
        10;
  return {
    mode,
    metric,
    played:
      rows.length,
    solved:
      solvedRows.length,
    solveRate:
      rows.length ===
      0
        ? 0
        : solvedRows.length /
          rows.length,
    currentStreak:
      current,
    longestStreak:
      longest,
    best,
    average,
    distribution,
  };
}

/** Everything the statistics page shows, from a member's rows and today's day key. */
export function computeDailyStats(
  rows: readonly DailyStatRow[],
  todayKey: string,
): DailyStats {
  const byMode =
    new Map<
      string,
      DailyStatRow[]
    >(
      STAT_MODES.map(
        (
          m,
        ) => [
          m,
          [],
        ],
      ),
    );
  for (const r of rows)
    byMode
      .get(
        r.gameMode,
      )
      ?.push(
        r,
      );

  const days: Record<
    string,
    string[]
  > =
    {};
  let totalSolves = 0;
  for (const mode of STAT_MODES) {
    for (const r of byMode.get(
      mode,
    ) ??
      []) {
      if (
        !isSolved(
          r,
        )
      )
        continue;
      totalSolves++;
      (days[
        r.dateKey
      ] ??=
        []).push(
        mode,
      );
    }
  }
  const dayKeys =
    Object.keys(
      days,
    ).sort();
  const {
    current,
    longest,
  } =
    streaks(
      dayKeys,
      todayKey,
    );

  return {
    currentStreak:
      current,
    longestStreak:
      longest,
    daysPlayed:
      dayKeys.length,
    totalSolves,
    modes:
      STAT_MODES.map(
        (
          m,
        ) =>
          modeStats(
            m,
            byMode.get(
              m,
            ) ??
              [],
            todayKey,
          ),
      ),
    days,
    firstDay:
      dayKeys[0] ??
      null,
  };
}
