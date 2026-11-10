/**
 * Checkpoints and host takeover (REF-19, NET-05 model): serialise/validate,
 * restore mid-lobby, mid-PvP, during a pending death and after the end;
 * never adopt another run's checkpoint; rebuild without a checkpoint.
 */
import { describe, expect, it } from 'vitest';
import {
  checkpointUsable,
  deserializeCheckpoint,
  newerCheckpoint,
  roundTripState,
  serializeCheckpoint,
} from '../checkpoint';
import { parseCheckpoint, refCreate, refRebuild, refStep, type RefState } from '../referee';
import { Sim, ids, makeMatch, msgs } from './helpers';

function takeover(sim: Sim, present: string[], at = sim.at + 2000) {
  const r = refStep(refCreate(sim.match), { t: 'restore', at, checkpoint: sim.cp, present });
  return r;
}

describe('checkpoint helpers', () => {
  it('serialise / deserialise round trip; garbage and wrong versions are rejected', () => {
    const sim = new Sim(makeMatch({ n: 3 }));
    sim.reset();
    const text = serializeCheckpoint(sim.cp);
    expect(deserializeCheckpoint(text)).toEqual(sim.cp);
    expect(deserializeCheckpoint('{')).toBeNull();
    expect(deserializeCheckpoint(JSON.stringify({ ...sim.cp, v: 2 }))).toBeNull();
    expect(parseCheckpoint({ nope: 1 })).toBeNull();
    expect(parseCheckpoint(sim.cp)).toEqual(sim.cp);
  });
  it('usable only for the same run and a recent enough seq; newer by seq', () => {
    const sim = new Sim(makeMatch({ n: 2 }));
    sim.reset();
    const a = sim.cp;
    sim.ev('p1', { t: 'ready_blind', starting_hands: 4 });
    const b = sim.cp;
    expect(checkpointUsable(a, sim.match)).toBe(true);
    expect(checkpointUsable(a, sim.match, a.seq + 1)).toBe(false);
    expect(checkpointUsable(null, sim.match)).toBe(false);
    expect(checkpointUsable(a, { ...sim.match, runId: 'other' })).toBe(false);
    expect(newerCheckpoint(a, b)).toBe(b);
    expect(newerCheckpoint(b, a)).toBe(b);
    expect(newerCheckpoint(null, a)).toBe(a);
    expect(newerCheckpoint(a, null)).toBe(a);
    expect(newerCheckpoint(a, { ...b, runId: 'r2' })?.runId).toBe('r2');
  });
  it('roundTripState reproduces the state', () => {
    const sim = new Sim(makeMatch({ n: 4, queueMode: 'pvp_royale' }));
    sim.reset();
    sim.presence('p2', 'away');
    expect(roundTripState(sim.state as RefState, ['p1', 'p3', 'p4'])).toEqual(sim.state);
  });
});

describe('restore (takeover)', () => {
  it('re-broadcasts lives and pairing to everyone and writes a fresh checkpoint', () => {
    const sim = new Sim(makeMatch({ n: 4 }));
    sim.reset();
    sim.fail('p2', 1);
    const r = takeover(sim, ids(4));
    expect(r.out.every((o) => o.to === '*')).toBe(true);
    expect(r.out.map((o) => o.msg.t)).toEqual([
      'nemesis_pairing',
      'player_lives',
      'player_lives',
      'player_lives',
      'player_lives',
    ]);
    expect(msgs(r.out, 'player_lives').find((m) => m.player_id === 'p2')?.lives).toBe(3);
    expect(r.checkpoint?.seq).toBe(sim.cp.seq + 1);
  });
  it('absent players become away (voters shrink) until grace forfeits them', () => {
    const sim = new Sim(makeMatch({ n: 3 }));
    sim.reset();
    const r = takeover(sim, ['p1', 'p2']);
    expect(r.state.away).toEqual(['p3']);
    const f = refStep(r.state, {
      t: 'presence',
      at: sim.at + 5000,
      id: 'p3',
      status: 'grace_expired',
    });
    expect(msgs(f.out, 'eliminated')).toEqual([{ t: 'eliminated', player_id: 'p3' }]);
  });
  it('mid-PvP: the round continues and resolves on the new host', () => {
    const sim = new Sim(makeMatch({ n: 2 }));
    sim.reset();
    sim.readyAll(['p1', 'p2']);
    sim.hand('p1', '500', 0);
    const r = takeover(sim, ['p1', 'p2']);
    expect(r.out.some((o) => o.msg.t === 'end_pvp')).toBe(false);
    const next = refStep(r.state, {
      t: 'event',
      at: sim.at + 3000,
      from: 'p2',
      e: { t: 'play_hand', score: '1', hands_left: 0, skips: 0 },
    });
    expect(msgs(next.out, 'end_pvp')).toEqual([
      { t: 'end_pvp', loser_id: 'p2', pvp_timer_lost: false },
    ]);
  });
  it('mid-PvP: a round that became resolvable (the leaver was the old host) resolves at once', () => {
    const sim = new Sim(makeMatch({ n: 3, queueMode: 'pvp_royale' }));
    sim.reset();
    sim.readyAll(ids(3));
    sim.hand('p2', '10', 0);
    sim.hand('p3', '20', 0);
    // p1 (old host) is gone: forfeited by the hub's grace on the new host.
    const r = takeover(sim, ['p2', 'p3']);
    const f = refStep(r.state, { t: 'presence', at: sim.at + 9000, id: 'p1', status: 'left' });
    expect(msgs(f.out, 'end_pvp')).toHaveLength(1);
    expect(f.state.cp.players.p2?.lives).toBe(3);
  });
  it('during a pending death the pending notice is re-sent, and it still settles', () => {
    const sim = new Sim(makeMatch({ n: 2, options: { startingLives: 1 } }));
    sim.reset();
    sim.fail('p1', 2, 'Big');
    const r = takeover(sim, ['p1', 'p2']);
    expect(msgs(r.out, 'death_pending')).toEqual([
      { t: 'death_pending', player_id: 'p1', opponent_id: 'p2', blind_key: '2:Big' },
    ]);
    const w = refStep(r.state, {
      t: 'event',
      at: sim.at + 5000,
      from: 'p2',
      e: { t: 'blind_result', ante: 2, blind: 'Big', beaten: true },
    });
    expect(w.over).toEqual({ t: 'win', winner_id: 'p2' });
  });
  it('team pending notice is re-sent too', () => {
    const sim = new Sim(makeMatch({ n: 3, queueMode: 'pvp_manhunt' }));
    sim.reset();
    sim.fail('p1', 2);
    const r = takeover(sim, ids(3));
    expect(msgs(r.out, 'death_pending')).toEqual([
      { t: 'death_pending', team_id: 'RUNNER', blind_key: '2:Small' },
    ]);
    expect(msgs(r.out, 'team_roster')).toHaveLength(1);
  });
  it('a pending death whose opponent left while the host was down settles on restore', () => {
    const sim = new Sim(
      makeMatch({ n: 3, queueMode: 'pvp_royale', options: { startingLives: 1 } }),
    );
    sim.reset();
    sim.fail('p1', 2);
    sim.beat('p2', 2);
    sim.ev('p3', { t: 'set_ante', ante: 3 });
    // Everyone alive has reported, but the old host died before p3's report was processed? No: rebuild
    // a checkpoint where the last alive survivor already progressed and one player left.
    const cp = structuredClone(sim.cp);
    (cp.players.p2 as { forfeited: 0 | 1 }).forfeited = 1;
    (cp.players.p2 as { lives: number }).lives = 0;
    const r = refStep(refCreate(sim.match), {
      t: 'restore',
      at: sim.at + 1000,
      checkpoint: cp,
      present: ['p3'],
    });
    expect(r.over?.t).toBe('win');
    expect(r.over).toMatchObject({ winner_id: 'p3' });
  });
  it('after the end: the result is re-sent and the re-send schedule continues', () => {
    const sim = new Sim(makeMatch({ n: 2, options: { startingLives: 1 } }));
    sim.reset();
    sim.pvpRound({ p1: '2', p2: '1' });
    const r = takeover(sim, ['p1', 'p2']);
    expect(r.out.at(-1)?.msg).toEqual({ t: 'win', winner_id: 'p1' });
    expect(r.over).toEqual({ t: 'win', winner_id: 'p1' });
    expect(r.wakeAt).toBe((sim.cp.winSentAt[0] as number) + 3000);
  });
  it('never adopts a checkpoint from another run', () => {
    const sim = new Sim(makeMatch({ n: 2, runId: 'old' }));
    sim.reset();
    sim.fail('p1', 1);
    const other = makeMatch({ n: 2, runId: 'new' });
    const base = refCreate(other);
    const r = refStep(base, { t: 'restore', at: 1, checkpoint: sim.cp, present: ['p1', 'p2'] });
    expect(r.out).toEqual([]);
    expect(r.checkpoint).toBeNull();
    expect(r.state.cp.runId).toBe('new');
    expect(r.state.cp.players.p1?.lives).toBe(4);
  });
  it('restore needs a base state', () => {
    const sim = new Sim(makeMatch({ n: 2 }));
    sim.reset();
    expect(() => refStep(null, { t: 'restore', at: 1, checkpoint: sim.cp, present: [] })).toThrow();
  });
  it('refCreate is idle: no outputs, seq 0', () => {
    const s = refCreate(makeMatch({ n: 5, queueMode: 'pvp_teams' }));
    expect(s.cp.seq).toBe(0);
    expect(s.cp.teamLives).toEqual({ A: 4, B: 4 });
  });
});

describe('refRebuild (no checkpoint)', () => {
  it('rebuilds lives, antes, forfeits, results and pending from the cache, then restores', () => {
    const match = makeMatch({ n: 4, options: { startingLives: 3 } });
    const cp = refRebuild(match, {
      at: 5,
      rngSeed: 9,
      lives: { p1: 2, p2: 0, p3: 3, p4: 999 },
      ante: { p1: 3, p3: 3, p4: -1 },
      forfeited: ['p4'],
      eliminated: ['p4', 'ghost'],
      blindResults: { '3:Small': { p1: 'B' } },
      pending: [
        { playerId: 'p2', blindKey: '3:Small', outBefore: [] },
        { playerId: 'ghost', blindKey: '1:Small', outBefore: [] },
      ],
    });
    expect(cp.players.p1).toMatchObject({ lives: 2, ante: 3 });
    expect(cp.players.p4).toMatchObject({ lives: 100, forfeited: 1, hands: 0, ante: 0 });
    expect(cp.pending).toHaveLength(1);
    expect(cp.eliminated).toEqual(['p4']);
    expect(cp.pairingAnte).toBe(3);
    expect(Object.keys(cp.pairing).sort()).toEqual(['p1', 'p3']);
    const r = refStep(refCreate(match), {
      t: 'restore',
      at: 10,
      checkpoint: cp,
      present: ['p1', 'p3'],
    });
    expect(r.over).toBeNull();
    const w = refStep(r.state, {
      t: 'event',
      at: 20,
      from: 'p3',
      e: { t: 'blind_result', ante: 3, blind: 'Small', beaten: true },
    });
    expect(w.over).toBeNull(); // p1 and p3 both still alive
    const end = refStep(w.state, { t: 'event', at: 30, from: 'p1', e: { t: 'forfeit' } });
    expect(end.over).toMatchObject({
      t: 'win',
      winner_id: 'p3',
      places: { p3: 1, p1: 2, p2: 3, p4: 4 },
    });
  });
  it('keeps a given pairing; Teams pools mirror to members', () => {
    const teams = makeMatch({ n: 4, queueMode: 'pvp_teams' });
    const cp = refRebuild(teams, {
      at: 0,
      rngSeed: 1,
      lives: {},
      teamLives: { A: 2, B: 1 },
      teamPending: { team: 'B', blindKey: '2:Big' },
    });
    expect(cp.teamLives).toEqual({ A: 2, B: 1 });
    expect(cp.players.p1?.lives).toBe(2);
    expect(cp.players.p2?.lives).toBe(1);
    expect(cp.teamPending).toEqual({ team: 'B', blindKey: '2:Big' });
    expect(Object.keys(cp.teamCardTargets)).toHaveLength(4);
    const nem = makeMatch({ n: 2 });
    const cp2 = refRebuild(nem, {
      at: 0,
      rngSeed: 1,
      lives: { p1: 1 },
      pairing: { pairing: { p1: 'p2', p2: 'p1' }, ante: 4 },
    });
    expect(cp2.pairingAnte).toBe(4);
    expect(cp2.players.p2?.lives).toBe(4);
  });
});
