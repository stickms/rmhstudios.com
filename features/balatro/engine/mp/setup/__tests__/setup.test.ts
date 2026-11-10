/**
 * Casual setup votes (MM-03, MM-04) and the deck + stake Draft (MM-05):
 * phases and timing, early close, hidden votes, lottery distribution (χ²),
 * draft schedules, timeouts, and the pool/stake distribution (χ²).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng';
import { zSetupView } from '../../types';
import { chiSquare } from '../../referee/__tests__/helpers';
import {
  DRAFT_TIMING,
  MP_DECKS,
  VANILLA_DECKS,
  draftCandidates,
  draftSchedule,
  draftStep,
  openDraft,
  type DraftState,
} from '../draft';
import {
  RANDOM_VOTE,
  TRAP_OPTIONS,
  VOTE_TIMING,
  clampWindow,
  openVote,
  rollFrame,
  rollVote,
  rulesetVoteOptions,
  setupPlan,
  trapVoteApplies,
  voteChances,
  voteStep,
  type VoteState,
} from '../votes';

const T = 1_000_000;

function vote(voters = ['a', 'b', 'c'], windowMs?: number, rngState = 1): VoteState {
  return openVote({
    stepId: 's1',
    kind: 'ruleset_vote',
    options: rulesetVoteOptions(),
    voters,
    at: T,
    windowMs,
    rngState,
  });
}

describe('votes', () => {
  it('window defaults to 15 s and is clamped to 5–120 s', () => {
    expect(clampWindow(undefined)).toBe(15_000);
    expect(clampWindow(NaN)).toBe(15_000);
    expect(clampWindow(1)).toBe(5_000);
    expect(clampWindow(999_999)).toBe(120_000);
    expect(vote(['a'], 30_000).deadline).toBe(T + 30_000);
  });
  it('hides votes until close; shows voted / connected voters', () => {
    const r = voteStep(vote(), {
      t: 'cast',
      at: T + 100,
      from: 'a',
      option: 'ruleset_mp_balanced',
    });
    expect(zSetupView.safeParse(r.view).success).toBe(true);
    expect(r.view).toMatchObject({
      phase: 'voting',
      voted: 1,
      voters: 3,
      result: null,
      msLeft: 14_900,
    });
    expect(r.view.options.every((o) => o.count === undefined && o.chance === undefined)).toBe(true);
    expect(r.wakeAt).toBe(T + 15_000);
  });
  it('closes early when every connected voter has voted, then rolls 1.2 s and reveals 3 s', () => {
    let s = vote(['a', 'b', 'c']);
    s = voteStep(s, { t: 'cast', at: T + 1, from: 'a', option: 'ruleset_mp_vanilla' }).state;
    s = voteStep(s, { t: 'presence', at: T + 2, connected: ['a', 'b'] }).state;
    const r = voteStep(s, { t: 'cast', at: T + 500, from: 'b', option: 'ruleset_mp_vanilla' });
    expect(r.view.phase).toBe('rolling');
    expect(r.view.result).toBe('ruleset_mp_vanilla');
    expect(r.view.options.find((o) => o.id === 'ruleset_mp_vanilla')).toEqual({
      id: 'ruleset_mp_vanilla',
      count: 2,
      chance: 1,
    });
    expect(r.wakeAt).toBe(T + 500 + VOTE_TIMING.ROLL_MS);
    const rev = voteStep(r.state, { t: 'tick', at: T + 500 + 1200 });
    expect(rev.view.phase).toBe('reveal');
    expect(rev.wakeAt).toBe(T + 500 + 1200 + 3000);
    expect(rev.result).toBeNull();
    const done = voteStep(rev.state, { t: 'tick', at: T + 4700 });
    expect(done.view.phase).toBe('done');
    expect(done.result).toBe('ruleset_mp_vanilla');
    expect(done.wakeAt).toBeNull();
    expect(zSetupView.safeParse(done.view).success).toBe(true);
  });
  it('closes at the deadline; a late tick jumps straight through the phases', () => {
    const s = vote();
    const r = voteStep(s, { t: 'tick', at: T + 15_000 });
    expect(r.view.phase).toBe('rolling');
    expect(r.state.closedAt).toBe(T + 15_000);
    expect(voteStep(s, { t: 'tick', at: T + 60_000 }).result).not.toBeNull();
  });
  it('one vote per voter; non-voters, unknown options and late casts are ignored', () => {
    let s = vote(['a', 'b']);
    s = voteStep(s, { t: 'cast', at: T + 1, from: 'a', option: 'ruleset_mp_expanded' }).state;
    s = voteStep(s, { t: 'cast', at: T + 2, from: 'a', option: 'ruleset_mp_vanilla' }).state;
    s = voteStep(s, { t: 'cast', at: T + 3, from: 'z', option: 'ruleset_mp_vanilla' }).state;
    s = voteStep(s, { t: 'cast', at: T + 4, from: 'b', option: 'ruleset_mp_nope' }).state;
    expect(s.votes).toEqual({ a: 'ruleset_mp_expanded' });
    expect(
      voteStep(s, { t: 'cast', at: T + 15_000, from: 'b', option: 'ruleset_mp_vanilla' }).state
        .votes,
    ).toEqual({
      a: 'ruleset_mp_expanded',
    });
  });
  it('Random picks one of the options for the voter', () => {
    const s = voteStep(vote(['a', 'b']), {
      t: 'cast',
      at: T + 1,
      from: 'a',
      option: RANDOM_VOTE,
    }).state;
    expect(rulesetVoteOptions()).toContain(s.votes.a);
  });
  it('lottery chances: tickets per vote; uniform with no votes', () => {
    const opts = ['x', 'y'];
    expect(voteChances(opts, { a: 'x', b: 'x', c: 'y' })).toEqual({ x: 2 / 3, y: 1 / 3 });
    expect(voteChances(opts, {})).toEqual({ x: 0.5, y: 0.5 });
    expect(rollVote([], {}, new Rng(1))).toBeNull();
  });
  it('the roll follows the lottery (χ², 2 tickets vs 1)', () => {
    const rng = new Rng(31337);
    const counts = { x: 0, y: 0 };
    for (let i = 0; i < 30_000; i++)
      counts[rollVote(['x', 'y'], { a: 'x', b: 'x', c: 'y' }, rng) as 'x' | 'y']++;
    // df = 1, p = 0.001 ≈ 10.83
    expect(chiSquare([counts.x, counts.y], [20_000, 10_000])).toBeLessThan(10.83);
  });
  it('with no votes the roll is uniform over options (χ²)', () => {
    const rng = new Rng(4);
    const opts = rulesetVoteOptions();
    const counts = opts.map(() => 0);
    for (let i = 0; i < 40_000; i++) counts[opts.indexOf(rollVote(opts, {}, rng) as string)]++;
    expect(chiSquare(counts)).toBeLessThan(16.27); // df = 3
  });
  it('the 12 Hz roll lands on the result', () => {
    const s = voteStep(vote(['a']), {
      t: 'cast',
      at: T,
      from: 'a',
      option: 'ruleset_mp_balanced',
    }).state;
    const frames = new Set<string | null>();
    for (let t = 0; t < 1200; t += 1000 / 12) frames.add(rollFrame(s, T + t));
    expect(frames.size).toBeGreaterThan(1);
    expect(rollFrame(s, T + 1200)).toBe('ruleset_mp_balanced');
    expect(rollFrame(s, T + 1199)).toBe('ruleset_mp_balanced');
    expect(rollFrame(vote(), T)).toBeNull();
  });
  it('no connected voters closes at once', () => {
    const s = voteStep(vote(['a']), { t: 'presence', at: T + 1, connected: [] });
    expect(s.view.phase).toBe('rolling');
  });
  it('the trap vote and the step plan (D-32)', () => {
    expect([...TRAP_OPTIONS]).toEqual(['traps_on', 'traps_off']);
    expect(trapVoteApplies('ruleset_mp_balanced')).toBe(true);
    expect(trapVoteApplies('ruleset_mp_expanded')).toBe(true);
    expect(trapVoteApplies('ruleset_mp_vanilla')).toBe(false);
    expect(trapVoteApplies('ruleset_mp_majorleague')).toBe(false);
    expect(setupPlan('private', 'pvp_nemesis')).toEqual([]);
    expect(setupPlan('party', 'pvp_royale')).toEqual([]);
    expect(setupPlan('casual', 'pvp_nemesis')).toEqual(['ruleset_vote', 'trap_vote', 'draft']);
    expect(setupPlan('casual', 'pvp_smallworld')).toEqual(['draft']);
    expect(rulesetVoteOptions()).toEqual([
      'ruleset_mp_vanilla',
      'ruleset_mp_majorleague',
      'ruleset_mp_balanced',
      'ruleset_mp_expanded',
    ]);
  });
  it('voteStep is pure', () => {
    const s = vote();
    const snap = JSON.stringify(s);
    voteStep(s, { t: 'cast', at: T + 1, from: 'a', option: RANDOM_VOTE });
    voteStep(s, { t: 'tick', at: T + 99_999 });
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('draft', () => {
  const open = (
    players: string[],
    ruleset = 'ruleset_mp_balanced',
    rngState = 7,
    maxStake?: number,
  ) =>
    openDraft({
      stepId: 'd1',
      players,
      candidates: draftCandidates(ruleset),
      at: T,
      rngState,
      maxStake,
    });

  it('pool of 9 distinct decks; MP decks only on Expanded / Small World', () => {
    expect(draftCandidates('ruleset_mp_balanced')).toEqual([...VANILLA_DECKS]);
    expect(draftCandidates('ruleset_mp_expanded')).toEqual([...VANILLA_DECKS, ...MP_DECKS]);
    expect(draftCandidates('ruleset_mp_smallworld')).toHaveLength(23);
    const d = open(['a', 'b']);
    expect(d.tiles).toHaveLength(9);
    expect(new Set(d.tiles.map((t) => t.deck)).size).toBe(9);
    for (const t of d.tiles) {
      expect(VANILLA_DECKS as readonly string[]).toContain(t.deck);
      expect(t.stake >= 1 && t.stake <= 8).toBe(true);
    }
    expect(open(['a'], 'ruleset_mp_balanced', 7, 3).tiles.every((t) => t.stake <= 3)).toBe(true);
  });
  it('2 players: A bans 1, B bans 3, A bans 3, B picks 1 of 2', () => {
    const sched = draftSchedule(['a', 'b'], 9, new Rng(1));
    const first = sched[0]?.actor as string;
    const second = first === 'a' ? 'b' : 'a';
    expect(sched).toEqual([
      { actor: first, action: 'ban', count: 1 },
      { actor: second, action: 'ban', count: 3 },
      { actor: first, action: 'ban', count: 3 },
      { actor: second, action: 'pick', count: 1 },
    ]);
    const firsts = { a: 0, b: 0 };
    for (let i = 1; i <= 2000; i++)
      firsts[draftSchedule(['a', 'b'], 9, Rng.fromSeed(i))[0]?.actor as 'a']++;
    expect(chiSquare([firsts.a, firsts.b])).toBeLessThan(10.83);
  });
  it('N players: 8 single bans rotating in seat order; the survivor is the deck', () => {
    expect(draftSchedule(['a', 'b', 'c'], 9, new Rng(1)).map((t) => t.actor)).toEqual([
      'a',
      'b',
      'c',
      'a',
      'b',
      'c',
      'a',
      'b',
    ]);
    let s: DraftState = open(['a', 'b', 'c']);
    const order = ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b'];
    for (const [i, actor] of order.entries()) {
      const tile = s.tiles.find((t) => t.state === 'open')!;
      const r = draftStep(s, { t: 'choose', at: T + i, from: actor, key: tile.deck });
      s = r.state;
    }
    expect(s.phase).toBe('done');
    const survivor = s.tiles.find((t) => t.state === 'picked')!;
    expect(s.result).toEqual({ deck: survivor.deck, stake: survivor.stake });
    expect(s.tiles.filter((t) => t.state === 'banned')).toHaveLength(8);
  });
  it('a full 1v1 draft by hand; out-of-turn, unknown and repeated choices are ignored', () => {
    let s = open(['a', 'b']);
    const A = s.turns[0]?.actor as string;
    const B = A === 'a' ? 'b' : 'a';
    const openDeck = () => s.tiles.find((t) => t.state === 'open')!.deck;
    s = draftStep(s, { t: 'choose', at: T + 1, from: B, key: openDeck() }).state; // not B's turn
    expect(s.tiles.every((t) => t.state === 'open')).toBe(true);
    s = draftStep(s, { t: 'choose', at: T + 1, from: A, key: 'b_nope' }).state;
    const banned = openDeck();
    let r = draftStep(s, { t: 'choose', at: T + 2, from: A, key: banned });
    s = r.state;
    expect(r.view.draft).toMatchObject({ actor: B, action: 'ban', remaining: 3 });
    expect(r.view.msLeft).toBe(DRAFT_TIMING.TURN_MS);
    s = draftStep(s, { t: 'choose', at: T + 3, from: B, key: banned }).state; // already banned
    expect(s.turnIdx).toBe(1);
    for (const actor of [B, B, B, A, A, A])
      s = draftStep(s, { t: 'choose', at: T + 4, from: actor, key: openDeck() }).state;
    r = draftStep(s, { t: 'tick', at: T + 5 });
    expect(r.view.draft).toMatchObject({ actor: B, action: 'pick', remaining: 1 });
    expect(s.tiles.filter((t) => t.state === 'open')).toHaveLength(2);
    const pick = s.tiles.filter((t) => t.state === 'open')[1]!;
    r = draftStep(s, { t: 'choose', at: T + 6, from: B, key: pick.deck });
    expect(r.result).toEqual({ deck: pick.deck, stake: pick.stake });
    expect(r.view).toMatchObject({ phase: 'done', result: pick.deck });
    expect(r.view.draft?.actor).toBeNull();
    expect(r.wakeAt).toBeNull();
    expect(zSetupView.safeParse(r.view).success).toBe(true);
    expect(r.state.tiles.filter((t) => t.state === 'open')).toHaveLength(1);
  });
  it('30 s per turn; a timeout makes the remaining actions at random, turn by turn', () => {
    const s = open(['a', 'b']);
    const r1 = draftStep(s, { t: 'tick', at: T + 29_999 });
    expect(r1.state.turnIdx).toBe(0);
    expect(r1.wakeAt).toBe(T + 30_000);
    const r2 = draftStep(s, { t: 'tick', at: T + 30_000 });
    expect(r2.state.turnIdx).toBe(1);
    expect(r2.wakeAt).toBe(T + 60_000);
    const r3 = draftStep(r2.state, { t: 'tick', at: T + 10 * 30_000 });
    expect(r3.state.phase).toBe('done');
    expect(r3.result).not.toBeNull();
    // A timeout mid-turn completes only that turn's remainder.
    let p = open(['a', 'b']);
    const A = p.turns[0]?.actor as string;
    const B = A === 'a' ? 'b' : 'a';
    p = draftStep(p, { t: 'choose', at: T + 1, from: A, key: p.tiles[0]!.deck }).state;
    p = draftStep(p, { t: 'choose', at: T + 2, from: B, key: p.tiles[1]!.deck }).state;
    p = draftStep(p, { t: 'tick', at: T + 2 + 30_000 }).state;
    expect(p.turnIdx).toBe(2);
    expect(p.tiles.filter((t) => t.state === 'banned')).toHaveLength(4);
  });
  it('degenerate pools and seats', () => {
    const tiny = openDraft({
      stepId: 'd',
      players: ['a', 'b'],
      candidates: ['b_red', 'b_blue', 'b_red'],
      at: T,
      rngState: 1,
    });
    expect(tiny.tiles).toHaveLength(2);
    expect(tiny.turns).toEqual([{ actor: 'a', action: 'ban', count: 1 }]);
    const lone = openDraft({
      stepId: 'd',
      players: [],
      candidates: ['b_red', 'b_blue'],
      at: T,
      rngState: 1,
    });
    expect(lone.phase).toBe('done');
    const one = openDraft({
      stepId: 'd',
      players: ['a'],
      candidates: ['b_red'],
      at: T,
      rngState: 1,
    });
    expect(one.result).toEqual({ deck: 'b_red', stake: one.tiles[0]?.stake });
    const none = openDraft({ stepId: 'd', players: ['a'], candidates: [], at: T, rngState: 1 });
    expect(none.result).toBeNull();
  });
  it('the pool and stakes are uniform (χ²)', () => {
    const deckCounts = new Map<string, number>();
    const stakeCounts = new Array(8).fill(0);
    for (let i = 1; i <= 3000; i++) {
      for (const t of open(['a', 'b'], 'ruleset_mp_balanced', i).tiles) {
        deckCounts.set(t.deck, (deckCounts.get(t.deck) ?? 0) + 1);
        stakeCounts[t.stake - 1]++;
      }
    }
    expect(deckCounts.size).toBe(15);
    expect(chiSquare([...deckCounts.values()])).toBeLessThan(36.12); // df = 14
    expect(chiSquare(stakeCounts)).toBeLessThan(24.32); // df = 7
  });
  it('random timeout picks are uniform over the open tiles (χ²)', () => {
    const counts = new Map<number, number>();
    for (let i = 1; i <= 4000; i++) {
      const s = open(['a', 'b', 'c'], 'ruleset_mp_balanced', i);
      const r = draftStep(s, { t: 'tick', at: T + 30_000 });
      const idx = r.state.tiles.findIndex((t) => t.state === 'banned');
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    expect(chiSquare([...counts.values()])).toBeLessThan(26.12); // df = 8
  });
  it('draftStep is pure', () => {
    const s = open(['a', 'b']);
    const snap = JSON.stringify(s);
    draftStep(s, { t: 'tick', at: T + 999_999 });
    draftStep(s, { t: 'choose', at: T + 1, from: s.turns[0]!.actor, key: s.tiles[0]!.deck });
    expect(JSON.stringify(s)).toBe(snap);
  });
});
