/**
 * An indicative lean for each chamber, for the liquid globe. Client-safe and pure.
 *
 * It is a simple model, not a polling forecast: the seats a party already holds or has won (the source's tally,
 * holdovers included) plus, for every undecided race, the chance the Democrat wins. That chance starts from the
 * race's rating and, as votes come in, moves toward what the count says: the more is counted, the more the
 * current margin counts and the less the rating does. The chance of control treats the undecided races as
 * independent and uses a normal approximation, so it understates the way real races move together. Say so.
 */

import type {
  ChamberControl,
  Race,
  Rating,
} from './types';
import { clamp } from '@/lib/core/math';

/** Prior chance a Democrat wins, from the rating alone. */
export const RATING_PRIOR: Record<
  Rating,
  number
> =
  {
    'solid-dem': 0.98,
    'likely-dem': 0.88,
    'lean-dem': 0.66,
    tossup: 0.5,
    'lean-rep': 0.34,
    'likely-rep': 0.12,
    'solid-rep': 0.02,
  };

const logit =
  (
    p: number,
  ) =>
    Math.log(
      p /
        (1 -
          p),
    );
const sigmoid =
  (
    x: number,
  ) =>
    1 /
    (1 +
      Math.exp(
        -x,
      ));

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function normalCdf(
  z: number,
): number {
  const t =
    1 /
    (1 +
      (0.3275911 *
        Math.abs(
          z,
        )) /
        Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 *
      t -
      1.453152027) *
      t +
      1.421413741) *
      t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(
        (-z *
          z) /
          2,
      );
  return (
    0.5 *
    (1 +
      (z <
      0
        ? -y
        : y))
  );
}

/** Democratic-minus-Republican margin in points, from the race's own candidates; null with no votes. */
function demMargin(
  r: Race,
):
  | number
  | null {
  if (
    !(
      r.totalVotes >
      0
    )
  )
    return null;
  const best =
    (
      p:
        | 'DEM'
        | 'GOP',
    ) =>
      r.candidates
        .filter(
          (
            c,
          ) =>
            c.party ===
            p,
        )
        .reduce(
          (
            m,
            c,
          ) =>
            Math.max(
              m,
              c.pct,
            ),
          0,
        );
  const d =
    best(
      'DEM',
    );
  const g =
    best(
      'GOP',
    );
  return d ===
    0 &&
    g ===
      0
    ? null
    : d -
        g;
}

/** Chance the Democrat wins an undecided race. */
export function demWinChance(
  r: Race,
): number {
  const prior =
    r.rating
      ? RATING_PRIOR[
          r
            .rating
        ]
      : 0.5;
  const m =
    demMargin(
      r,
    );
  const w =
    clamp(
      (r.pctReporting ??
        0) /
        100,
      0,
      0.98,
    );
  if (
    m ==
      null ||
    w <=
      0
  )
    return prior;
  // Live evidence: the margin, scaled by how uncertain what is still to come is (more left → more room to move).
  const live =
    m /
    (4 *
      (1 -
        w) +
      1.5);
  return clamp(
    sigmoid(
      (1 -
        w) *
        logit(
          clamp(
            prior,
            0.02,
            0.98,
          ),
        ) +
        w *
          live,
    ),
    0.005,
    0.995,
  );
}

export type LeanWord =
  | 'dem'
  | 'gop'
  | 'even';

export interface ChamberLean {
  office:
    | 'senate'
    | 'house';
  name: string;
  /** Expected seats, holdovers and called races included. */
  dem: number;
  gop: number;
  toWin: number;
  /** Races still undecided. */
  undecided: number;
  /** Seats already decided for each party (held plus called). */
  seatsDem: number;
  seatsGop: number;
  /** dem / (dem + gop): 0.5 is a tie. */
  demShare: number;
  /** Where the majority line sits in the same 0–1 share. */
  majorityShare: number;
  /** Indicative chance each party ends up with control (they need not sum to 1: ties, others). */
  demControl: number;
  gopControl: number;
  lean: LeanWord;
  /** What the numbers are based on. */
  basis:
    | 'ratings'
    | 'live'
    | 'final';
}

const NAME =
  {
    senate:
      'Senate',
    house:
      'House',
  } as const;

export function chamberLean(
  office:
    | 'senate'
    | 'house',
  chamber:
    | ChamberControl
    | undefined,
  races: Race[],
): ChamberLean | null {
  // With no holdover tally ("called so far" only) there is no honest total to compare.
  if (
    !chamber ||
    chamber.derived
  )
    return null;
  const open =
    races.filter(
      (
        r,
      ) =>
        r.office ===
          office &&
        r.status !==
          'called',
    );
  let eDem = 0;
  let variance = 0;
  let live = false;
  for (const r of open) {
    const p =
      demWinChance(
        r,
      );
    eDem +=
      p;
    variance +=
      p *
      (1 -
        p);
    if (
      r.status ===
      'counting'
    )
      live = true;
  }
  const seatsDem =
    chamber
      .seats
      .DEM;
  const seatsGop =
    chamber
      .seats
      .GOP;
  const eGop =
    open.length -
    eDem;
  const dem =
    seatsDem +
    eDem;
  const gop =
    seatsGop +
    eGop;
  const total =
    dem +
    gop;
  const sd =
    Math.sqrt(
      variance,
    );
  // P(Dem seats ≥ toWin): the final count is seatsDem + (wins among undecided), continuity-corrected.
  const need =
    chamber.toWin -
    seatsDem -
    0.5;
  const demControl =
    chamber.controlledBy ===
    'DEM'
      ? 1
      : chamber.controlledBy ===
          'GOP'
        ? 0
        : sd >
            0
          ? 1 -
            normalCdf(
              (need -
                eDem) /
                sd,
            )
          : eDem >=
              need
            ? 1
            : 0;
  const gopNeed =
    chamber.toWin -
    seatsGop -
    0.5;
  const eGopOpen =
    open.length -
    eDem;
  const gopControl =
    chamber.controlledBy ===
    'GOP'
      ? 1
      : chamber.controlledBy ===
          'DEM'
        ? 0
        : sd >
            0
          ? 1 -
            normalCdf(
              (gopNeed -
                eGopOpen) /
                sd,
            )
          : eGopOpen >=
              gopNeed
            ? 1
            : 0;
  const demShare =
    total >
    0
      ? dem /
        total
      : 0.5;
  const gap =
    dem -
    gop;
  const lean: LeanWord =
    Math.abs(
      gap,
    ) <
    Math.max(
      1,
      total *
        0.01,
    )
      ? 'even'
      : gap >
          0
        ? 'dem'
        : 'gop';
  return {
    office,
    name: NAME[
      office
    ],
    dem,
    gop,
    toWin:
      chamber.toWin,
    undecided:
      open.length,
    seatsDem,
    seatsGop,
    demShare,
    majorityShare:
      total >
      0
        ? clamp(
            chamber.toWin /
              total,
            0,
            1,
          )
        : 0.5,
    demControl,
    gopControl,
    lean,
    basis:
      open.length ===
      0
        ? 'final'
        : live
          ? 'live'
          : 'ratings',
  };
}
