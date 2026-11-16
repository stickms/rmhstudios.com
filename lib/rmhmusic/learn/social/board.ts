/**
 * The Daily board (RMH Music Phase 6, plan 1.2) — pure, client-safe. `board.server.ts` reads the
 * rows; everything about order, ranks, slices and dates is here.
 *
 * - **What counts** is decided by the query (the date's scored, ranked, unhidden run of a learner
 *   who opted in, not banned, deleted or a bot); this module gets those rows.
 * - **Order:** score desc, then the faster mean answer (no mean last), then the earlier save, then
 *   the learner id (determinism). Ranks are 1..N over the whole board, the same for every viewer.
 * - **Blocks** hide a row from one viewer and leave a gap in that viewer's numbering: renumbering
 *   would make the viewer's own place disagree with everyone else's.
 * - **Slices:** the first `BOARD_TOP` rows the viewer may see, and "around you" (`AROUND` above and
 *   below) when the viewer is on the board but below those rows.
 * - **Dates:** today (live) and yesterday (final once the save grace window has passed).
 */
import {
  isUtcDate,
  utcDate,
} from '../sprint/generate';
import {
  isUnrankedReason,
  type UnrankedReason,
} from '../sprint/plausible';
import { DATE_GRACE_MS } from '../sprint/record';

/** The rows a board shows from the top. */
export const BOARD_TOP = 50;

/** Rows shown above and below the viewer in "around you". */
export const AROUND = 2;

/** The most rows one date's board holds in memory (the query's bound). */
export const BOARD_MAX_ROWS = 10_000;

const DAY_MS = 86_400_000;

/** One row of a date's board, as the server caches it (JSON-safe: times are ms since the epoch). */
export interface BoardEntry {
  /** The `MusicSprintDaily` id (what a report names). */
  rowId: string;
  userId: string;
  score: number;
  avgMs:
    | number
    | null;
  scoredAt: number;
  /** Prompts skipped (chords on the microphone or for a singer): "without chords" when > 0. */
  skipped: number;
}

export interface RankedEntry extends BoardEntry {
  rank: number;
}

/** The board order. */
export function compareEntries(
  a: Pick<
    BoardEntry,
    | 'score'
    | 'avgMs'
    | 'scoredAt'
    | 'userId'
  >,
  b: Pick<
    BoardEntry,
    | 'score'
    | 'avgMs'
    | 'scoredAt'
    | 'userId'
  >,
): number {
  if (
    a.score !==
    b.score
  )
    return (
      b.score -
      a.score
    );
  if (
    a.avgMs !==
    b.avgMs
  ) {
    if (
      a.avgMs ===
      null
    )
      return 1;
    if (
      b.avgMs ===
      null
    )
      return -1;
    return (
      a.avgMs -
      b.avgMs
    );
  }
  if (
    a.scoredAt !==
    b.scoredAt
  )
    return (
      a.scoredAt -
      b.scoredAt
    );
  return a.userId <
    b.userId
    ? -1
    : a.userId >
        b.userId
      ? 1
      : 0;
}

/** The whole board, ordered and ranked 1..N. */
export function rankEntries(
  entries: readonly BoardEntry[],
): RankedEntry[] {
  return [
    ...entries,
  ]
    .sort(
      compareEntries,
    )
    .map(
      (
        entry,
        i,
      ) => ({
        ...entry,
        rank:
          i +
          1,
      }),
    );
}

/** What one viewer sees of a ranked board. */
export interface BoardSlice {
  rows: RankedEntry[];
  /** Two above and two below the viewer, when they are on the board below `rows`. */
  around:
    | RankedEntry[]
    | null;
  /** The viewer's own row, when they are on the board. */
  me: RankedEntry | null;
}

/** Drop the rows `blocked` hides (keeping every rank), take the top, find the viewer. */
export function sliceBoard(
  ranked: readonly RankedEntry[],
  viewerId: string,
  blocked: ReadonlySet<string>,
): BoardSlice {
  const visible =
    ranked.filter(
      (
        r,
      ) =>
        !blocked.has(
          r.userId,
        ),
    );
  const rows =
    visible.slice(
      0,
      BOARD_TOP,
    );
  const at =
    visible.findIndex(
      (
        r,
      ) =>
        r.userId ===
        viewerId,
    );
  const me =
    at ===
    -1
      ? null
      : (visible[
          at
        ] ??
        null);
  const around =
    at >=
    rows.length
      ? visible.slice(
          Math.max(
            0,
            at -
              AROUND,
          ),
          at +
            AROUND +
            1,
        )
      : null;
  return {
    rows,
    around,
    me,
  };
}

/** The place a score would take on a ranked board it is not on (1-based). */
export function wouldPlace(
  ranked: readonly RankedEntry[],
  entry: Pick<
    BoardEntry,
    | 'score'
    | 'avgMs'
    | 'scoredAt'
    | 'userId'
  >,
): number {
  // Binary search: the first row that does not come before `entry`.
  let lo = 0;
  let hi =
    ranked.length;
  while (
    lo <
    hi
  ) {
    const mid =
      (lo +
        hi) >>
      1;
    const row =
      ranked[
        mid
      ];
    if (
      row &&
      compareEntries(
        row,
        entry,
      ) <
        0
    )
      lo =
        mid +
        1;
    else
      hi =
        mid;
  }
  return (
    lo +
    1
  );
}

/** Where the viewer's own run of the date stands (the status line; never cached). */
export type BoardMe =
  | {
      state: 'not-played';
    }
  | {
      state: 'started';
    }
  /** On the board: place `rank` of `total`. */
  | {
      state: 'ranked';
      rank: number;
      total: number;
      score: number;
    }
  /** Scored and ranked but the board switch is off: where it WOULD place, counting the learner. */
  | {
      state: 'private';
      rank: number;
      total: number;
      score: number;
    }
  /** Kept for the learner's streak, not on the board, and why (null: scored before the board). */
  | {
      state: 'unranked';
      reason: UnrankedReason | null;
      score: number;
    }
  /** Taken off the board by a moderator. */
  | {
      state: 'hidden';
      score: number;
    };

/** The viewer's own row of the date, as `board.server.ts` reads it. */
export interface ViewerRow {
  score:
    | number
    | null;
  avgMs:
    | number
    | null;
  scoredAt:
    | number
    | null;
  ranked: boolean;
  unrankedReason:
    | string
    | null;
  hidden: boolean;
}

/** The viewer's line, from their own row, their board switch and the date's ranked board. */
export function boardMe(
  viewerId: string,
  row: ViewerRow | null,
  boardOn: boolean,
  ranked: readonly RankedEntry[],
): BoardMe {
  if (
    !row
  )
    return {
      state:
        'not-played',
    };
  if (
    row.score ===
    null
  )
    return {
      state:
        'started',
    };
  const score =
    row.score;
  if (
    row.hidden
  )
    return {
      state:
        'hidden',
      score,
    };
  if (
    !row.ranked
  ) {
    return {
      state:
        'unranked',
      reason:
        isUnrankedReason(
          row.unrankedReason,
        )
          ? row.unrankedReason
          : null,
      score,
    };
  }
  const mine =
    ranked.find(
      (
        r,
      ) =>
        r.userId ===
        viewerId,
    );
  if (
    boardOn &&
    mine
  )
    return {
      state:
        'ranked',
      rank: mine.rank,
      total:
        ranked.length,
      score,
    };
  // Private, or on but not yet in a cached list: place it among everyone else.
  const others =
    mine
      ? ranked.filter(
          (
            r,
          ) =>
            r.userId !==
            viewerId,
        )
      : ranked;
  const rank =
    wouldPlace(
      others,
      {
        score,
        avgMs:
          row.avgMs,
        scoredAt:
          row.scoredAt ??
          0,
        userId:
          viewerId,
      },
    );
  return {
    state:
      boardOn
        ? 'ranked'
        : 'private',
    rank,
    total:
      others.length +
      1,
    score,
  };
}

/** Whether `date` has a board at `now`: today's or yesterday's UTC date. */
export function boardDateOk(
  date: string,
  now: number,
): boolean {
  return (
    isUtcDate(
      date,
    ) &&
    (date ===
      utcDate(
        now,
      ) ||
      date ===
        utcDate(
          now -
            DAY_MS,
        ))
  );
}

/** Whether `date`'s board can no longer change: a past date once the save grace window is over. */
export function isFinal(
  date: string,
  now: number,
): boolean {
  const end =
    Date.parse(
      `${date}T00:00:00Z`,
    ) +
    DAY_MS;
  return (
    Number.isFinite(
      end,
    ) &&
    now >=
      end +
        DATE_GRACE_MS
  );
}

/** When the next board starts (the next UTC midnight), for "The board starts again at 01:00". */
export function nextBoardAt(
  now: number,
): number {
  return (
    Date.parse(
      `${utcDate(now)}T00:00:00Z`,
    ) +
    DAY_MS
  );
}
