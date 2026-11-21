/**
 * The local store, as the same row shape the server reads from `DailyPuzzleScore`.
 *
 * Guests have no server rows, and a signed-in member's local copy is a mirror of them,
 * so `computeDailyStats(readLocalRows(), today)` and the endpoint agree for the same
 * runs. Lights Out keeps two local stores (the generic one, populated by a server sync,
 * and its own 30-day history); a day present in both is merged into its best run.
 */
import {
  getCompletedDates,
  type PuzzleResult,
} from '@/lib/daily-puzzles/persistence';
import {
  loadHistory,
  type PuzzleHistoryEntry,
} from '@/lib/lights-out/persistence';
import {
  STAT_MODES,
  type DailyStatRow,
} from '@/lib/daily-puzzles/stats';

const LIGHTS_OUT =
  'lights-out';
const GLOBESET =
  'globeset';

type Results =
  Record<
    string,
    Record<
      string,
      PuzzleResult
    >
  >;

function movesOf(
  r: PuzzleResult,
):
  | number
  | null {
  const m =
    r
      .resultJson
      ?.moves ??
    r.score;
  return typeof m ===
    'number' &&
    Number.isFinite(
      m,
    )
    ? m
    : null;
}

/** Pure: build rows from what the two local stores hold. */
export function buildLocalRows(
  results: Results,
  lightsOutHistory: readonly PuzzleHistoryEntry[],
): DailyStatRow[] {
  const rows: DailyStatRow[] =
    [];

  for (const mode of STAT_MODES) {
    if (
      mode ===
      LIGHTS_OUT
    )
      continue;
    for (const [
      dateKey,
      r,
    ] of Object.entries(
      results[
        mode
      ] ??
        {},
    )) {
      rows.push(
        {
          gameMode:
            mode,
          dateKey,
          score:
            r.score,
          moves:
            null,
          // GlobeSet: the auto-solver was used (the server's `dnf`).
          dnf:
            mode ===
            GLOBESET
              ? r
                  .resultJson
                  ?.solverUsed ===
                true
              : null,
          timeSeconds:
            r.timeSeconds ??
            null,
        },
      );
    }
  }

  const lights =
    new Map<
      string,
      DailyStatRow
    >();
  const addLights =
    (
      dateKey: string,
      moves:
        | number
        | null,
      dnf: boolean,
    ) => {
      const prev =
        lights.get(
          dateKey,
        );
      const better =
        !prev ||
        (prev.dnf &&
          !dnf) ||
        (!dnf &&
          !prev.dnf &&
          moves !==
            null &&
          (prev.moves ===
            null ||
            moves <
              prev.moves));
      if (
        better
      ) {
        lights.set(
          dateKey,
          {
            gameMode:
              LIGHTS_OUT,
            dateKey,
            score: 0,
            moves:
              dnf
                ? null
                : moves,
            dnf,
            timeSeconds:
              null,
          },
        );
      }
    };
  for (const [
    dateKey,
    r,
  ] of Object.entries(
    results[
      LIGHTS_OUT
    ] ??
      {},
  )) {
    addLights(
      dateKey,
      movesOf(
        r,
      ),
      r
        .resultJson
        ?.dnf ===
        true,
    );
  }
  for (const h of lightsOutHistory)
    addLights(
      h.dateKey,
      h.moves,
      h.dnf,
    );
  rows.push(
    ...lights.values(),
  );

  return rows;
}

/** Read the local stores (browser only; empty on the server). */
export function readLocalRows(): DailyStatRow[] {
  const results: Results =
    {};
  for (const mode of STAT_MODES)
    results[
      mode
    ] =
      getCompletedDates(
        mode,
      );
  return buildLocalRows(
    results,
    loadHistory(),
  );
}
