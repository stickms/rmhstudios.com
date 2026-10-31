/**
 * Manhunt (REF-01, REF-06, REF-08, REF-12, REF-15), Teams (REF-01, REF-07,
 * REF-12, REF-15, D-05, D-13) and Practice (REF-24).
 */
import { describe, expect, it } from 'vitest';
import type { Team } from '../../types';
import { Sim, expectWin, ids, lastOf, makeMatch, msgs } from './helpers';

function manhunt(n: number, teams: (Team | undefined)[] = [], options = {}) {
  const sim = new Sim(makeMatch({ queueMode: 'pvp_manhunt', n, teams, options }));
  sim.reset();
  return sim;
}
function teams(n: number, picks: (Team | undefined)[] = [], options = {}) {
  const sim = new Sim(makeMatch({ queueMode: 'pvp_teams', n, teams: picks, options }));
  sim.reset();
  return sim;
}

describe('Manhunt', () => {
  it('reset: one Runner (first claimant) at 1 life, Hunters at manhunt_hunter_lives, roster', () => {
    const sim = new Sim(
      makeMatch({
        queueMode: 'pvp_manhunt',
        n: 4,
        teams: [undefined, 'RUNNER', 'RUNNER'],
        options: { manhuntHunterLives: 9 },
      }),
    );
    const out = sim.reset();
    expect(out.map((o) => o.msg)).toEqual([
      { t: 'player_lives', player_id: 'p1', lives: 9 },
      { t: 'player_lives', player_id: 'p2', lives: 1 },
      { t: 'player_lives', player_id: 'p3', lives: 9 },
      { t: 'player_lives', player_id: 'p4', lives: 9 },
      { t: 'team_roster', roster: { p1: 'HUNTER', p2: 'RUNNER', p3: 'HUNTER', p4: 'HUNTER' } },
    ]);
  });
  it('no claimant → the first player runs', () => {
    expect(manhunt(3).cp.players.p1?.team).toBe('RUNNER');
  });
  it('round: hunters below the Runner lose; a tie loses only when the Runner scored > 0', () => {
    const sim = manhunt(4);
    const out = sim.pvpRound({ p1: '100', p2: '50', p3: '100', p4: '200' });
    expect(msgs(out, 'player_lives').map((m) => [m.player_id, m.lives])).toEqual([
      ['p2', 6],
      ['p3', 6],
      ['p1', 0],
    ]);
    expectWin(sim, { winner_team_id: 'HUNTER' });
  });
  it('Runner at 0 with all hunters at 0: nobody loses', () => {
    const sim = manhunt(3);
    const out = sim.pvpRound({ p1: '0', p2: '0', p3: '0' });
    expect(msgs(out, 'player_lives')).toEqual([]);
    expect(lastOf(out, 'end_pvp')).toBeDefined();
  });
  it('manhunt_target: the top alive Hunter, re-sent on every score update', () => {
    const sim = manhunt(3);
    expect(msgs(sim.readyAll(ids(3)), 'manhunt_target')).toEqual([
      { t: 'manhunt_target', target_id: 'p2' },
    ]);
    expect(msgs(sim.hand('p3', '10', 1), 'manhunt_target')).toEqual([
      { t: 'manhunt_target', target_id: 'p3' },
    ]);
  });
  it('the Runner wins at ante 9', () => {
    const sim = manhunt(3);
    sim.ev('p2', { t: 'set_ante', ante: 9 });
    expect(sim.last.over).toBeNull();
    sim.ev('p1', { t: 'set_ante', ante: 8 });
    expect(sim.last.over).toBeNull();
    sim.ev('p1', { t: 'set_ante', ante: 9 });
    expectWin(sim, { winner_team_id: 'RUNNER' });
  });
  it('the Runner wins when every Hunter is out (PvP or forfeit); hunters are eliminated once', () => {
    const sim = manhunt(3, [], { manhuntHunterLives: 7 });
    sim.ev('p2', { t: 'forfeit' });
    expect(msgs(sim.last.out, 'eliminated')).toEqual([{ t: 'eliminated', player_id: 'p2' }]);
    expect(sim.last.over).toBeNull();
    sim.presence('p3', 'left');
    expectWin(sim, { winner_team_id: 'RUNNER' });
  });
  it('a Runner forfeit hands the Hunters the win', () => {
    const sim = manhunt(3);
    sim.ev('p1', { t: 'forfeit' });
    expectWin(sim, { winner_team_id: 'HUNTER' });
  });
  it('the Runner’s ante voucher gives every alive Hunter +1 life (REF-06)', () => {
    const sim = manhunt(3);
    sim.ev('p3', { t: 'forfeit' });
    const out = sim.ev('p1', { t: 'redeem_ante_voucher' });
    expect(out.map((o) => o.msg)).toEqual([{ t: 'player_lives', player_id: 'p2', lives: 8 }]);
    expect(sim.ev('p2', { t: 'redeem_ante_voucher' })).toEqual([]); // a Hunter's redemption grants nothing
  });
  it('Runner dies on a normal blind → team pending; a Hunter beating it wins for the Hunters', () => {
    const sim = manhunt(3);
    const out = sim.fail('p1', 2, 'Big');
    expect(lastOf(out, 'death_pending')).toEqual({
      t: 'death_pending',
      team_id: 'RUNNER',
      blind_key: '2:Big',
    });
    expect(sim.last.over).toBeNull();
    sim.ev('p2', { t: 'forfeit' }); // not a forfeit while pending: counts toward the draw
    expect(sim.last.over).toBeNull();
    sim.beat('p3', 2, 'Big');
    expectWin(sim, { winner_team_id: 'HUNTER' });
  });
  it('Runner pending: every Hunter failed / out / left → draw', () => {
    const sim = manhunt(3, [], { manhuntHunterLives: 7 });
    sim.fail('p1', 2, 'Small');
    sim.fail('p2', 2, 'Small');
    expect(sim.last.over).toBeNull();
    sim.presence('p3', 'left');
    expectWin(sim, { draw: true });
  });
  it('the last Hunter dying on a normal blind → the Runner must beat it', () => {
    const sim = manhunt(2, [], { manhuntHunterLives: 7 });
    for (let a = 1; a <= 7; a++) {
      sim.ev('p2', { t: 'new_round' });
      sim.fail('p2', a, 'Small');
    }
    expect(
      lastOf(
        sim.allMsgs().map((msg) => ({ to: '*', msg })),
        'death_pending',
      ),
    ).toEqual({
      t: 'death_pending',
      team_id: 'HUNTER',
      blind_key: '7:Small',
    });
    sim.beat('p1', 7, 'Small');
    expectWin(sim, { winner_team_id: 'RUNNER' });
  });
  it('a Hunter dying on a blind while others live is simply eliminated', () => {
    const sim = manhunt(3, [], { manhuntHunterLives: 7 });
    for (let a = 1; a <= 7; a++) {
      sim.ev('p3', { t: 'new_round' });
      sim.fail('p3', a);
    }
    expect(sim.allMsgs().filter((m) => m.t === 'eliminated')).toEqual([
      { t: 'eliminated', player_id: 'p3' },
    ]);
    expect(sim.cp.teamPending).toBeNull();
  });
});

describe('Teams', () => {
  it('reset: balanced teams, *all* lives, both pools, roster, ante-1 card targets', () => {
    const sim = new Sim(makeMatch({ queueMode: 'pvp_teams', n: 4, options: { startingLives: 3 } }));
    expect(sim.reset().map((o) => o.msg)).toEqual([
      { t: 'player_lives', player_id: '*all*', lives: 3 },
      { t: 'team_lives', team_id: 'A', lives: 3 },
      { t: 'team_lives', team_id: 'B', lives: 3 },
      { t: 'team_roster', roster: { p1: 'A', p2: 'B', p3: 'A', p4: 'B' } },
      { t: 'team_card_target', pairing: { p1: 'p2', p2: 'p1', p3: 'p4', p4: 'p3' } },
    ]);
  });
  it('card targets rotate every ante', () => {
    const sim = teams(4);
    const out = sim.ev('p2', { t: 'set_ante', ante: 2 });
    expect(out.map((o) => o.msg)).toEqual([
      { t: 'team_card_target', pairing: { p1: 'p4', p2: 'p3', p3: 'p2', p4: 'p1' } },
    ]);
  });
  it('round: summed scores; the lower team loses one shared life mirrored to every member', () => {
    const sim = teams(4);
    const out = sim.pvpRound({ p1: '100', p2: '30', p3: '1', p4: '60' });
    expect(msgs(out, 'team_score_board')).toContainEqual({
      t: 'team_score_board',
      team_scores: { A: '101', B: '90' },
    });
    expect(msgs(out, 'player_lives')).toEqual([
      { t: 'player_lives', player_id: 'p2', lives: 3, lost: 1 },
      { t: 'player_lives', player_id: 'p4', lives: 3, lost: 1 },
    ]);
    expect(msgs(out, 'team_lives')).toEqual([{ t: 'team_lives', team_id: 'B', lives: 3 }]);
    expect(sim.cp.teamLives).toEqual({ A: 4, B: 3 });
  });
  it('a team tie costs nothing; inf sums compare as doubles', () => {
    const sim = teams(4);
    expect(
      msgs(sim.pvpRound({ p1: '1e+308', p2: '1e+308', p3: '1e+308', p4: '1e+308' }), 'team_lives'),
    ).toEqual([]);
  });
  it('uneven teams (3v1) and a team losing its pool → the other team wins', () => {
    const sim = teams(4, ['A', 'A', 'A', 'B'], { startingLives: 1 });
    sim.pvpRound({ p1: '1', p2: '1', p3: '1', p4: '10' });
    expectWin(sim, { winner_team_id: 'B' });
  });
  it('D-05: two teammates failing in the same round each cost the pool a life', () => {
    const sim = teams(4);
    sim.fail('p1', 1);
    sim.fail('p3', 1);
    expect(sim.cp.teamLives.A).toBe(2);
    sim.fail('p1', 1, 'Big'); // p1's blocker is still set
    expect(sim.cp.teamLives.A).toBe(2);
  });
  it('the pool reaching 0 on a normal blind → team pending; the other side beating it wins', () => {
    const sim = teams(2, [], { startingLives: 1 });
    const out = sim.fail('p1', 3);
    expect(lastOf(out, 'death_pending')).toEqual({
      t: 'death_pending',
      team_id: 'A',
      blind_key: '3:Small',
    });
    sim.beat('p2', 3);
    expectWin(sim, { winner_team_id: 'B' });
  });
  it('team pending: the other team also dies on the blind → draw', () => {
    const sim = teams(4, [], { startingLives: 1 });
    sim.fail('p1', 3);
    sim.fail('p2', 3);
    expectWin(sim, { draw: true });
  });
  it('a forfeit is a loss only when no un-forfeited teammate remains', () => {
    const sim = teams(4);
    sim.ev('p1', { t: 'forfeit' });
    expect(sim.last.over).toBeNull();
    expect(sim.allMsgs().some((m) => m.t === 'eliminated')).toBe(false);
    sim.presence('p3', 'grace_expired');
    expectWin(sim, { winner_team_id: 'B' });
  });
  it('a forfeiter’s score no longer counts and the round still resolves', () => {
    const sim = teams(4);
    sim.readyAll(ids(4));
    sim.hand('p1', '100', 0);
    sim.ev('p1', { t: 'forfeit' });
    sim.hand('p2', '10', 0);
    sim.hand('p3', '5', 0);
    const out = sim.hand('p4', '10', 0);
    expect(msgs(out, 'team_score_board').at(-1)).toEqual({
      t: 'team_score_board',
      team_scores: { A: '5', B: '20' },
    });
    expect(sim.cp.teamLives.A).toBe(3);
  });
  it('rejoined resync includes roster, card targets and both pools', () => {
    const sim = teams(2);
    const kinds = sim.presence('p2', 'rejoined').map((o) => o.msg.t);
    expect(kinds).toEqual([
      'team_card_target',
      'team_roster',
      'player_lives',
      'player_lives',
      'team_lives',
      'team_lives',
    ]);
  });
  it('speedrun uses the card target', () => {
    const sim = teams(2);
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    expect(msgs(sim.ev('p2', { t: 'ready_blind', starting_hands: 4 }), 'speedrun')).toHaveLength(2);
  });
});

describe('Practice (REF-24)', () => {
  function practice() {
    const sim = new Sim(makeMatch({ queueMode: 'pvp_nemesis', n: 1, practice: true }));
    sim.reset();
    return sim;
  }
  it('no lives, no pairing at reset', () => {
    expect(practice().steps[0]?.out).toEqual([]);
  });
  it('ready starts the PvP at once; the round ends after the last hand', () => {
    const sim = practice();
    expect(lastOf(sim.readyAll(['p1']), 'start_blind')).toEqual({
      t: 'start_blind',
      first_player: 'p1',
      starting_hands: { p1: 4 },
    });
    expect(sim.hand('p1', '100', 2)).toEqual([]);
    expect(sim.hand('p1', '300', 0).map((o) => o.msg)).toEqual([
      { t: 'end_pvp', loser_id: '', pvp_timer_lost: false },
    ]);
  });
  it('normal blinds can never be failed; no draw vote; forfeit just marks', () => {
    const sim = practice();
    sim.fail('p1', 1);
    sim.fail('p1', 1, 'Big', 'fail_timer');
    expect(sim.p('p1').lives).toBe(4);
    expect(sim.allMsgs()).toEqual([]);
    expect(sim.ev('p1', { t: 'draw_vote' })).toEqual([]);
    sim.ev('p1', { t: 'forfeit' });
    expect(sim.last.over).toBeNull();
  });
  it('a seed vote by the lone player reseeds', () => {
    const sim = practice();
    expect(sim.ev('p1', { t: 'seed_vote' }).map((o) => o.msg.t)).toEqual([
      'vote_progress',
      'reseed',
    ]);
  });
});
