// Pure, side-effect-free bracket generation. No Prisma, no I/O — so it can be
// unit-tested and imported by the client for previews. The server persists the
// output and links matches by their (round, slot) keys.

export interface BracketMatch {
  round: number; // 1-based
  slot: number; // 0-based position within the round
  /** Entrant id in slot A, or null (empty / bye / awaiting a prior round). */
  entrantAId: string | null;
  entrantBId: string | null;
  /** Where this match's winner flows: key `${round}:${slot}` of the next match. */
  nextKey: string | null;
  /** Which slot of the next match the winner takes (0 = A, 1 = B). */
  nextSlot: 0 | 1 | null;
  /** READY = both entrants set; PENDING = awaiting prior rounds; BYE = walkover. */
  state: 'READY' | 'PENDING' | 'BYE';
}

export interface Bracket {
  format: 'SINGLE_ELIM' | 'ROUND_ROBIN';
  rounds: number;
  matches: BracketMatch[];
}

/** Next power of two >= n (min 2). */
function nextPow2(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard tournament seeding order for a bracket of `size` (a power of two).
 * Returns seed numbers (1-based) in bracket-position order so that top seeds are
 * spread apart and only meet in later rounds. e.g. size 4 → [1,4,2,3];
 * size 8 → [1,8,4,5,2,7,3,6].
 */
export function standardSeedPositions(size: number): number[] {
  let positions = [1, 2];
  while (positions.length < size) {
    const len = positions.length * 2 + 1;
    const next: number[] = [];
    for (const p of positions) {
      next.push(p);
      next.push(len - p);
    }
    positions = next;
  }
  return positions;
}

/**
 * Build a single-elimination bracket from entrant ids ordered by seed (index 0 =
 * top seed). Byes are given to the top seeds automatically when the entrant
 * count is not a power of two.
 */
export function generateSingleElim(entrantIdsBySeed: string[]): Bracket {
  const n = entrantIdsBySeed.length;
  if (n < 2) return { format: 'SINGLE_ELIM', rounds: 0, matches: [] };
  const size = nextPow2(n);
  const totalRounds = Math.log2(size);
  const seedOrder = standardSeedPositions(size); // seed # per bracket position

  const matches: BracketMatch[] = [];

  // Round 1: pair up bracket positions (0,1),(2,3),…
  const round1Matches = size / 2;
  for (let slot = 0; slot < round1Matches; slot++) {
    const seedA = seedOrder[slot * 2];
    const seedB = seedOrder[slot * 2 + 1];
    const entrantAId = seedA <= n ? entrantIdsBySeed[seedA - 1] : null;
    const entrantBId = seedB <= n ? entrantIdsBySeed[seedB - 1] : null;
    const hasNext = totalRounds > 1;
    const nextKey = hasNext ? `2:${Math.floor(slot / 2)}` : null;
    const nextSlot = hasNext ? ((slot % 2) as 0 | 1) : null;
    let state: BracketMatch['state'] = 'READY';
    if (entrantAId && !entrantBId) state = 'BYE';
    else if (!entrantAId && entrantBId) state = 'BYE';
    matches.push({ round: 1, slot, entrantAId, entrantBId, nextKey, nextSlot, state });
  }

  // Rounds 2..totalRounds: empty, filled as winners advance.
  for (let round = 2; round <= totalRounds; round++) {
    const roundMatches = size / 2 ** round;
    for (let slot = 0; slot < roundMatches; slot++) {
      const hasNext = round < totalRounds;
      matches.push({
        round,
        slot,
        entrantAId: null,
        entrantBId: null,
        nextKey: hasNext ? `${round + 1}:${Math.floor(slot / 2)}` : null,
        nextSlot: hasNext ? ((slot % 2) as 0 | 1) : null,
        state: 'PENDING',
      });
    }
  }

  return { format: 'SINGLE_ELIM', rounds: totalRounds, matches };
}

/**
 * Round-robin: every entrant plays every other once. Rounds are informational
 * (scheduling only); final standings come from win counts. Matches carry no
 * next-link — the tournament completes when all matches are decided.
 */
export function generateRoundRobin(entrantIdsBySeed: string[]): Bracket {
  const ids = entrantIdsBySeed;
  const n = ids.length;
  const matches: BracketMatch[] = [];
  let slot = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        round: 1,
        slot: slot++,
        entrantAId: ids[i],
        entrantBId: ids[j],
        nextKey: null,
        nextSlot: null,
        state: 'READY',
      });
    }
  }
  return { format: 'ROUND_ROBIN', rounds: 1, matches };
}

export function generateBracket(
  format: 'SINGLE_ELIM' | 'ROUND_ROBIN',
  entrantIdsBySeed: string[],
): Bracket {
  return format === 'ROUND_ROBIN'
    ? generateRoundRobin(entrantIdsBySeed)
    : generateSingleElim(entrantIdsBySeed);
}
