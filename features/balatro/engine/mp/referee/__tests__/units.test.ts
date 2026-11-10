/**
 * Pure referee building blocks: pairing (REF-02), Royale rank-and-cut and
 * targets (REF-05, REF-08), Manhunt (REF-06), Teams (REF-07), places
 * (REF-11) and the pending-death tables (REF-10, REF-12).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng';
import type { Id, RosterEntry } from '../../types';
import { assignManhuntRoles, manhuntRound, manhuntTarget } from '../manhunt';
import { circleRounds, computePairing, pairKey, stableOrder } from '../pairing';
import { blindKeyAnte, blindKeySlot, decide2pDeath, decideTeamPending } from '../pending';
import { computePlaces, placeKeys } from '../places';
import { rankAscending, royaleLosers, royaleTargets } from '../royale';
import { assignTeams, otherTeam, teamCardTargets } from '../teams';
import { ids } from './helpers';

const sc = (...scores: number[]) => scores.map((score, i) => ({ id: `p${i + 1}`, score }));

describe('circle method', () => {
  it.each([2, 4, 6, 8, 10, 16])(
    'n=%i gives n−1 disjoint perfect matchings covering every pair once',
    (n) => {
      const rounds = circleRounds(ids(n));
      expect(rounds).toHaveLength(n - 1);
      const seen = new Set<string>();
      for (const r of rounds) {
        const inRound = new Set<string>();
        for (const [a, b] of r) {
          inRound.add(a as string);
          inRound.add(b as string);
          const k = pairKey(a as string, b as string);
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
        expect(inRound.size).toBe(n);
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    },
  );
  it('rejects odd or tiny orders', () => {
    expect(circleRounds(['a', 'b', 'c'])).toEqual([]);
    expect(circleRounds(['a'])).toEqual([]);
  });
  it('pairKey is order-independent', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
    expect(pairKey('', 'x')).toBe('["","x"]');
  });
  it('stableOrder is a permutation, stable per salt', () => {
    const a = stableOrder(ids(8), 1);
    expect([...a].sort()).toEqual([...ids(8)].sort());
    expect(stableOrder([...ids(8)].reverse(), 1)).toEqual(a);
  });
});

describe('computePairing (REF-02)', () => {
  function cycle(n: number, seed: number, antes: number) {
    const alive = ids(n);
    let used: string[] = [];
    let lastBye: Id | null = null;
    const rng = new Rng(seed);
    const out: { pairing: Record<Id, Id | ''>; bye: Id | null; used: string[] }[] = [];
    for (let a = 0; a < antes; a++) {
      const r = computePairing({ alive, usedPairs: used, lastBye, salt: 1000 + seed }, rng);
      used = r.usedPairs;
      lastBye = r.lastBye;
      out.push({ pairing: r.pairing, bye: r.lastBye, used });
    }
    return out;
  }

  for (const n of [3, 4, 5, 6, 7, 8, 9, 12, 15, 16]) {
    it(`n=${n}: no pair repeats over n′−1 antes, then the cycle restarts (40 seeds)`, () => {
      const cycleLen = n % 2 === 0 ? n - 1 : n;
      for (let seed = 1; seed <= 40; seed++) {
        const rounds = cycle(n, seed, cycleLen + 2);
        const seen = new Set<string>();
        rounds.slice(0, cycleLen).forEach((r) => {
          const p = r.pairing;
          expect(Object.keys(p).sort()).toEqual([...ids(n)].sort());
          for (const [a, b] of Object.entries(p)) {
            if (b === '') continue;
            expect(p[b]).toBe(a); // symmetric
            if (a < b) {
              const k = pairKey(a, b);
              expect(seen.has(k)).toBe(false);
              seen.add(k);
            }
          }
          const byes = Object.values(p).filter((v) => v === '').length;
          expect(byes).toBe(n % 2);
        });
        expect(seen.size).toBe((n * (n - 1)) / 2);
        // After the cycle the used set is reset and a fresh round chosen.
        expect(rounds[cycleLen]?.used.length).toBeLessThanOrEqual(Math.ceil(n / 2));
      }
    });
  }

  it.each([3, 5, 7, 9, 15])(
    'n=%i: every player gets exactly one bye per cycle, never twice in a row',
    (n) => {
      for (let seed = 1; seed <= 25; seed++) {
        const rounds = cycle(n, seed, n * 3);
        const byes = rounds.map((r) => r.bye);
        expect(new Set(byes.slice(0, n)).size).toBe(n);
        for (let i = 1; i < byes.length; i++) expect(byes[i]).not.toBe(byes[i - 1]);
      }
    },
  );

  it('2 players pair with each other every ante; 1 player is a bye; 0 is empty', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 4; i++) {
      const r = computePairing(
        {
          alive: ['a', 'b'],
          usedPairs: i === 0 ? [] : [pairKey('a', 'b')],
          lastBye: null,
          salt: 1,
        },
        rng,
      );
      expect(r.pairing).toEqual({ a: 'b', b: 'a' });
      expect(r.lastBye).toBeNull();
    }
    expect(
      computePairing({ alive: ['a'], usedPairs: [], lastBye: null, salt: 1 }, rng),
    ).toMatchObject({ pairing: { a: '' }, lastBye: 'a' });
    expect(
      computePairing({ alive: [], usedPairs: [], lastBye: null, salt: 1 }, rng).pairing,
    ).toEqual({});
  });

  it('an alive set that changes mid-cycle still avoids used pairs when possible (search)', () => {
    const rng = new Rng(11);
    let used: string[] = [];
    let alive = ids(8);
    let lastBye: Id | null = null;
    for (let a = 0; a < 3; a++) {
      const r = computePairing({ alive, usedPairs: used, lastBye, salt: 5 }, rng);
      used = r.usedPairs;
      lastBye = r.lastBye;
    }
    alive = alive.filter((id) => id !== 'p3' && id !== 'p6');
    const before = new Set(used);
    const r = computePairing({ alive, usedPairs: used, lastBye, salt: 5 }, rng);
    for (const [a, b] of Object.entries(r.pairing))
      if (b) expect(before.has(pairKey(a, b))).toBe(false);
  });

  it('falls back to a reset when every pairing is used', () => {
    const all = [
      pairKey('a', 'b'),
      pairKey('a', 'c'),
      pairKey('a', 'd'),
      pairKey('b', 'c'),
      pairKey('b', 'd'),
      pairKey('c', 'd'),
    ];
    const r = computePairing(
      { alive: ['a', 'b', 'c', 'd'], usedPairs: all, lastBye: null, salt: 2 },
      new Rng(1),
    );
    expect(r.usedPairs).toHaveLength(2);
  });

  it('is deterministic for the same inputs and RNG state', () => {
    const a = computePairing({ alive: ids(7), usedPairs: [], lastBye: 'p2', salt: 9 }, new Rng(77));
    const b = computePairing({ alive: ids(7), usedPairs: [], lastBye: 'p2', salt: 9 }, new Rng(77));
    expect(a).toEqual(b);
    expect(a.lastBye).not.toBe('p2');
  });
});

describe('Royale rank-and-cut (REF-05 golden tests from A1)', () => {
  it.each<[number[], Id[]]>([
    [
      [10, 20, 20, 30, 40],
      ['p1', 'p2', 'p3'],
    ],
    [[10, 40, 40, 40], ['p1']],
    [[5, 5, 5, 5], []],
    [[1, 2], ['p1']],
    [[2, 2], []],
    [[3, 1, 2], ['p2']],
    [
      [1, 2, 3, 4, 5, 6, 7, 8],
      ['p1', 'p2', 'p3', 'p4'],
    ],
    [
      [1, 1, 1, 9],
      ['p1', 'p2', 'p3'],
    ],
    [
      [9, 9, 1, 1],
      ['p3', 'p4'],
    ],
    [
      [0, 0, 0, 1, 1],
      ['p1', 'p2', 'p3'],
    ],
    [[Infinity, Infinity, 1], ['p3']],
    [[Infinity, Infinity, Infinity], []],
    [[-Infinity, 0, 0], ['p1']],
    [[7], []],
    [[], []],
  ])('%j → losers %j', (scores, losers) => {
    expect(royaleLosers(sc(...scores))).toEqual(losers);
  });
  it('ties sort stably in input order', () => {
    expect(rankAscending(sc(2, 1, 2, 1)).map((e) => e.id)).toEqual(['p2', 'p4', 'p1', 'p3']);
  });
  it('live targets: safe → next lower, unsafe → next higher (REF-08)', () => {
    // ranked: p1(10) p2(20) p3(30) p4(40); losers p1,p2
    expect(royaleTargets(sc(10, 20, 30, 40))).toEqual({ p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    expect(royaleTargets(sc(5, 5, 5))).toEqual({ p1: '', p2: 'p1', p3: 'p2' });
    expect(royaleTargets(sc(1))).toEqual({ p1: '' });
  });
});

describe('Manhunt (REF-06)', () => {
  const roster = (teams: (string | undefined)[]): RosterEntry[] =>
    teams.map((t, i) => ({
      id: `p${i + 1}`,
      name: 'x',
      blindCol: 1,
      avatarJoker: 'j_joker',
      ...(t ? { team: t as 'RUNNER' } : {}),
    }));
  it('one Runner: first claimant, else first player; extra claimants demoted', () => {
    expect(assignManhuntRoles(roster([undefined, 'RUNNER', 'RUNNER']))).toEqual({
      p1: 'HUNTER',
      p2: 'RUNNER',
      p3: 'HUNTER',
    });
    expect(assignManhuntRoles(roster([undefined, 'HUNTER']))).toEqual({
      p1: 'RUNNER',
      p2: 'HUNTER',
    });
    expect(assignManhuntRoles([])).toEqual({});
  });
  it.each<[number, number[], Id[], boolean]>([
    [100, [50, 150], ['h1'], true],
    [100, [100, 100], ['h1', 'h2'], false],
    [0, [0, 0], [], false],
    [0, [0, 5], [], true],
    [100, [200, 300], [], true],
    [100, [10, 20], ['h1', 'h2'], false],
    [Infinity, [Infinity], ['h1'], false],
  ])('runner %s vs hunters %j → losers %j, caught %s', (runner, hunters, losers, caught) => {
    const r = manhuntRound(
      { id: 'r', score: runner },
      hunters.map((score, i) => ({ id: `h${i + 1}`, score })),
    );
    expect(r).toEqual({ hunterLosers: losers, runnerCaught: caught });
  });
  it('no hunters: never caught; target is the top hunter', () => {
    expect(manhuntRound({ id: 'r', score: 1 }, []).runnerCaught).toBe(false);
    expect(
      manhuntTarget([
        { id: 'a', score: 3 },
        { id: 'b', score: 9 },
        { id: 'c', score: 9 },
      ]),
    ).toBe('b');
    expect(manhuntTarget([])).toBe('');
  });
});

describe('Teams (REF-07, D-13)', () => {
  const roster = (teams: (string | undefined)[]): RosterEntry[] =>
    teams.map((t, i) => ({
      id: `p${i + 1}`,
      name: 'x',
      blindCol: 1,
      avatarJoker: 'j_joker',
      ...(t ? { team: t as 'A' } : {}),
    }));
  it('keeps picks, balances the unpicked (ties → A), allows uneven picks', () => {
    expect(assignTeams(roster([undefined, undefined, undefined, undefined]))).toEqual({
      p1: 'A',
      p2: 'B',
      p3: 'A',
      p4: 'B',
    });
    expect(assignTeams(roster(['A', 'A', undefined, undefined]))).toEqual({
      p1: 'A',
      p2: 'A',
      p3: 'B',
      p4: 'B',
    });
    expect(assignTeams(roster(['A', 'A', 'A', 'B']))).toEqual({
      p1: 'A',
      p2: 'A',
      p3: 'A',
      p4: 'B',
    });
    expect(assignTeams(roster(['B', undefined, 'HUNTER']))).toEqual({ p1: 'B', p2: 'A', p3: 'A' });
    expect(otherTeam('A')).toBe('B');
  });
  it('card targets rotate with the ante over the alive opponents', () => {
    const team = (id: Id) => (['p1', 'p3'].includes(id) ? 'A' : 'B') as 'A' | 'B';
    const order = ids(4);
    expect(teamCardTargets(order, team, () => true, 1)).toEqual({
      p1: 'p2',
      p2: 'p1',
      p3: 'p4',
      p4: 'p3',
    });
    expect(teamCardTargets(order, team, () => true, 2)).toEqual({
      p1: 'p4',
      p2: 'p3',
      p3: 'p2',
      p4: 'p1',
    });
    expect(teamCardTargets(order, team, (id) => id !== 'p2' && id !== 'p4', 1)).toEqual({
      p1: '',
      p3: '',
    });
    expect(
      teamCardTargets(
        order,
        () => undefined,
        () => true,
        1,
      ),
    ).toEqual({});
  });
});

describe('pending-death tables', () => {
  const base = {
    dead: 'd',
    opponent: 'o',
    opponentLives: 2,
    opponentPresent: true,
    opponentResult: undefined as 'B' | 'F' | undefined,
  };
  it.each([
    [{ opponentResult: 'B' as const }, { kind: 'win', winner: 'o' }],
    [
      { opponentResult: 'B' as const, opponentLives: 0 },
      { kind: 'win', winner: 'o' },
    ],
    [{ opponentResult: undefined, opponentLives: 0 }, { kind: 'draw' }],
    [{ opponentResult: 'F' as const, opponentLives: 0 }, { kind: 'draw' }],
    [{ opponentResult: 'F' as const }, { kind: 'win', winner: 'o' }],
    [
      { opponentResult: undefined, opponentPresent: false },
      { kind: 'win', winner: 'd' },
    ],
    [{ opponentResult: undefined }, { kind: 'pending' }],
  ])('2p decision table (REF-10) %j', (over, expected) => {
    expect(decide2pDeath({ ...base, ...over })).toEqual(expected);
  });
  it('team pending (REF-12)', () => {
    const p = (result?: 'B' | 'F', lives = 1, left = false) => ({ result, lives, left });
    expect(decideTeamPending([p(), p('B')])).toBe('other_wins');
    expect(decideTeamPending([p('F'), p(undefined, 0), p(undefined, 1, true)])).toBe('draw');
    expect(decideTeamPending([p('F'), p()])).toBe('pending');
    expect(decideTeamPending([])).toBe('draw');
  });
  it('blind keys', () => {
    expect(blindKeyAnte('3:Small')).toBe(3);
    expect(blindKeyAnte('x:Big')).toBe(0);
    expect(blindKeySlot('3:Boss')).toBe('Boss');
    expect(blindKeySlot('3')).toBe('');
  });
});

describe('places (REF-11)', () => {
  type R = Record<Id, Record<string, 'B' | 'F'>>;
  const info = (alive: Id[], left: Id[], results: R) => ({
    aliveAndPresent: (id: Id) => alive.includes(id),
    left: (id: Id) => left.includes(id),
    result: (id: Id, key: string) => results[id]?.[key],
  });
  it('survivor who beat the blind is 1st; the pending dead 2nd; an earlier-out player 3rd', () => {
    const pending = [{ playerId: 'b', blindKey: '3:Small', outBefore: ['c'] }];
    const places = computePlaces(
      ['a', 'b', 'c'],
      pending,
      info(['a'], [], { a: { '3:Small': 'B' } }),
    );
    expect(places).toEqual({ a: 1, b: 2, c: 3 });
  });
  it('two players dying on the same blind share a place; the next place skips', () => {
    const pending = [
      { playerId: 'b', blindKey: '2:Big', outBefore: [] },
      { playerId: 'c', blindKey: '2:Big', outBefore: [] },
    ];
    const r = { b: { '2:Big': 'F' as const }, c: { '2:Big': 'F' as const } };
    const keys = placeKeys(['a', 'b', 'c', 'd'], pending, info(['a'], ['d'], r));
    expect(keys).toEqual({ a: 0, b: 3, c: 3, d: 5 });
    expect(computePlaces(['a', 'b', 'c', 'd'], pending, info(['a'], ['d'], r))).toEqual({
      a: 1,
      b: 2,
      c: 2,
      d: 4,
    });
  });
  it('everyone died on the blind → shared first (draw)', () => {
    const pending = [
      { playerId: 'a', blindKey: '1:Small', outBefore: [] },
      { playerId: 'b', blindKey: '1:Small', outBefore: [] },
    ];
    const r = { a: { '1:Small': 'F' as const }, b: { '1:Small': 'F' as const } };
    expect(computePlaces(['a', 'b'], pending, info([], [], r))).toEqual({ a: 1, b: 1 });
  });
  it('no pending: alive first, everyone else shares second', () => {
    expect(computePlaces(['a', 'b', 'c'], [], info(['b'], [], {}))).toEqual({ a: 2, b: 1, c: 2 });
  });
});
