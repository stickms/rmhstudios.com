/**
 * Paging through a ranked list (see `best.ts`).
 *
 * A "Best" score moves with the clock, so it cannot be a keyset: the row a cursor names may have changed
 * places by the next request. The cursor here is instead the instant the first page was ranked at plus an
 * offset, `<asOfMs>.<offset>`. Every later page re-ranks against that same instant, so the pages of one
 * visit are slices of one list: nothing repeats and nothing is skipped because time passed between them.
 *
 * The caller reads the slim rows (id and signals only) for everything its filters match, this picks the
 * ids of one page, and the caller then reads the full rows for those ids. Two queries a page, however
 * long the list is.
 */
import {
  rankCreations,
  type CreationSort,
  type Rankable,
} from './best';

/** The most rows one list ranks. Callers read the newest this many; older rows fall off the end of the list. */
export const RANK_CANDIDATE_CAP = 5000;

export interface RankCursor {
  asOf: number;
  offset: number;
}

export function parseRankCursor(
  cursor:
    | string
    | null
    | undefined,
  now: number,
): RankCursor {
  const m =
    /^(\d{1,15})\.(\d{1,7})$/.exec(
      cursor ??
        '',
    );
  if (
    !m
  )
    return {
      asOf: now,
      offset: 0,
    };
  // An instant from the future would rank everything at age zero; fall back to now.
  const asOf =
    Math.min(
      Number(
        m[1],
      ),
      now,
    );
  return {
    asOf,
    offset:
      Number(
        m[2],
      ),
  };
}

export function rankPage<
  T extends
    Rankable,
>(
  rows: readonly T[],
  sort: CreationSort,
  cursor:
    | string
    | null
    | undefined,
  limit: number,
  now: number = Date.now(),
): {
  ids: string[];
  nextCursor:
    | string
    | null;
} {
  const {
    asOf,
    offset,
  } =
    parseRankCursor(
      cursor,
      now,
    );
  const ranked =
    rankCreations(
      rows,
      sort,
      asOf,
    );
  const ids =
    ranked
      .slice(
        offset,
        offset +
          limit,
      )
      .map(
        (
          r,
        ) =>
          r.id,
      );
  const end =
    offset +
    ids.length;
  return {
    ids,
    nextCursor:
      end <
      ranked.length
        ? `${asOf}.${end}`
        : null,
  };
}

/** Put full rows back in the order of the page's ids (an `id IN (…)` read returns them in any order). */
export function inIdOrder<
  T extends
    {
      id: string;
    },
>(
  ids: readonly string[],
  rows: readonly T[],
): T[] {
  const byId =
    new Map(
      rows.map(
        (
          r,
        ) => [
          r.id,
          r,
        ],
      ),
    );
  const out: T[] =
    [];
  for (const id of ids) {
    const row =
      byId.get(
        id,
      );
    if (
      row
    )
      out.push(
        row,
      );
  }
  return out;
}
