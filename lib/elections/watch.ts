/**
 * "What to watch": the competitive races that are still open, grouped by when their polls close. Pure.
 *
 * Toss-ups and leans in the Senate and governor races always qualify; House races only when rated a
 * toss-up (there are hundreds). A race drops out of the list the moment it is called.
 */

import type {
  ElectionSnapshot,
  Office,
  Race,
} from './types';

export interface WatchGroup {
  /** ISO instant the last polls in these states close; '' when the source gave no time. */
  iso: string;
  /** "7 p.m." — Eastern, as the source prints it. */
  displayET: string;
  /** Polls in these states have already closed. */
  closed: boolean;
  races: Race[];
}

const OFFICE_ORDER: Record<
  Office,
  number
> =
  {
    president: 0,
    senate: 1,
    governor: 2,
    house: 3,
  };

function competitive(
  r: Race,
): boolean {
  if (
    r.status ===
      'called' ||
    !r.rating
  )
    return false;
  if (
    r.rating ===
    'tossup'
  )
    return true;
  return (
    r.office !==
      'house' &&
    (r.rating ===
      'lean-dem' ||
      r.rating ===
        'lean-rep')
  );
}

export function watchByClosing(
  snapshot: ElectionSnapshot,
  now: Date = new Date(),
  perGroup = 8,
): WatchGroup[] {
  const groups =
    new Map<
      string,
      WatchGroup
    >();
  for (const race of snapshot.races) {
    if (
      !competitive(
        race,
      )
    )
      continue;
    const closing =
      snapshot
        .pollClosings[
        race
          .state
      ];
    const iso =
      closing?.iso ??
      '';
    let g =
      groups.get(
        iso,
      );
    if (
      !g
    ) {
      g =
        {
          iso,
          displayET:
            closing?.displayET ??
            '',
          closed:
            iso
              ? new Date(
                  iso,
                ).getTime() <=
                now.getTime()
              : false,
          races:
            [],
        };
      groups.set(
        iso,
        g,
      );
    }
    g.races.push(
      race,
    );
  }
  const out =
    [
      ...groups.values(),
    ].sort(
      (
        a,
        b,
      ) =>
        a.iso &&
        b.iso
          ? a.iso.localeCompare(
              b.iso,
            )
          : a.iso
            ? -1
            : b.iso
              ? 1
              : 0,
    );
  for (const g of out) {
    g.races.sort(
      (
        a,
        b,
      ) =>
        (a.rating ===
        'tossup'
          ? 0
          : 1) -
          (b.rating ===
          'tossup'
            ? 0
            : 1) ||
        OFFICE_ORDER[
          a
            .office
        ] -
          OFFICE_ORDER[
            b
              .office
          ] ||
        a.label.localeCompare(
          b.label,
        ),
    );
    g.races =
      g.races.slice(
        0,
        perGroup,
      );
  }
  return out;
}

/**
 * Nail-biters: races with votes in, no call yet, and a thin lead. Needs a few percent counted so an early
 * lopsided trickle does not read as a close race; closest first.
 */
export function nailBiters(
  races: Race[],
  limit = 6,
  maxMargin = 5,
  minReporting = 5,
): Race[] {
  return races
    .filter(
      (
        r,
      ) =>
        r.status ===
          'counting' &&
        r.margin !=
          null &&
        r.margin <=
          maxMargin &&
        (r.pctReporting ??
          0) >=
          minReporting,
    )
    .sort(
      (
        a,
        b,
      ) =>
        (a.margin ??
          99) -
          (b.margin ??
            99) ||
        OFFICE_ORDER[
          a
            .office
        ] -
          OFFICE_ORDER[
            b
              .office
          ],
    )
    .slice(
      0,
      limit,
    );
}
