/**
 * The referee with N>2 starters — Nemesis rotation, Battle Royale, Small
 * World: REF-02, REF-04, REF-05, REF-08, REF-11, REF-13, REF-15, REF-23.
 */
import { describe, expect, it } from 'vitest';
import type { Id, QueueMode } from '../../types';
import { pairKey } from '../pairing';
import { Sim, expectWin, ids, lastOf, makeMatch, msgs } from './helpers';

function start(queueMode: QueueMode, n: number, options = {}) {
  const sim = new Sim(makeMatch({ queueMode, n, options }));
  sim.reset();
  return sim;
}
const alive = (sim: Sim) =>
  ids(sim.match.roster.length).filter((id) => sim.p(id).lives > 0 && sim.p(id).forfeited === 0);

describe('Nemesis rotation (REF-02, REF-04)', () => {
  it.each([3, 4, 5, 8, 16])(
    '%i players: ante-1 pairing at reset covers everyone, with byes on odd counts',
    (n) => {
      const sim = start('pvp_nemesis', n);
      const pairing = lastOf(sim.steps[0]?.out ?? [], 'nemesis_pairing');
      expect(pairing?.ante).toBe(1);
      expect(Object.keys(pairing?.pairing ?? {}).sort()).toEqual(ids(n).sort());
      expect(Object.values(pairing?.pairing ?? {}).filter((v) => v === '').length).toBe(n % 2);
      expect(sim.cp.lastBye === null).toBe(n % 2 === 0);
    },
  );

  it('recomputes once per ante, on the first alive set_ante above the last', () => {
    const sim = start('pvp_nemesis', 4);
    expect(sim.ev('p1', { t: 'set_ante', ante: 1 })).toEqual([]);
    const out = sim.ev('p3', { t: 'set_ante', ante: 2 });
    expect(msgs(out, 'nemesis_pairing')).toHaveLength(1);
    expect(sim.ev('p1', { t: 'set_ante', ante: 2 })).toEqual([]);
    expect(sim.cp.pairingAnte).toBe(2);
  });

  it.each([4, 6, 8])('%i players: no repeated duel for n−1 antes', (n) => {
    const sim = start('pvp_nemesis', n);
    const seen = new Set<string>();
    const record = (p: Record<Id, Id | ''>) => {
      for (const [a, b] of Object.entries(p)) {
        if (b && a < b) {
          expect(seen.has(pairKey(a, b))).toBe(false);
          seen.add(pairKey(a, b));
        }
      }
    };
    record(sim.cp.pairing);
    for (let ante = 2; ante <= n - 1; ante++) {
      sim.ev('p1', { t: 'set_ante', ante });
      record(sim.cp.pairing);
    }
    expect(seen.size).toBe((n * (n - 1)) / 2);
  });

  it('resolves per alive pair when every alive player is out of hands; one end_pvp per round', () => {
    const sim = start('pvp_nemesis', 4);
    const p = sim.cp.pairing;
    const [a, b] = ['p1', p.p1 as Id];
    const [c, d] = ids(4).filter((x) => x !== a && x !== b) as [Id, Id];
    sim.readyAll(ids(4));
    sim.hand(a, '100', 0);
    sim.hand(b, '50', 0);
    sim.hand(c, '7', 0);
    expect(sim.allMsgs().filter((m) => m.t === 'end_pvp')).toHaveLength(0);
    const out = sim.hand(d, '7', 0);
    expect(msgs(out, 'player_lives')).toEqual([
      { t: 'player_lives', player_id: b, lives: 3, lost: 1 },
    ]);
    expect(msgs(out, 'end_pvp')).toEqual([{ t: 'end_pvp', loser_id: '', pvp_timer_lost: false }]);
  });

  it('a bye costs nothing and is still part of the ready gate', () => {
    const sim = start('pvp_nemesis', 3);
    const bye = Object.entries(sim.cp.pairing).find(([, v]) => v === '')?.[0] as Id;
    const others = ids(3).filter((x) => x !== bye);
    expect(msgs(sim.readyAll(others), 'start_blind')).toHaveLength(0);
    expect(lastOf(sim.readyAll([bye]), 'start_blind')?.first_player).toBe('');
    sim.hand(others[0] as Id, '10', 0);
    sim.hand(others[1] as Id, '20', 0);
    const out = sim.hand(bye, '0', 0);
    expect(msgs(out, 'player_lives').map((m) => m.player_id)).toEqual([others[0]]);
  });

  it('a pair whose partner left is skipped', () => {
    const sim = start('pvp_nemesis', 4);
    const partner = sim.cp.pairing.p1 as Id;
    sim.readyAll(ids(4));
    sim.ev(partner, { t: 'forfeit' });
    for (const id of ids(4).filter((x) => x !== partner)) sim.hand(id, id === 'p1' ? '0' : '5', 0);
    expect(sim.p('p1').lives).toBe(4);
  });

  it('eliminated players get `eliminated` once, leave the pairing and never get start_blind again', () => {
    const sim = start('pvp_nemesis', 4, { startingLives: 1 });
    const loser = sim.cp.pairing.p1 as Id;
    const scores: Record<Id, string> = {};
    for (const id of ids(4)) scores[id] = id === loser ? '1' : '100';
    // p1 and its partner: partner loses; the other pair ties.
    const out = sim.pvpRound(scores);
    expect(msgs(out, 'eliminated')).toEqual([{ t: 'eliminated', player_id: loser }]);
    sim.ev('p1', { t: 'set_ante', ante: 2 });
    expect(Object.keys(sim.cp.pairing)).not.toContain(loser);
    const rest = alive(sim);
    const sb = lastOf(sim.readyAll(rest), 'start_blind');
    expect(Object.keys(sb?.starting_hands ?? {})).not.toContain(loser);
    // events from the eliminated player are ignored
    expect(sim.ev(loser, { t: 'ready_blind', starting_hands: 4 })).toEqual([]);
    expect(sim.allMsgs().filter((m) => m.t === 'eliminated')).toHaveLength(1);
  });
});

describe('Battle Royale rank-and-cut (REF-05, REF-08)', () => {
  it('A1 example [10,20,20,30,40] → the bottom three lose', () => {
    const sim = start('pvp_royale', 5);
    const out = sim.pvpRound({ p1: '10', p2: '20', p3: '20', p4: '30', p5: '40' });
    expect(msgs(out, 'player_lives').map((m) => m.player_id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('A1 example [10,40,40,40] → only 10 loses; all equal → nobody', () => {
    let sim = start('pvp_royale', 4);
    expect(
      msgs(sim.pvpRound({ p1: '10', p2: '40', p3: '40', p4: '40' }), 'player_lives').map(
        (m) => m.player_id,
      ),
    ).toEqual(['p1']);
    sim = start('pvp_royale', 4);
    expect(msgs(sim.pvpRound({ p1: '9', p2: '9', p3: '9', p4: '9' }), 'player_lives')).toEqual([]);
  });
  it('broadcasts fresh live targets at start and on every score update', () => {
    const sim = start('pvp_royale', 4);
    const out = sim.readyAll(ids(4));
    expect(msgs(out, 'royale_target')).toEqual([
      { t: 'royale_target', targets: { p1: '', p2: 'p1', p3: 'p2', p4: 'p3' } },
    ]);
    const upd = sim.hand('p4', '1', 2);
    expect(msgs(upd, 'royale_target')[0]?.targets).toEqual({
      p1: 'p2',
      p2: 'p3',
      p3: 'p4',
      p4: 'p3',
    });
  });
  it('Small World uses the Royale shape', () => {
    const sim = start('pvp_smallworld', 3);
    expect(sim.match.resolved.key).toBe('ruleset_mp_smallworld');
    expect(msgs(sim.steps[0]?.out ?? [], 'nemesis_pairing')).toHaveLength(0);
    const out = sim.pvpRound({ p1: '3', p2: '2', p3: '1' });
    expect(msgs(out, 'player_lives').map((m) => m.player_id)).toEqual(['p3']);
  });
  it('last player standing wins; simultaneous last eliminations draw', () => {
    let sim = start('pvp_royale', 3, { startingLives: 1 });
    sim.pvpRound({ p1: '1', p2: '9', p3: '9' });
    expect(sim.p('p1').lives).toBe(0);
    sim.pvpRound({ p2: '1', p3: '2' });
    expectWin(sim, { winner_id: 'p3' });

    sim = start('pvp_royale', 3, { startingLives: 1 });
    sim.ev('p3', { t: 'forfeit' });
    expect(msgs(sim.last.out, 'eliminated')).toEqual([{ t: 'eliminated', player_id: 'p3' }]);
    sim.ev('p2', { t: 'forfeit' });
    expectWin(sim, { winner_id: 'p1' });
  });
  it('two survivors tie: nobody loses; a later forfeit decides', () => {
    const sim = start('pvp_royale', 3, { startingLives: 1 });
    sim.readyAll(ids(3));
    sim.ev('p3', { t: 'forfeit' });
    sim.hand('p1', '5', 0);
    sim.hand('p2', '5', 0);
    expect(sim.last.over).toBeNull(); // tie between the two survivors: nobody loses
    sim.ev('p1', { t: 'forfeit' });
    expectWin(sim, { winner_id: 'p2' });
  });
  it('REF-23: a fail with lives left mid-PvP forces 0 hands so the round resolves', () => {
    const sim = start('pvp_royale', 3);
    sim.readyAll(ids(3));
    sim.hand('p1', '10', 0);
    sim.hand('p2', '20', 0);
    const out = sim.fail('p3', 2, 'Boss', 'fail_timer');
    expect(sim.p('p3').hands).toBe(0);
    expect(msgs(out, 'end_pvp')).toHaveLength(1);
  });
});

describe('N>2 pending deaths and places (REF-11)', () => {
  it('a survivor who beats the blind wins; places 1 / 2 / 3', () => {
    const sim = start('pvp_royale', 3, { startingLives: 1 });
    // p3 out by PvP first.
    sim.pvpRound({ p1: '9', p2: '9', p3: '1' });
    expect(msgs(sim.last.out, 'eliminated')).toEqual([{ t: 'eliminated', player_id: 'p3' }]);
    const out = sim.fail('p2', 3, 'Small');
    expect(msgs(out, 'death_pending')).toEqual([
      { t: 'death_pending', player_id: 'p2', blind_key: '3:Small' },
    ]);
    expect(sim.cp.pending[0]?.outBefore).toEqual(['p3']);
    expect(sim.last.over).toBeNull();
    sim.beat('p1', 3, 'Small');
    expectWin(sim, { winner_id: 'p1', places: { p1: 1, p2: 2, p3: 3 } });
  });
  it('the last two dying on the same blind share first place (draw)', () => {
    const sim = start('pvp_royale', 3, { startingLives: 1 });
    sim.pvpRound({ p1: '9', p2: '9', p3: '1' });
    sim.fail('p1', 3, 'Big');
    sim.fail('p2', 3, 'Big');
    expectWin(sim, { draw: true, places: { p1: 1, p2: 1, p3: 3 } });
  });
  it('survivors play on while others are alive; pending players are never `eliminated`', () => {
    const sim = start('pvp_nemesis', 4, { startingLives: 1 });
    sim.fail('p4', 2, 'Small');
    expect(sim.last.over).toBeNull();
    expect(sim.allMsgs().some((m) => m.t === 'eliminated')).toBe(false);
    // the pending player is not part of the ready gate
    sim.ev('p1', { t: 'set_ante', ante: 2 });
    const sb = lastOf(sim.readyAll(['p1', 'p2', 'p3']), 'start_blind');
    expect(Object.keys(sb?.starting_hands ?? {}).sort()).toEqual(['p1', 'p2', 'p3']);
  });
  it('the match waits until every alive player has a result for every pending blind', () => {
    const sim = start('pvp_royale', 3, { startingLives: 1 });
    sim.fail('p1', 2, 'Small');
    sim.ev('p2', { t: 'forfeit' }); // p2 left without a result
    expect(sim.last.over).toBeNull(); // p3 alive, no result yet
    sim.beat('p3', 2, 'Small');
    expectWin(sim, { winner_id: 'p3', places: { p3: 1, p1: 2, p2: 3 } });
  });
  it('a leave covered by a pending death is not a forfeit', () => {
    const sim = start('pvp_royale', 3, { startingLives: 1 });
    sim.fail('p1', 2, 'Small');
    const out = sim.ev('p1', { t: 'forfeit' });
    expect(msgs(out, 'player_lives')).toHaveLength(0);
    expect(sim.p('p1').forfeited).toBe(1);
    expect(sim.cp.pending).toHaveLength(1);
  });
});

describe('forfeit N>2 (REF-15)', () => {
  it.each(['before PvP', 'while ready', 'mid-PvP'])(
    '%s: lives 0, hands 0, eliminated, the round goes on',
    (phase) => {
      const sim = start('pvp_nemesis', 4);
      if (phase === 'while ready') sim.readyAll(['p1', 'p2', 'p3']);
      if (phase === 'mid-PvP') sim.readyAll(ids(4));
      const out = sim.ev('p4', { t: 'forfeit' });
      expect(out.map((o) => o.msg)).toEqual(
        expect.arrayContaining([
          { t: 'player_lives', player_id: 'p4', lives: 0 },
          { t: 'eliminated', player_id: 'p4' },
        ]),
      );
      if (phase === 'while ready') expect(msgs(out, 'start_blind')).toHaveLength(1);
      expect(sim.p('p4')).toMatchObject({ lives: 0, hands: 0, forfeited: 1 });
      expect(sim.last.over).toBeNull();
    },
  );
  it('the leaver was the last player with hands → the round resolves', () => {
    const sim = start('pvp_nemesis', 3);
    sim.readyAll(ids(3));
    sim.hand('p1', '1', 0);
    sim.hand('p2', '2', 0);
    expect(msgs(sim.ev('p3', { t: 'forfeit' }), 'end_pvp')).toHaveLength(1);
  });
  it('down to one player → win', () => {
    const sim = start('pvp_nemesis', 3);
    sim.ev('p1', { t: 'forfeit' });
    sim.presence('p2', 'grace_expired');
    expectWin(sim, { winner_id: 'p3' });
  });
});
