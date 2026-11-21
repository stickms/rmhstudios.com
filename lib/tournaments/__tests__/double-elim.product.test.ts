/**
 * The double-elimination generator (bracket.ts): structure for every field size
 * from 4 to 64, the known 8-player crossover order, byes for 5, 6 and 7 players,
 * and a full simulation proving nobody leaves before a second loss.
 */
import { describe, expect, it } from 'vitest';
import {
  generateBracket,
  generateDoubleElim,
  rankDoubleElim,
  resolveBracketRows,
  type BracketMatch,
} from '../bracket';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);
const keyOf = (m: Pick<BracketMatch, 'round' | 'slot'>) => `${m.round}:${m.slot}`;
const sizes = Array.from({ length: 61 }, (_, i) => i + 4);

function rounds(n: number) {
  return Math.log2(2 ** Math.ceil(Math.log2(n)));
}

describe('generateDoubleElim structure', () => {
  it('refuses fewer than four entrants', () => {
    expect(generateDoubleElim(ids(3)).matches).toEqual([]);
  });

  it('is what generateBracket returns for DOUBLE_ELIM', () => {
    expect(generateBracket('DOUBLE_ELIM', ids(8))).toEqual(generateDoubleElim(ids(8)));
  });

  it.each(sizes)('n=%i: links are consistent and complete', (n) => {
    const { matches, rounds: total } = generateDoubleElim(ids(n));
    const W = rounds(n);
    expect(total).toBe(3 * W - 1);
    const keys = matches.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    const known = new Set(keys);
    const feeds = new Map<string, number>();
    const feed = (key: string | null | undefined, slot: number | null | undefined) => {
      expect(key && known.has(key)).toBe(true);
      expect([0, 1]).toContain(slot);
      const f = `${key}#${slot}`;
      expect(feeds.has(f)).toBe(false); // no two feeds into one slot
      feeds.set(f, 1);
    };
    for (const m of matches) {
      if (m.bracket === 'GF') {
        expect(m.nextKey).toBeNull();
        expect(m.loserKey).toBeNull();
      } else {
        feed(m.nextKey, m.nextSlot);
      }
      const bye = m.state === 'BYE';
      if (m.bracket === 'W' && !bye) feed(m.loserKey, m.loserSlot);
      else expect(m.loserKey ?? null).toBeNull(); // a bye has no loser; L matches drop nobody
    }
    // Every slot of every match that is not a round-1 winners match is fed.
    for (const m of matches) {
      if (m.bracket === 'W' && m.round === 1) continue;
      expect(feeds.has(`${keyOf(m)}#0`)).toBe(true);
      expect(feeds.has(`${keyOf(m)}#1`)).toBe(true);
    }
    // 2 * size - 1 rows up front (127 for 64 players); the reset is the +1 made later.
    expect(matches.length).toBeLessThanOrEqual(2 * 2 ** W - 1);
    expect(matches.filter((m) => m.bracket === 'GF')).toHaveLength(1);
    expect(matches.some((m) => m.bracket === 'GR')).toBe(false); // the reset is lazy
  });

  /**
   * Plays a generated bracket to the end. `pick` chooses the winner of each real
   * match; a bye passes its lone entrant on; a grand final won from the losers
   * side is followed by the reset. Returns each entrant's losses and the champion.
   */
  function play(n: number, pick: (a: string, b: string) => string) {
    const { matches } = generateDoubleElim(ids(n));
    const slots = new Map<string, [string | null, string | null]>();
    for (const m of matches) slots.set(keyOf(m), [m.entrantAId, m.entrantBId]);
    const losses = new Map<string, number>();
    const put = (key: string | null | undefined, slot: number | null | undefined, who: string) => {
      slots.get(key!)![slot!] = who;
    };
    let champion = '';
    const order = [...matches].sort((a, b) => a.round - b.round || a.slot - b.slot);
    for (const m of order) {
      const [a, b] = slots.get(keyOf(m))!;
      const pair = [a, b].filter((x): x is string => !!x);
      if (m.state !== 'BYE' && pair.length !== 2) throw new Error(`match ${keyOf(m)} has ${pair.length} entrants`);
      const winner = pair.length === 1 ? pair[0] : pick(pair[0], pair[1]);
      const loser = pair.find((x) => x !== winner) ?? null;
      if (m.nextKey) put(m.nextKey, m.nextSlot, winner);
      if (loser) {
        losses.set(loser, (losses.get(loser) ?? 0) + 1);
        if (m.bracket === 'W') put(m.loserKey, m.loserSlot, loser);
      }
      if (m.bracket === 'GF') {
        champion = winner;
        if (winner === b) {
          // Losers champion won: the same two play the reset.
          const resetWinner = pick(a!, b!);
          losses.set(resetWinner === a ? b! : a!, (losses.get(resetWinner === a ? b! : a!) ?? 0) + 1);
          champion = resetWinner;
        }
      }
    }
    return { losses, champion };
  }

  it.each(sizes)('n=%i: nobody leaves before a second loss (better seed always wins)', (n) => {
    const { losses, champion } = play(n, (x, y) => (Number(x.slice(1)) < Number(y.slice(1)) ? x : y));
    expect(champion).toBe('e1');
    for (let i = 1; i <= n; i++) expect(losses.get(`e${i}`) ?? 0).toBe(i === 1 ? 0 : 2);
  });

  it.each(sizes)('n=%i: with random results exactly one entrant has fewer than two losses', (n) => {
    let state = n * 7919;
    const rand = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    for (let round = 0; round < 6; round++) {
      const { losses, champion } = play(n, (x, y) => (rand() < 0.5 ? x : y));
      for (let i = 1; i <= n; i++) {
        const id = `e${i}`;
        const lost = losses.get(id) ?? 0;
        if (id === champion) expect(lost).toBeLessThanOrEqual(1);
        else expect(lost).toBe(2);
      }
    }
  });

  it('every non-bye winners match has a loser target (n=5..64)', () => {
    for (const n of sizes) {
      for (const m of generateDoubleElim(ids(n)).matches) {
        if (m.bracket !== 'W') continue;
        if (m.state === 'BYE') expect(m.loserKey ?? null).toBeNull();
        else expect(m.loserKey).toBeTruthy();
      }
    }
  });
});

describe('generateDoubleElim known shapes', () => {
  it('8 players: the conventional crossover order', () => {
    const { matches, rounds: total } = generateDoubleElim(ids(8));
    expect(total).toBe(8);
    const at = (k: string) => matches.find((m) => keyOf(m) === k)!;
    // Winners round 1 losers pair up in the first losers round.
    expect([at('1:0').loserKey, at('1:0').loserSlot]).toEqual(['4:0', 0]);
    expect([at('1:1').loserKey, at('1:1').loserSlot]).toEqual(['4:0', 1]);
    expect([at('1:2').loserKey, at('1:2').loserSlot]).toEqual(['4:1', 0]);
    expect([at('1:3').loserKey, at('1:3').loserSlot]).toEqual(['4:1', 1]);
    // Winners round 2 losers drop in reversed, so no one meets who they beat.
    expect([at('2:0').loserKey, at('2:0').loserSlot]).toEqual(['5:1', 1]);
    expect([at('2:1').loserKey, at('2:1').loserSlot]).toEqual(['5:0', 1]);
    expect([at('4:0').nextKey, at('4:0').nextSlot]).toEqual(['5:0', 0]);
    expect([at('4:1').nextKey, at('4:1').nextSlot]).toEqual(['5:1', 0]);
    expect([at('5:0').nextKey, at('5:0').nextSlot]).toEqual(['6:0', 0]);
    expect([at('5:1').nextKey, at('5:1').nextSlot]).toEqual(['6:0', 1]);
    expect([at('6:0').nextKey, at('6:0').nextSlot]).toEqual(['7:0', 0]);
    // The winners final drops into the losers final; both finals meet in the grand final.
    expect([at('3:0').loserKey, at('3:0').loserSlot]).toEqual(['7:0', 1]);
    expect([at('3:0').nextKey, at('3:0').nextSlot]).toEqual(['8:0', 0]);
    expect([at('7:0').nextKey, at('7:0').nextSlot]).toEqual(['8:0', 1]);
    expect(at('8:0').bracket).toBe('GF');
    expect(matches).toHaveLength(14);
  });

  it('5 players: three byes; the lone round-1 loser skips the empty first losers round', () => {
    const { matches } = generateDoubleElim(ids(5));
    expect(matches.filter((m) => m.state === 'BYE')).toHaveLength(3);
    expect(matches.filter((m) => m.bracket === 'L').map(keyOf)).toEqual(['5:0', '6:0', '7:0']);
    const real = matches.find((m) => m.round === 1 && m.state === 'READY')!;
    expect([real.loserKey, real.loserSlot]).toEqual(['5:0', 0]);
    // The odd winners-round-2 loser goes straight past losers round 2.
    const w2 = matches.filter((m) => m.round === 2).map((m) => [keyOf(m), m.loserKey, m.loserSlot]);
    expect(w2).toContainEqual(['2:0', '6:0', 1]);
    expect(w2).toContainEqual(['2:1', '5:0', 1]);
  });

  it('6 players: two byes; the first losers round disappears', () => {
    const { matches } = generateDoubleElim(ids(6));
    expect(matches.filter((m) => m.state === 'BYE')).toHaveLength(2);
    expect(matches.filter((m) => m.bracket === 'L').map(keyOf)).toEqual(['5:0', '5:1', '6:0', '7:0']);
    expect(matches).toHaveLength(12);
  });

  it('7 players: one bye; only half of the first losers round is played', () => {
    const { matches } = generateDoubleElim(ids(7));
    expect(matches.filter((m) => m.state === 'BYE')).toHaveLength(1);
    expect(matches.filter((m) => m.bracket === 'L').map(keyOf)).toEqual(['4:1', '5:0', '5:1', '6:0', '7:0']);
    expect(matches).toHaveLength(13);
    const bye = matches.find((m) => m.state === 'BYE')!;
    expect(bye.loserKey ?? null).toBeNull();
  });

  it('writes the loser links through resolveBracketRows', () => {
    let n = 0;
    const rows = resolveBracketRows(generateDoubleElim(ids(8)).matches, () => `id${n++}`);
    const byKey = new Map(generateDoubleElim(ids(8)).matches.map((m, i) => [keyOf(m), rows[i]]));
    const w1 = byKey.get('1:0')!;
    expect(w1.bracket).toBe('W');
    expect(w1.loserNextMatchId).toBe(byKey.get('4:0')!.id);
    expect(w1.loserNextSlot).toBe(0);
    expect(byKey.get('8:0')!.bracket).toBe('GF');
    expect(byKey.get('4:0')!.bracket).toBe('L');
  });
});

describe('rankDoubleElim', () => {
  const entrants = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, wins: 0, seed: i + 1 }));
  const row = (round: number, bracket: string, a: string, b: string, w: string) => ({
    round,
    bracket,
    state: 'COMPLETE',
    entrantAId: a,
    entrantBId: b,
    winnerEntrantId: w,
  });

  it('champion, runner-up, then by losers round fallen in, then wins, then seed', () => {
    const order = rankDoubleElim(
      [
        { id: 'a', wins: 4, seed: 1 },
        { id: 'b', wins: 5, seed: 2 },
        { id: 'c', wins: 3, seed: 3 },
        { id: 'd', wins: 2, seed: 4 },
        { id: 'e', wins: 1, seed: 5 },
        { id: 'f', wins: 1, seed: 6 },
      ],
      [
        row(4, 'L', 'e', 'f', 'e'), // f falls in round 4
        row(5, 'L', 'd', 'e', 'd'), // e falls in round 5
        row(6, 'L', 'c', 'd', 'c'), // d falls in round 6
        row(7, 'L', 'b', 'c', 'b'), // c falls in round 7
        row(8, 'GF', 'a', 'b', 'a'),
      ],
    );
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('a played reset decides the champion', () => {
    const order = rankDoubleElim(entrants.slice(0, 4), [
      row(4, 'L', 'c', 'd', 'c'),
      row(5, 'L', 'b', 'c', 'b'),
      row(6, 'GF', 'a', 'b', 'b'),
      row(7, 'GR', 'a', 'b', 'b'),
    ]);
    expect(order).toEqual(['b', 'a', 'c', 'd']);
  });

  it('breaks a same-round tie by wins, then seed', () => {
    const order = rankDoubleElim(
      [
        { id: 'a', wins: 3, seed: 1 },
        { id: 'b', wins: 3, seed: 2 },
        { id: 'c', wins: 1, seed: 3 },
        { id: 'd', wins: 2, seed: 4 },
        { id: 'e', wins: 2, seed: 5 },
      ],
      [
        row(4, 'L', 'c', 'a', 'a'),
        row(4, 'L', 'd', 'a', 'a'),
        row(4, 'L', 'e', 'a', 'a'),
        row(8, 'GF', 'a', 'b', 'a'),
      ],
    );
    expect(order.slice(2)).toEqual(['d', 'e', 'c']);
  });
});
