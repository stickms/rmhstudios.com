/**
 * What the share card says in its stat blocks. Pure and client-safe.
 *
 * Before any votes the honest numbers are how many seats are ON THE BALLOT, not a score: the
 * feed's pre-election "seats" are only the seats not up this year (34–31, or 0–0 for a House
 * with nothing locked in), which on a card reads like a result. Once votes are in, it is the
 * running D–R count per chamber plus how many races are called.
 */

import { buildFacts } from './summary';
import {
  OFFICE_NAME,
  type ElectionSnapshot,
} from './types';

export interface CardStat {
  value: string;
  label: string;
  /** Which party colour the value takes: a result is two-toned in the card, a count is ink. */
  tone:
    | 'ink'
    | 'result';
  /** For a result: the two sides, so the card can colour D blue and R red. */
  dem?: number;
  gop?: number;
}

const ORDER =
  [
    'president',
    'senate',
    'house',
    'governor',
  ] as const;

export function cardStats(
  snapshot: ElectionSnapshot,
): CardStat[] {
  const f =
    buildFacts(
      snapshot,
    );
  const out: CardStat[] =
    [];

  if (
    !snapshot.live ||
    f.racesCalled ===
      0
  ) {
    for (const o of ORDER) {
      const c =
        f.chambers.find(
          (
            x,
          ) =>
            x.office ===
            o,
        );
      if (
        c &&
        c.seatsUp >
          0
      ) {
        out.push(
          {
            value:
              String(
                c.seatsUp,
              ),
            label: `${OFFICE_NAME[o]} on the ballot`,
            tone: 'ink',
          },
        );
      }
    }
    return out.slice(
      0,
      4,
    );
  }

  for (const o of ORDER) {
    const c =
      f.chambers.find(
        (
          x,
        ) =>
          x.office ===
          o,
      );
    if (
      !c
    )
      continue;
    // A governor tally derived from called races only is a partial count: skip it until it means something.
    if (
      c.derived &&
      c.racesCalled ===
        0
    )
      continue;
    out.push(
      {
        value: `${c.seats.DEM}–${c.seats.GOP}`,
        label: `${OFFICE_NAME[o]} D–R${c.derived ? ' · called' : ''}`,
        tone: 'result',
        dem: c
          .seats
          .DEM,
        gop: c
          .seats
          .GOP,
      },
    );
  }
  out.push(
    {
      value: `${f.racesCalled}/${f.racesTotal}`,
      label:
        'races called',
      tone: 'ink',
    },
  );
  return out.slice(
    0,
    4,
  );
}
