// Pure, side-effect-free bracket generation. No Prisma, no I/O — so it can be
// unit-tested and imported by the client for previews. The server persists the
// output and links matches by their (round, slot) keys.

export interface BracketMatch {
  round: number; // 1-based
  slot: number; // 0-based position within the round
  /** Entrant id in slot A, or null (empty / bye / awaiting a prior round). */
  entrantAId:
    | string
    | null;
  entrantBId:
    | string
    | null;
  /** Where this match's winner flows: key `${round}:${slot}` of the next match. */
  nextKey:
    | string
    | null;
  /** Which slot of the next match the winner takes (0 = A, 1 = B). */
  nextSlot:
    | 0
    | 1
    | null;
  /** READY = both entrants set; PENDING = awaiting prior rounds; BYE = walkover. */
  state:
    | 'READY'
    | 'PENDING'
    | 'BYE';
  /** Double elimination only (absent = winners bracket): which bracket the match belongs to. */
  bracket?: BracketId;
  /** Double elimination only: key `${round}:${slot}` the loser of this match drops into. */
  loserKey?: string | null;
  /** Double elimination only: which slot of that match the loser takes. */
  loserSlot?: 0 | 1 | null;
}

/** W winners bracket, L losers bracket, GF grand final, GR bracket reset. */
export type BracketId = 'W' | 'L' | 'GF' | 'GR';

export interface Bracket {
  format:
    | 'SINGLE_ELIM'
    | 'DOUBLE_ELIM'
    | 'ROUND_ROBIN';
  rounds: number;
  matches: BracketMatch[];
}

/** Next power of two >= n (min 2). */
function nextPow2(
  n: number,
): number {
  let p = 2;
  while (
    p <
    n
  )
    p *= 2;
  return p;
}

/**
 * Standard tournament seeding order for a bracket of `size` (a power of two).
 * Returns seed numbers (1-based) in bracket-position order so that top seeds are
 * spread apart and only meet in later rounds. e.g. size 4 → [1,4,2,3];
 * size 8 → [1,8,4,5,2,7,3,6].
 */
export function standardSeedPositions(
  size: number,
): number[] {
  let positions =
    [
      1,
      2,
    ];
  while (
    positions.length <
    size
  ) {
    const len =
      positions.length *
        2 +
      1;
    const next: number[] =
      [];
    for (const p of positions) {
      next.push(
        p,
      );
      next.push(
        len -
          p,
      );
    }
    positions =
      next;
  }
  return positions;
}

/**
 * Build a single-elimination bracket from entrant ids ordered by seed (index 0 =
 * top seed). Byes are given to the top seeds automatically when the entrant
 * count is not a power of two.
 */
export function generateSingleElim(
  entrantIdsBySeed: string[],
): Bracket {
  const n =
    entrantIdsBySeed.length;
  if (
    n <
    2
  )
    return {
      format:
        'SINGLE_ELIM',
      rounds: 0,
      matches:
        [],
    };
  const size =
    nextPow2(
      n,
    );
  const totalRounds =
    Math.log2(
      size,
    );
  const seedOrder =
    standardSeedPositions(
      size,
    ); // seed # per bracket position

  const matches: BracketMatch[] =
    [];

  // Round 1: pair up bracket positions (0,1),(2,3),…
  const round1Matches =
    size /
    2;
  for (
    let slot = 0;
    slot <
    round1Matches;
    slot++
  ) {
    const seedA =
      seedOrder[
        slot *
          2
      ];
    const seedB =
      seedOrder[
        slot *
          2 +
          1
      ];
    const entrantAId =
      seedA <=
      n
        ? entrantIdsBySeed[
            seedA -
              1
          ]
        : null;
    const entrantBId =
      seedB <=
      n
        ? entrantIdsBySeed[
            seedB -
              1
          ]
        : null;
    const hasNext =
      totalRounds >
      1;
    const nextKey =
      hasNext
        ? `2:${Math.floor(slot / 2)}`
        : null;
    const nextSlot =
      hasNext
        ? ((slot %
            2) as
            | 0
            | 1)
        : null;
    let state: BracketMatch['state'] =
      'READY';
    if (
      entrantAId &&
      !entrantBId
    )
      state =
        'BYE';
    else if (
      !entrantAId &&
      entrantBId
    )
      state =
        'BYE';
    matches.push(
      {
        round: 1,
        slot,
        entrantAId,
        entrantBId,
        nextKey,
        nextSlot,
        state,
      },
    );
  }

  // Rounds 2..totalRounds: empty, filled as winners advance.
  for (
    let round = 2;
    round <=
    totalRounds;
    round++
  ) {
    const roundMatches =
      size /
      2 **
        round;
    for (
      let slot = 0;
      slot <
      roundMatches;
      slot++
    ) {
      const hasNext =
        round <
        totalRounds;
      matches.push(
        {
          round,
          slot,
          entrantAId:
            null,
          entrantBId:
            null,
          nextKey:
            hasNext
              ? `${round + 1}:${Math.floor(slot / 2)}`
              : null,
          nextSlot:
            hasNext
              ? ((slot %
                  2) as
                  | 0
                  | 1)
              : null,
          state:
            'PENDING',
        },
      );
    }
  }

  return {
    format:
      'SINGLE_ELIM',
    rounds:
      totalRounds,
    matches,
  };
}

/**
 * Round-robin: every entrant plays every other once. Rounds are informational
 * (scheduling only); final standings come from win counts. Matches carry no
 * next-link — the tournament completes when all matches are decided.
 */
export function generateRoundRobin(
  entrantIdsBySeed: string[],
): Bracket {
  const ids =
    entrantIdsBySeed;
  const n =
    ids.length;
  const matches: BracketMatch[] =
    [];
  let slot = 0;
  for (
    let i = 0;
    i <
    n;
    i++
  ) {
    for (
      let j =
        i +
        1;
      j <
      n;
      j++
    ) {
      matches.push(
        {
          round: 1,
          slot: slot++,
          entrantAId:
            ids[
              i
            ],
          entrantBId:
            ids[
              j
            ],
          nextKey:
            null,
          nextSlot:
            null,
          state:
            'READY',
        },
      );
    }
  }
  return {
    format:
      'ROUND_ROBIN',
    rounds: 1,
    matches,
  };
}

export function generateBracket(
  format:
    | 'SINGLE_ELIM'
    | 'DOUBLE_ELIM'
    | 'ROUND_ROBIN',
  entrantIdsBySeed: string[],
): Bracket {
  if (format === 'ROUND_ROBIN') return generateRoundRobin(entrantIdsBySeed);
  if (format === 'DOUBLE_ELIM') return generateDoubleElim(entrantIdsBySeed);
  return generateSingleElim(entrantIdsBySeed);
}

/**
 * Double elimination for 4 or more entrants.
 *
 * Round numbering keeps `@@unique([tournamentId, round, slot])` valid across the
 * three brackets. With W = log2(bracket size):
 *   - winners bracket   rounds 1 .. W                 (exactly single elimination)
 *   - losers bracket    rounds W+1 .. 3W-2            (2(W-1) rounds, in play order)
 *   - grand final       round 3W-1, slot 0
 *   - bracket reset     round 3W, slot 0              (created lazily, never here)
 * `bracket` ('W' | 'L' | 'GF' | 'GR') says which one a round belongs to.
 *
 * Losers round 2j-1 (consolidation) pairs the survivors of the round before it
 * (round 1 pairs the winners-bracket round-1 losers); losers round 2j (drop-in)
 * pairs each survivor with the loser of winners round j+1, taken in reverse
 * order so a player does not meet someone they just lost to.
 *
 * A bye has no loser, so a losers match with fewer than two possible entrants is
 * not a match: it is left out and the one possible entrant is routed straight to
 * whatever the match would have fed (a match with none is dropped altogether).
 * Every other winners match carries a loser link, so at most 2n - 1 matches exist
 * up front and the champion of the losers bracket meets the winners champion in
 * the grand final (winners champion in slot A).
 */
export function generateDoubleElim(entrantIdsBySeed: string[]): Bracket {
  if (entrantIdsBySeed.length < 4) {
    return { format: 'DOUBLE_ELIM', rounds: 0, matches: [] };
  }
  const winners = generateSingleElim(entrantIdsBySeed);
  const W = winners.rounds;
  const keyOf = (round: number, slot: number) => `${round}:${slot}`;
  const matches: BracketMatch[] = winners.matches.map((m) => ({
    ...m,
    bracket: 'W' as const,
    loserKey: null,
    loserSlot: null,
  }));
  const byKey = new Map(matches.map((m) => [keyOf(m.round, m.slot), m]));

  // A producer is "the winner of match K" or "the loser of match K".
  type Producer = { kind: 'winner' | 'loser'; key: string } | null;
  const feed = (producer: Producer, key: string, slot: 0 | 1) => {
    const source = producer && byKey.get(producer.key);
    if (!producer || !source) return;
    if (producer.kind === 'winner') {
      source.nextKey = key;
      source.nextSlot = slot;
    } else {
      source.loserKey = key;
      source.loserSlot = slot;
    }
  };

  // Round-1 losers exist only for matches that are not byes.
  const round1Loser = (slot: number): Producer => {
    const m = byKey.get(keyOf(1, slot));
    return m && m.state !== 'BYE' ? { kind: 'loser', key: keyOf(1, slot) } : null;
  };

  const losersRounds = 2 * (W - 1);
  let previous: Producer[] = [];
  for (let k = 1; k <= losersRounds; k++) {
    const j = Math.ceil(k / 2);
    const count = 2 ** W / 2 ** (j + 1);
    const round = W + k;
    const current: Producer[] = [];
    for (let i = 0; i < count; i++) {
      let a: Producer;
      let b: Producer;
      if (k === 1) {
        a = round1Loser(2 * i);
        b = round1Loser(2 * i + 1);
      } else if (k % 2 === 1) {
        a = previous[2 * i] ?? null;
        b = previous[2 * i + 1] ?? null;
      } else {
        a = previous[i] ?? null;
        b = { kind: 'loser', key: keyOf(j + 1, count - 1 - i) };
      }
      const key = keyOf(round, i);
      if (a && b) {
        matches.push({
          round,
          slot: i,
          entrantAId: null,
          entrantBId: null,
          nextKey: null,
          nextSlot: null,
          state: 'PENDING',
          bracket: 'L',
          loserKey: null,
          loserSlot: null,
        });
        byKey.set(key, matches[matches.length - 1]);
        feed(a, key, 0);
        feed(b, key, 1);
        current.push({ kind: 'winner', key });
      } else {
        // Pass-through (one possible entrant) or empty (none): no match is made.
        current.push(a ?? b);
      }
    }
    previous = current;
  }

  const grandFinal = keyOf(3 * W - 1, 0);
  matches.push({
    round: 3 * W - 1,
    slot: 0,
    entrantAId: null,
    entrantBId: null,
    nextKey: null,
    nextSlot: null,
    state: 'PENDING',
    bracket: 'GF',
    loserKey: null,
    loserSlot: null,
  });
  feed({ kind: 'winner', key: keyOf(W, 0) }, grandFinal, 0);
  feed(previous[0] ?? null, grandFinal, 1);

  return { format: 'DOUBLE_ELIM', rounds: 3 * W - 1, matches };
}

/** The elimination data `rankDoubleElim` reads from a settled match. */
export interface DoubleElimMatchRow {
  round: number;
  bracket: string;
  state: string;
  entrantAId: string | null;
  entrantBId: string | null;
  winnerEntrantId: string | null;
}

/**
 * Final order of a finished double-elimination tournament, best first: the
 * champion (winner of the bracket reset if one was played, else of the grand
 * final), the other finalist, then everyone else by the losers-bracket round in
 * which they fell (later is better: the losers final loser is third, the losers
 * semifinal loser fourth), ties broken by more wins, then the better seed.
 */
export function rankDoubleElim(
  entrants: readonly { id: string; wins: number; seed: number | null }[],
  matches: readonly DoubleElimMatchRow[],
): string[] {
  const finalMatch =
    matches.find((m) => m.bracket === 'GR' && m.state === 'COMPLETE') ??
    matches.find((m) => m.bracket === 'GF' && m.state === 'COMPLETE');
  const champion = finalMatch?.winnerEntrantId ?? null;
  const runnerUp =
    finalMatch && champion
      ? ([finalMatch.entrantAId, finalMatch.entrantBId].find((id) => id && id !== champion) ?? null)
      : null;

  const fellIn = new Map<string, number>();
  for (const m of matches) {
    if (m.bracket !== 'L' || m.state !== 'COMPLETE' || !m.winnerEntrantId) continue;
    const loser = [m.entrantAId, m.entrantBId].find((id) => id && id !== m.winnerEntrantId);
    if (loser) fellIn.set(loser, m.round);
  }

  const rest = entrants
    .filter((e) => e.id !== champion && e.id !== runnerUp)
    .sort(
      (a, b) =>
        (fellIn.get(b.id) ?? 0) - (fellIn.get(a.id) ?? 0) ||
        b.wins - a.wins ||
        (a.seed ?? Infinity) - (b.seed ?? Infinity),
    )
    .map((e) => e.id);
  return [champion, runnerUp, ...rest].filter((id): id is string => id != null);
}

/** A bracket match with its row id assigned and `nextKey` resolved to that id. */
export interface PersistableMatch {
  id: string;
  round: number;
  slot: number;
  entrantAId:
    | string
    | null;
  entrantBId:
    | string
    | null;
  state:
    | 'READY'
    | 'PENDING'
    | 'BYE';
  /** Row id of the match this winner flows into, or null for a final/leaf. */
  nextMatchId:
    | string
    | null;
  nextSlot:
    | 0
    | 1
    | null;
  bracket: BracketId;
  /** Row id the loser of this match drops into (double elimination), else null. */
  loserNextMatchId:
    | string
    | null;
  loserNextSlot:
    | 0
    | 1
    | null;
}

/**
 * Assign row ids to a bracket and resolve every `nextKey` into the actual id of
 * the target match — in memory, before anything is written.
 *
 * The persistence path used to discover these ids the slow way: insert each
 * match one at a time to learn its generated id, then walk the bracket a second
 * time issuing an UPDATE per match to wire the links. Since `nextMatchId` is a
 * plain string column (not a Prisma relation — see prisma/schema/), the ids can
 * simply be minted up front, which collapses both passes into a single bulk
 * insert. Kept here, pure and id-generator-agnostic, so it stays unit-testable
 * and this module keeps its no-I/O contract.
 *
 * `makeId` must return a distinct id per call.
 */
export function resolveBracketRows(
  matches: BracketMatch[],
  makeId: () => string,
): PersistableMatch[] {
  const keyOf =
    (
      round: number,
      slot: number,
    ) =>
      `${round}:${slot}`;

  // Pass 1 (in memory): mint an id for every match and index it by its key.
  const ids =
    matches.map(
      () =>
        makeId(),
    );
  const idByKey =
    new Map<
      string,
      string
    >();
  matches.forEach(
    (
      m,
      i,
    ) =>
      idByKey.set(
        keyOf(
          m.round,
          m.slot,
        ),
        ids[
          i
        ],
      ),
  );

  // Pass 2 (in memory): resolve each nextKey to the id minted above. A nextKey
  // with no matching match is dropped rather than dangling, matching the old
  // behaviour where an unresolvable link simply never got written.
  return matches.map(
    (
      m,
      i,
    ) => ({
      id: ids[
        i
      ],
      round:
        m.round,
      slot: m.slot,
      entrantAId:
        m.entrantAId,
      entrantBId:
        m.entrantBId,
      state:
        m.state,
      nextMatchId:
        m.nextKey
          ? (idByKey.get(
              m.nextKey,
            ) ??
            null)
          : null,
      nextSlot:
        m.nextKey &&
        idByKey.get(
          m.nextKey,
        )
          ? m.nextSlot
          : null,
      bracket:
        m.bracket ?? 'W',
      loserNextMatchId:
        m.loserKey
          ? (idByKey.get(
              m.loserKey,
            ) ??
            null)
          : null,
      loserNextSlot:
        m.loserKey &&
        idByKey.get(
          m.loserKey,
        )
          ? (m.loserSlot ?? null)
          : null,
    }),
  );
}
