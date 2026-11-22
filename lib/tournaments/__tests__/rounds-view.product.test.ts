import { describe, expect, it } from 'vitest';
import {
  groupRounds,
  matchStatus,
  parseBracketView,
  roundsView,
  viewerEntrantId,
  type RoundsMatch,
} from '../rounds-view';

const m = (over: Partial<RoundsMatch> & { id: string; round: number; slot: number }): RoundsMatch => ({
  entrantAId: null,
  entrantBId: null,
  winnerEntrantId: null,
  state: 'PENDING',
  bracket: 'W',
  disputed: false,
  claimedWinnerId: null,
  ...over,
});

// An 8-player single-elimination bracket, listed out of order on purpose.
const single: RoundsMatch[] = [
  m({ id: 'f', round: 3, slot: 0 }),
  m({ id: 's1', round: 2, slot: 1 }),
  m({ id: 's0', round: 2, slot: 0 }),
  m({ id: 'q1', round: 1, slot: 1, entrantAId: 'c', entrantBId: 'd', state: 'READY' }),
  m({ id: 'q0', round: 1, slot: 0, entrantAId: 'a', entrantBId: 'b', state: 'COMPLETE', winnerEntrantId: 'a' }),
  m({ id: 'q2', round: 1, slot: 2, entrantAId: 'e', entrantBId: null, state: 'BYE', winnerEntrantId: 'e' }),
  m({ id: 'q3', round: 1, slot: 3, entrantAId: 'g', entrantBId: 'h', state: 'READY' }),
];

describe('roundsView order and labels', () => {
  it('orders rounds ascending and matches by slot', () => {
    const [section] = roundsView(single, 'SINGLE_ELIM', null).sections;
    expect(section!.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(section!.rounds[0]!.matches.map((x) => x.id)).toEqual(['q0', 'q1', 'q2', 'q3']);
  });

  it('names single-elimination rounds from the end and numbers them', () => {
    const [section] = roundsView(single, 'SINGLE_ELIM', null).sections;
    expect(section!.rounds.map((r) => r.label.kind)).toEqual(['quarters', 'semis', 'final']);
    expect(section!.rounds.every((r) => r.numbered)).toBe(true);
  });

  it('uses plain round numbers further from the end, and Swiss and round robin labels', () => {
    const many = [1, 2, 3, 4].map((r) => m({ id: `r${r}`, round: r, slot: 0 }));
    const labels = roundsView(many, 'SINGLE_ELIM', null).sections[0]!.rounds.map((r) => r.label);
    expect(labels[0]).toEqual({ kind: 'round-n', n: 1 });
    expect(roundsView(many, 'SWISS', null).sections[0]!.rounds[3]!.label).toEqual({ kind: 'round-n', n: 4 });
    expect(roundsView(many, 'ROUND_ROBIN', null).sections[0]!.rounds[0]!.label).toEqual({ kind: 'matches' });
  });

  it('splits double elimination into winners, losers and final with their own labels', () => {
    const double = [
      m({ id: 'w1', round: 1, slot: 0, bracket: 'W' }),
      m({ id: 'w2', round: 2, slot: 0, bracket: 'W' }),
      m({ id: 'l1', round: 1, slot: 0, bracket: 'L' }),
      m({ id: 'l2', round: 2, slot: 0, bracket: 'L' }),
      m({ id: 'gf', round: 1, slot: 0, bracket: 'GF' }),
      m({ id: 'gr', round: 2, slot: 0, bracket: 'GR' }),
    ];
    const { sections } = roundsView(double, 'DOUBLE_ELIM', null);
    expect(sections.map((s) => s.id)).toEqual(['W', 'L', 'F']);
    expect(sections[0]!.rounds.map((r) => r.label)).toEqual([{ kind: 'round-n', n: 1 }, { kind: 'winners-final' }]);
    expect(sections[1]!.rounds.map((r) => r.label)).toEqual([
      { kind: 'losers-round', n: 1 },
      { kind: 'losers-round', n: 2 },
    ]);
    expect(sections[2]!.rounds.map((r) => r.label.kind)).toEqual(['grand-final', 'bracket-reset']);
    expect(sections.every((s) => s.rounds.every((r) => !r.numbered))).toBe(true);
  });

  it('leaves out a double-elimination section with no matches', () => {
    const only = [m({ id: 'w1', round: 1, slot: 0, bracket: 'W' })];
    expect(roundsView(only, 'DOUBLE_ELIM', null).sections.map((s) => s.id)).toEqual(['W']);
  });
});

describe('your matches', () => {
  it('is empty for a viewer who is not an entrant', () => {
    expect(roundsView(single, 'SINGLE_ELIM', null).yours).toEqual([]);
  });

  it('holds only the viewer matches, playable first, and keeps them in their round too', () => {
    const view = roundsView(single, 'SINGLE_ELIM', 'a');
    expect(view.yours.map((x) => x.id)).toEqual(['q0']);
    expect(view.sections[0]!.rounds[0]!.matches.some((x) => x.id === 'q0')).toBe(true);
    const c = roundsView(single, 'SINGLE_ELIM', 'c');
    expect(c.yours.map((x) => x.id)).toEqual(['q1']);
  });

  it('puts a match to play before a finished one', () => {
    const list = [
      m({ id: 'done', round: 1, slot: 0, entrantAId: 'a', entrantBId: 'b', state: 'COMPLETE', winnerEntrantId: 'a' }),
      m({ id: 'next', round: 2, slot: 0, entrantAId: 'a', entrantBId: 'c', state: 'READY' }),
    ];
    expect(roundsView(list, 'SINGLE_ELIM', 'a').yours.map((x) => x.id)).toEqual(['next', 'done']);
  });

  it('leaves a bye out of your matches', () => {
    expect(roundsView(single, 'SINGLE_ELIM', 'e').yours).toEqual([]);
  });

  it('finds the viewer entrant by user id', () => {
    const entrants = [
      { id: 'x', user: { id: 'u1' } },
      { id: 'y', user: null },
    ];
    expect(viewerEntrantId(entrants, 'u1')).toBe('x');
    expect(viewerEntrantId(entrants, 'u2')).toBeNull();
    expect(viewerEntrantId(entrants, null)).toBeNull();
  });
});

describe('status and the view choice', () => {
  it('names each state', () => {
    const base = { id: 'x', round: 1, slot: 0 };
    expect(matchStatus(m({ ...base, state: 'BYE' }))).toBe('bye');
    expect(matchStatus(m({ ...base, state: 'CANCELLED' }))).toBe('cancelled');
    expect(matchStatus(m({ ...base, state: 'COMPLETE' }))).toBe('done');
    expect(matchStatus(m({ ...base, state: 'READY', disputed: true }))).toBe('disputed');
    expect(matchStatus(m({ ...base, state: 'READY', claimedWinnerId: 'a' }))).toBe('waiting-result');
    expect(matchStatus(m({ ...base, state: 'LIVE' }))).toBe('live');
    expect(matchStatus(m({ ...base, state: 'READY' }))).toBe('ready');
    expect(matchStatus(m({ ...base, state: 'PENDING' }))).toBe('waiting');
  });

  it('accepts only the two view names', () => {
    expect(parseBracketView('rounds')).toBe('rounds');
    expect(parseBracketView('bracket')).toBe('bracket');
    expect(parseBracketView('tree')).toBeNull();
    expect(parseBracketView(undefined)).toBeNull();
  });

  it('groups by round without changing the input', () => {
    const input = [m({ id: 'b', round: 2, slot: 0 }), m({ id: 'a', round: 1, slot: 0 })];
    expect(groupRounds(input).map(([r]) => r)).toEqual([1, 2]);
    expect(input[0]!.id).toBe('b');
  });
});
