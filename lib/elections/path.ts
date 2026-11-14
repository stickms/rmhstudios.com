/**
 * Path to control: for each chamber, what each party still needs. Pure.
 *
 * Starting from the seats a party holds or has won (the source's tally, holdovers included), it adds the
 * undecided races that lean its way, and reports how many of the remaining toss-ups it would still need —
 * or that it cannot get there even by winning every toss-up.
 */

import type {
  ChamberControl,
  Party,
  Race,
} from './types';

export interface PartyPath {
  party:
    | 'DEM'
    | 'GOP';
  /** Seats held or won now. */
  seats: number;
  /** Undecided races rated to lean (or better) toward this party. */
  leaning: number;
  /** Toss-ups this party must still win to reach control; 0 once leans alone get there. */
  tossupsNeeded: number;
  /** Winning every toss-up would be enough. */
  reachable: boolean;
}

export interface ChamberPath {
  office:
    | 'senate'
    | 'house';
  toWin: number;
  tossups: number;
  undecided: number;
  controlledBy: Party | null;
  dem: PartyPath;
  gop: PartyPath;
}

function pathFor(
  party:
    | 'DEM'
    | 'GOP',
  seats: number,
  leaning: number,
  tossups: number,
  toWin: number,
): PartyPath {
  const short =
    Math.max(
      0,
      toWin -
        seats -
        leaning,
    );
  return {
    party,
    seats,
    leaning,
    tossupsNeeded:
      short,
    reachable:
      short <=
      tossups,
  };
}

export function pathToControl(
  chambers: Partial<
    Record<
      | 'senate'
      | 'house',
      ChamberControl
    >
  >,
  races: Race[],
): ChamberPath[] {
  const out: ChamberPath[] =
    [];
  for (const office of [
    'senate',
    'house',
  ] as const) {
    const c =
      chambers[
        office
      ];
    // A chamber with no holdover tally ("called so far" only) cannot say who is short of what.
    if (
      !c ||
      c.derived
    )
      continue;
    let dem = 0;
    let gop = 0;
    let tossups = 0;
    let undecided = 0;
    for (const r of races) {
      if (
        r.office !==
          office ||
        r.status ===
          'called'
      )
        continue;
      undecided++;
      if (
        r.rating ===
        'tossup'
      )
        tossups++;
      else if (
        r.rating?.endsWith(
          'dem',
        )
      )
        dem++;
      else if (
        r.rating
      )
        gop++;
    }
    out.push(
      {
        office,
        toWin:
          c.toWin,
        tossups,
        undecided,
        controlledBy:
          c.controlledBy,
        dem: pathFor(
          'DEM',
          c
            .seats
            .DEM,
          dem,
          tossups,
          c.toWin,
        ),
        gop: pathFor(
          'GOP',
          c
            .seats
            .GOP,
          gop,
          tossups,
          c.toWin,
        ),
      },
    );
  }
  return out;
}
