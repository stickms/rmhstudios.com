/**
 * The referee in 1v1 (Nemesis, Royale and Small World with exactly 2
 * starters): REF-01, REF-03, REF-09, REF-10, REF-14…REF-22.
 */
import { describe, expect, it } from 'vitest';
import type { QueueMode } from '../../types';
import { REF_TIMING, refStep } from '../referee';
import { Sim, T0, expectWin, lastOf, makeMatch, msgs } from './helpers';

function start(queueMode: QueueMode = 'pvp_nemesis', options = {}) {
  const sim = new Sim(makeMatch({ queueMode, n: 2, options }));
  sim.reset();
  return sim;
}

describe('reset (REF-01)', () => {
  it('broadcasts *all* lives and the degenerate pairing for ante 1', () => {
    const sim = new Sim(makeMatch({ n: 2, options: { startingLives: 3 } }));
    const out = sim.reset();
    expect(out.map((o) => o.msg)).toEqual([
      { t: 'player_lives', player_id: '*all*', lives: 3 },
      { t: 'nemesis_pairing', pairing: { p1: 'p2', p2: 'p1' }, ante: 1 },
    ]);
    expect(out.every((o) => o.to === '*')).toBe(true);
    expect(sim.p('p1')).toMatchObject({ lives: 3, hands: 4, score: '0', ready: 0, blocker: 0 });
    expect(sim.last.checkpoint).not.toBeNull();
    expect(sim.last.checkpoint?.seq).toBe(1);
    expect(sim.last.wakeAt).toBeNull();
    expect(sim.last.over).toBeNull();
  });
  it.each<QueueMode>(['pvp_royale', 'pvp_smallworld'])('%s with 2 players behaves as 1v1', (q) => {
    const sim = start(q);
    expect(msgs(sim.steps[0]?.out ?? [], 'nemesis_pairing')).toHaveLength(1);
    sim.pvpRound({ p1: '100', p2: '50' });
    expect(lastOf(sim.last.out, 'end_pvp')).toEqual({
      t: 'end_pvp',
      loser_id: 'p2',
      pvp_timer_lost: false,
    });
  });
  it('requires a state for every input but reset', () => {
    expect(() => refStep(null, { t: 'tick', at: 0 })).toThrow(/needs a state/);
  });
  it('is pure: the input state is never mutated', () => {
    const sim = start();
    const frozen = JSON.stringify(sim.state);
    const before = sim.state;
    refStep(before, {
      t: 'event',
      at: T0 + 1,
      from: 'p1',
      e: { t: 'ready_blind', starting_hands: 4 },
    });
    refStep(before, { t: 'event', at: T0 + 1, from: 'p1', e: { t: 'forfeit' } });
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe('PvP round (REF-03)', () => {
  it('start_blind when both ready, with first player and starting hands (D-12)', () => {
    const sim = start();
    sim.ev('p2', { t: 'ready_blind', starting_hands: 5 });
    expect(sim.last.out).toEqual([]);
    sim.ev('p2', { t: 'unready_blind' });
    sim.ev('p2', { t: 'ready_blind', starting_hands: 5 });
    const out = sim.ev('p1', { t: 'ready_blind', starting_hands: 3 });
    expect(lastOf(out, 'start_blind')).toEqual({
      t: 'start_blind',
      first_player: 'p2',
      starting_hands: { p1: 3, p2: 5 },
    });
    expect(sim.p('p1')).toMatchObject({ ready: 0, hands: 3, score: '0' });
  });
  it('unready removes a player from the gate', () => {
    const sim = start();
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    sim.ev('p1', { t: 'unready_blind' });
    expect(msgs(sim.ev('p2', { t: 'ready_blind', starting_hands: 4 }), 'start_blind')).toHaveLength(
      0,
    );
  });
  it('higher score wins; the loser loses one life', () => {
    const sim = start();
    const out = sim.pvpRound({ p1: '1000', p2: '2000' });
    expect(msgs(out, 'player_lives')).toEqual([
      { t: 'player_lives', player_id: 'p1', lives: 3, lost: 1 },
    ]);
    expect(lastOf(out, 'end_pvp')).toEqual({ t: 'end_pvp', loser_id: 'p1', pvp_timer_lost: false });
  });
  it('a tie costs nothing', () => {
    const sim = start();
    const out = sim.pvpRound({ p1: '1e+20', p2: '100000000000000000000' });
    expect(msgs(out, 'player_lives')).toHaveLength(0);
    expect(lastOf(out, 'end_pvp')?.loser_id).toBe('');
  });
  it('ends early once the trailing player is out of hands', () => {
    const sim = start();
    sim.readyAll(['p1', 'p2']);
    sim.hand('p1', '500', 2);
    expect(msgs(sim.hand('p2', '100', 0), 'end_pvp')).toEqual([
      { t: 'end_pvp', loser_id: 'p2', pvp_timer_lost: false },
    ]);
  });
  it('does not end while the out-of-hands player is ahead', () => {
    const sim = start();
    sim.readyAll(['p1', 'p2']);
    sim.hand('p2', '900', 0);
    expect(msgs(sim.hand('p1', '100', 1), 'end_pvp')).toHaveLength(0);
    expect(msgs(sim.hand('p1', '901', 0), 'end_pvp')[0]?.loser_id).toBe('p2');
  });
  it.each([
    ['inf', '1e+308', 'p2'],
    ['inf', 'inf', ''],
    ['-inf', '0', 'p1'],
    ['0', '0', ''],
    ['inf', '-inf', 'p2'],
  ])('score %s vs %s → loser %s (§0.9)', (a, b, loser) => {
    const sim = start();
    const out = sim.pvpRound({ p1: a, p2: b });
    expect(lastOf(out, 'end_pvp')?.loser_id).toBe(loser);
  });
  it('the opponent at 0 lives after a PvP loss: win to the player with more lives', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.pvpRound({ p1: '1', p2: '2' });
    expectWin(sim, { winner_id: 'p2' });
    expect(msgs(sim.last.out, 'end_pvp')).toHaveLength(0);
  });
  it('play_hand outside a PvP round never resolves anything', () => {
    const sim = start();
    sim.hand('p1', '0', 0);
    expect(sim.hand('p2', '10', 0)).toEqual([]);
  });
  it('tracks highest score, skips and furthest blind; ignores claimed lives (REF-18)', () => {
    const sim = start();
    sim.readyAll(['p1', 'p2']);
    sim.ev('p1', { t: 'play_hand', score: '700', hands_left: 3, skips: 2, lives: 99 });
    sim.ev('p1', { t: 'skip', skips: 3, score: '0', hands_left: 4, lives: 50 });
    sim.ev('p1', { t: 'furthest_blind', value: 21 });
    expect(sim.p('p1')).toMatchObject({
      highest: '700',
      skips: 3,
      furthest: 21,
      lives: 4,
      played: 1,
    });
  });
  it('new rounds rearm the life blocker (REF-09)', () => {
    const sim = start();
    sim.fail('p1', 1);
    expect(sim.p('p1').lives).toBe(3);
    sim.fail('p1', 1, 'Big');
    expect(sim.p('p1').lives).toBe(3); // blocked: same round
    sim.ev('p1', { t: 'new_round' });
    sim.fail('p1', 1, 'Big');
    expect(sim.p('p1').lives).toBe(2);
  });
  it('a timer expiry and a blind failure in the same round cost one life', () => {
    const sim = start();
    sim.ev('p1', { t: 'new_round' });
    sim.fail('p1', 1, 'Small', 'fail_timer');
    sim.fail('p1', 1, 'Small');
    expect(sim.p('p1').lives).toBe(3);
  });
  it('a PvP loss after a failed blind in the same round is blocked', () => {
    const sim = start();
    sim.ev('p1', { t: 'new_round' });
    sim.fail('p1', 1, 'Small');
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    sim.ev('p2', { t: 'new_round' });
    sim.ev('p2', { t: 'ready_blind', starting_hands: 4 });
    sim.hand('p1', '1', 0);
    sim.hand('p2', '2', 0);
    expect(sim.p('p1').lives).toBe(3);
    expect(lastOf(sim.last.out, 'end_pvp')?.loser_id).toBe('p1');
  });
  it('death_on_round_loss off: a failed blind costs nothing (FL-14)', () => {
    const sim = start('pvp_nemesis', { deathOnRoundLoss: false });
    sim.fail('p1', 1);
    expect(sim.p('p1').lives).toBe(4);
    sim.fail('p1', 1, 'Big', 'fail_timer');
    expect(sim.p('p1').lives).toBe(3); // the timer always costs a life
  });
  it('end_pvp clears the ready/first flags for the next ante', () => {
    const sim = start();
    sim.pvpRound({ p1: '1', p2: '1' });
    expect(sim.p('p1')).toMatchObject({ ready: 0, first: 0 });
    expect(sim.p('p1').readyAt).toBeUndefined();
    const out = sim.readyAll(['p2', 'p1']);
    expect(lastOf(out, 'start_blind')?.first_player).toBe('p2');
  });
});

describe('PvP timer (REF-21)', () => {
  it('fail_pvp_timer costs one hand and re-checks resolution', () => {
    const sim = start();
    sim.readyAll(['p1', 'p2'], 2);
    sim.hand('p1', '500', 0);
    sim.hand('p2', '100', 2);
    let out = sim.ev('p2', { t: 'fail_pvp_timer' });
    expect(out.map((o) => o.msg)).toEqual([{ t: 'timer_hand_lost', player_id: 'p2' }]);
    expect(sim.p('p2').hands).toBe(1);
    out = sim.ev('p2', { t: 'fail_pvp_timer' });
    expect(msgs(out, 'end_pvp')).toEqual([{ t: 'end_pvp', loser_id: 'p2', pvp_timer_lost: true }]);
  });
  it('is ignored outside PvP and with no hands left', () => {
    const sim = start();
    expect(sim.ev('p1', { t: 'fail_pvp_timer' })).toEqual([]);
    sim.readyAll(['p1', 'p2'], 1);
    sim.hand('p1', '5', 0);
    expect(sim.ev('p1', { t: 'fail_pvp_timer' })).toEqual([]);
  });
  it('pvp_timer_lost is false when the loser lost on the scores', () => {
    const sim = start();
    sim.readyAll(['p1', 'p2'], 2);
    sim.hand('p2', '100', 1);
    sim.ev('p2', { t: 'fail_pvp_timer' }); // p2 at 0 hands, ahead: no trigger yet
    expect(msgs(sim.hand('p1', '50', 0), 'end_pvp')).toEqual([
      { t: 'end_pvp', loser_id: 'p1', pvp_timer_lost: false },
    ]);
  });
});

describe('pending death 1v1 (REF-10)', () => {
  it('opponent already beat the blind → opponent wins', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.beat('p2', 1);
    sim.fail('p1', 1);
    expectWin(sim, { winner_id: 'p2' });
  });
  it('pending, then the opponent beats it → opponent wins', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    const out = sim.fail('p1', 2, 'Big');
    expect(lastOf(out, 'death_pending')).toEqual({
      t: 'death_pending',
      player_id: 'p1',
      opponent_id: 'p2',
      blind_key: '2:Big',
    });
    expect(sim.last.over).toBeNull();
    sim.beat('p2', 2, 'Small');
    expect(sim.last.over).toBeNull();
    sim.beat('p2', 2, 'Big');
    expectWin(sim, { winner_id: 'p2' });
  });
  it('pending, then the opponent dies on the same blind → draw', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.fail('p1', 2, 'Big');
    sim.fail('p2', 2, 'Big');
    expectWin(sim, { draw: true });
  });
  it('pending, then the opponent fails it with lives left → opponent wins', () => {
    const sim = new Sim(makeMatch({ n: 2, options: { startingLives: 2 } }));
    sim.reset();
    sim.ev('p1', { t: 'new_round' });
    sim.fail('p1', 1);
    sim.ev('p1', { t: 'new_round' });
    sim.fail('p1', 2, 'Small'); // p1 → 0
    expect(sim.p('p1').lives).toBe(0);
    sim.fail('p2', 2, 'Small'); // p2 → 1
    expectWin(sim, { winner_id: 'p2' });
  });
  it('pending, then the opponent leaves → the dead player wins (not a forfeit win)', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.fail('p1', 3);
    sim.presence('p2', 'left');
    expectWin(sim, { winner_id: 'p1' });
    expect(sim.allMsgs().some((m) => m.t === 'player_won')).toBe(false);
  });
  it('the dead player leaving the pending screen is not a forfeit', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.fail('p1', 3);
    sim.ev('p1', { t: 'forfeit' });
    expect(sim.last.over).toBeNull();
    sim.beat('p2', 3);
    expectWin(sim, { winner_id: 'p2' });
  });
  it('an opponent who progresses past the blind counts as having beaten it', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.fail('p1', 2, 'Small', 'fail_timer');
    sim.ev('p2', { t: 'set_ante', ante: 3 });
    expectWin(sim, { winner_id: 'p2' });
  });
  it('D-06: a timer death keyed on the on-deck Boss resolves when the opponent readies for it', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.ev('p2', { t: 'set_ante', ante: 2 });
    sim.ev('p1', { t: 'set_ante', ante: 2 });
    sim.fail('p1', 2, 'Boss', 'fail_timer');
    expect(sim.last.over).toBeNull();
    sim.ev('p2', { t: 'ready_blind', starting_hands: 4 });
    expectWin(sim, { winner_id: 'p2' });
    expect(sim.allMsgs().some((m) => m.t === 'start_blind')).toBe(false);
  });
  it('a later "beaten" for a failed blind is ignored (failure is final)', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.fail('p2', 1, 'Big', 'fail_timer'); // p2 → 0 lives; pending on 1:Big
    sim.beat('p2', 1, 'Big');
    expect(sim.cp.blindResults['1:Big']?.p2).toBe('F');
  });
  it('no PvP starts while a death is pending', () => {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.fail('p1', 2, 'Small');
    sim.ev('p2', { t: 'ready_blind', starting_hands: 4 });
    expect(sim.allMsgs().some((m) => m.t === 'start_blind')).toBe(false);
  });
  it('D-07: a fail with no report sends nothing', () => {
    const sim = start();
    expect(sim.ev('p1', { t: 'new_round' })).toEqual([]);
    expect(sim.p('p1').lives).toBe(4);
  });
});

describe('forfeit at every phase (REF-15)', () => {
  const phases: [string, (s: Sim) => void][] = [
    ['right after reset', () => {}],
    ['while ready', (s) => s.ev('p1', { t: 'ready_blind', starting_hands: 4 })],
    [
      'mid-PvP',
      (s) => {
        s.readyAll(['p1', 'p2']);
        s.hand('p1', '10', 2);
      },
    ],
    ['after a PvP', (s) => s.pvpRound({ p1: '1', p2: '2' })],
    ['in a shop with lives lost', (s) => s.fail('p2', 2)],
  ];
  for (const [name, setup] of phases) {
    it.each(['p1', 'p2'])(`${name}: %s forfeits → the other wins with player_won`, (who) => {
      const sim = start();
      setup(sim);
      const out = sim.ev(who, { t: 'forfeit' });
      const other = who === 'p1' ? 'p2' : 'p1';
      expect(out.map((o) => o.msg)).toContainEqual({ t: 'player_won', player_id: other });
      expect(sim.last.over).toEqual({ t: 'player_won', player_id: other });
    });
  }
  it.each(['left', 'grace_expired', 'catchup_expired'] as const)(
    'presence %s is a forfeit',
    (status) => {
      const sim = start();
      sim.presence('p2', status);
      expect(sim.last.over).toEqual({ t: 'player_won', player_id: 'p1' });
    },
  );
  it('away/back are not forfeits', () => {
    const sim = start();
    sim.presence('p2', 'away');
    sim.presence('p2', 'back');
    expect(sim.last.over).toBeNull();
    expect(sim.state?.away).toEqual([]);
  });
});

describe('the end of the match (REF-14)', () => {
  function ended() {
    const sim = start('pvp_nemesis', { startingLives: 1 });
    sim.pvpRound({ p1: '5', p2: '1' });
    return sim;
  }
  it('re-sends the win at +3 s and +8 s, then stops', () => {
    const sim = ended();
    const t = sim.cp.winSentAt[0] as number;
    expect(sim.last.wakeAt).toBe(t + 3000);
    expect(sim.tick(t + 2999)).toEqual([]);
    expect(sim.tick(t + 3000).map((o) => o.msg)).toEqual([{ t: 'win', winner_id: 'p1' }]);
    expect(sim.last.wakeAt).toBe(t + 8000);
    expect(sim.tick(t + 8000)).toHaveLength(1);
    expect(sim.last.wakeAt).toBeNull();
    expect(sim.tick(t + 20000)).toEqual([]);
  });
  it('a late tick catches up both re-sends', () => {
    const sim = ended();
    const t = sim.cp.winSentAt[0] as number;
    expect(sim.tick(t + 9000)).toHaveLength(2);
  });
  it('answers result_request to the requester only, any time after', () => {
    const sim = ended();
    const out = sim.ev('p2', { t: 'result_request' });
    expect(out).toEqual([{ to: 'p2', msg: { t: 'win', winner_id: 'p1' } }]);
    expect(sim.last.checkpoint).toBeNull();
  });
  it('ignores every game event after the end', () => {
    const sim = ended();
    for (const e of [
      { t: 'ready_blind', starting_hands: 4 },
      { t: 'forfeit' },
      { t: 'fail_round' },
      { t: 'draw_vote' },
    ] as const)
      expect(sim.ev('p2', e)).toEqual([]);
    expect(sim.last.over).toEqual({ t: 'win', winner_id: 'p1' });
  });
  it('a rejoin after the end re-sends the result to that player', () => {
    const sim = ended();
    const out = sim.presence('p2', 'rejoined');
    expect(out.filter((o) => o.to === 'p2').map((o) => o.msg)).toContainEqual({
      t: 'win',
      winner_id: 'p1',
    });
  });
  it('result_request before the end does nothing', () => {
    const sim = start();
    expect(sim.ev('p1', { t: 'result_request' })).toEqual([]);
  });
});

describe('votes (REF-16, REF-17, D-11)', () => {
  it('seed vote: unanimous → reseed and a referee reset (lives back)', () => {
    const sim = start();
    sim.fail('p1', 1);
    expect(sim.ev('p1', { t: 'seed_vote' }).map((o) => o.msg)).toEqual([
      { t: 'vote_progress', kind: 'seed', k: 1, n: 2 },
    ]);
    expect(sim.last.wakeAt).toBe(sim.at + REF_TIMING.VOTE_EXPIRY_MS);
    expect(sim.ev('p1', { t: 'seed_vote' })).toEqual([]); // duplicate
    const out = sim.ev('p2', { t: 'seed_vote' });
    const reseed = lastOf(out, 'reseed');
    expect(reseed?.seed).toMatch(/^[A-Z0-9]{8}$/);
    expect(out.map((o) => o.msg.t)).toEqual([
      'vote_progress',
      'reseed',
      'player_lives',
      'nemesis_pairing',
    ]);
    expect(sim.p('p1').lives).toBe(4);
    expect(sim.state?.match.seed).toBe(reseed?.seed);
    expect(sim.cp.votes.seed).toEqual([]);
    expect(sim.cp.startedAt).toBe(sim.at);
    expect(sim.last.checkpoint?.seq).toBeGreaterThan(1);
  });
  it('seed vote is only open within 300 s of run start', () => {
    const sim = start();
    sim.at = T0 + REF_TIMING.SEED_VOTE_WINDOW_MS + 1;
    expect(sim.ev('p1', { t: 'seed_vote' }, 0)).toEqual([]);
  });
  it('draw vote: unanimous → win{draw}', () => {
    const sim = start();
    sim.ev('p2', { t: 'draw_vote' });
    sim.ev('p1', { t: 'draw_vote' });
    expectWin(sim, { draw: true });
  });
  it('votes expire 60 s after the last vote', () => {
    const sim = start();
    sim.ev('p1', { t: 'draw_vote' });
    const due = sim.last.wakeAt as number;
    expect(sim.tick(due - 1)).toEqual([]);
    expect(sim.tick(due).map((o) => o.msg)).toEqual([
      { t: 'vote_progress', kind: 'draw', k: 0, n: 2 },
    ]);
    expect(sim.cp.votes.draw).toEqual([]);
    sim.ev('p2', { t: 'draw_vote' });
    expect(sim.last.over).toBeNull();
  });
  it('voters are the present, alive players: an away player shrinks n and can complete a vote', () => {
    const sim = start();
    sim.ev('p1', { t: 'draw_vote' });
    const out = sim.presence('p2', 'away');
    expect(sim.last.over).toEqual({ t: 'win', draw: true });
    expect(msgs(out, 'win')).toHaveLength(1);
  });
  it('an away player cannot vote', () => {
    const sim = start();
    sim.presence('p2', 'away');
    expect(sim.ev('p2', { t: 'draw_vote' })).toEqual([]);
  });
});

describe('reconnect, speedrun, misc (REF-20, REF-22)', () => {
  it('rejoined clears readiness and re-sends pairing and every player’s lives to that player', () => {
    const sim = start();
    sim.fail('p2', 1);
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    const out = sim.presence('p1', 'rejoined');
    expect(out.every((o) => o.to === 'p1')).toBe(true);
    expect(out.map((o) => o.msg)).toEqual([
      { t: 'nemesis_pairing', pairing: { p1: 'p2', p2: 'p1' }, ante: 1 },
      { t: 'player_lives', player_id: 'p1', lives: 4 },
      { t: 'player_lives', player_id: 'p2', lives: 3 },
    ]);
    expect(sim.p('p1').ready).toBe(0);
  });
  it('rejoined mid-PvP keeps the round', () => {
    const sim = start();
    sim.readyAll(['p1', 'p2']);
    sim.presence('p1', 'rejoined');
    expect(sim.cp.lastOutcome?.t).toBe('start_blind');
  });
  it('speedrun: both get it when readying within 30 s of each other (D-18)', () => {
    const sim = start();
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    sim.at += 29_000;
    const out = sim.ev('p2', { t: 'ready_blind', starting_hands: 4 }, 0);
    expect(out.filter((o) => o.msg.t === 'speedrun')).toEqual([
      { to: 'p2', msg: { t: 'speedrun', player_id: 'p2' } },
      { to: 'p1', msg: { t: 'speedrun', player_id: 'p1' } },
    ]);
  });
  it('no speedrun past 30 s, and only once per cycle', () => {
    const sim = start();
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    sim.ev('p1', { t: 'unready_blind' });
    sim.at += 31_000;
    expect(msgs(sim.ev('p2', { t: 'ready_blind', starting_hands: 4 }, 0), 'speedrun')).toHaveLength(
      0,
    );
    expect(msgs(sim.ev('p1', { t: 'ready_blind', starting_hands: 4 }), 'speedrun')).toHaveLength(0);
  });
  it('events from unknown senders change nothing', () => {
    const sim = start();
    expect(sim.ev('ghost', { t: 'forfeit' })).toEqual([]);
    expect(sim.presence('ghost', 'left')).toEqual([]);
    expect(sim.last.checkpoint).toBeNull();
  });
  it('redeem_ante_voucher does nothing outside Manhunt', () => {
    const sim = start();
    expect(sim.ev('p1', { t: 'redeem_ante_voucher' })).toEqual([]);
  });
  it('set_ante records the ante and keeps the 1v1 pairing', () => {
    const sim = start();
    const out = sim.ev('p1', { t: 'set_ante', ante: 2 });
    expect(out.map((o) => o.msg)).toEqual([
      { t: 'nemesis_pairing', pairing: { p1: 'p2', p2: 'p1' }, ante: 2 },
    ]);
    expect(sim.ev('p2', { t: 'set_ante', ante: 2 })).toEqual([]);
    expect(sim.cp.usedPairs).toEqual([]);
  });
  it('checkpoint is null exactly when nothing persistent changed', () => {
    const sim = start();
    sim.ev('p1', { t: 'unready_blind' });
    expect(sim.last.checkpoint).toBeNull();
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    expect(sim.last.checkpoint).not.toBeNull();
    sim.presence('p1', 'away');
    expect(sim.last.checkpoint).toBeNull();
  });
});
