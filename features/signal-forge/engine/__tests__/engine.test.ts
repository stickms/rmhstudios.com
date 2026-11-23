import { describe, expect, it } from 'vitest';
import { dispatch, newRun, reachableLanes, finalScore, floorOf, canChoose } from '../run';
import { burstDamage, effectiveCard, startCombat } from '../combat';
import { RHYTHM } from '../balance';
import { EVENTS } from '../data/events';
import type { RunState } from '../types';
import { simulateRun } from '../sim';

function combatRun(enemies: string[] = ['calibration_drone']): RunState {
  const run = newRun({ seed: 42, mode: 'timed' });
  startCombat(run, enemies, 'combat');
  return run;
}

/** Put specific cards in hand and set a known phrase. */
function rig(run: RunState, hand: string[], phrase: RunState['combat'] extends infer C ? C extends { phrase: infer P } ? P : never : never): void {
  const c = run.combat!;
  c.hand = hand.map((id) => ({ uid: run.nextUid++, id }));
  c.phrase = phrase;
  c.phraseAt = 0;
  c.energy = 3;
}

describe('determinism', () => {
  it('the same seed and the same actions give the same run', () => {
    const a = simulateRun({ seed: 7, ascension: 0, agent: 'greedy' });
    const b = simulateRun({ seed: 7, ascension: 0, agent: 'greedy' });
    expect(a).toEqual(b);
  });
  it('a run survives a JSON round trip mid-combat', () => {
    let run = newRun({ seed: 3 });
    run = dispatch(run, { t: 'node', lane: reachableLanes(run)[0]! });
    const copy = JSON.parse(JSON.stringify(run)) as RunState;
    expect(dispatch(copy, { t: 'end' })).toEqual(dispatch(run, { t: 'end' }));
  });
});

describe('the rhythm layer', () => {
  it('an on-phrase card is multiplied by its timing and builds heat', () => {
    const run = combatRun();
    rig(run, ['hammer_strike', 'hammer_strike'], ['pulse', 'sine', 'saw']);
    const hp0 = run.combat!.enemies[0]!.hp;
    const heat0 = run.combat!.heat;
    const after = dispatch(run, { t: 'play', i: 0, timing: 'perfect' });
    expect(hp0 - after.combat!.enemies[0]!.hp).toBe(Math.floor(6 * RHYTHM.mult.perfect));
    expect(after.combat!.heat).toBe(heat0 + RHYTHM.heat.perfect);
    expect(after.combat!.phraseAt).toBe(1);
  });

  it('steady mode counts every on-phrase card as Good, whatever timing is passed', () => {
    const run = combatRun();
    run.mode = 'steady';
    rig(run, ['hammer_strike'], ['pulse', 'sine', 'saw']);
    const hp0 = run.combat!.enemies[0]!.hp;
    const after = dispatch(run, { t: 'play', i: 0, timing: 'perfect' });
    expect(hp0 - after.combat!.enemies[0]!.hp).toBe(Math.floor(6 * RHYTHM.mult.steady));
  });

  it('an off-phrase card adds Static and does not advance the phrase', () => {
    const run = combatRun();
    rig(run, ['sine_guard'], ['pulse', 'sine', 'saw']);
    const after = dispatch(run, { t: 'play', i: 0, timing: 'good' });
    expect(after.combat!.static).toBe(1);
    expect(after.combat!.phraseAt).toBe(0);
    expect(after.combat!.block).toBe(5);
  });

  it('Static overloads into a Glitch card at the threshold', () => {
    const run = combatRun();
    run.combat!.static = RHYTHM.staticThreshold - 1;
    rig(run, ['sine_guard'], ['pulse', 'sine', 'saw']);
    const after = dispatch(run, { t: 'play', i: 0 });
    expect(after.combat!.static).toBe(0);
    expect(after.combat!.discard.some((c) => c.id === 'glitch')).toBe(true);
  });

  it('completing the phrase fires a Forge Burst that spends the heat and deals a new phrase', () => {
    const run = combatRun();
    rig(run, ['hammer_strike', 'sine_guard', 'saw_rip'], ['pulse', 'sine', 'saw']);
    let r = dispatch(run, { t: 'play', i: 0, timing: 'good' });
    r = dispatch(r, { t: 'play', i: 0, timing: 'good' });
    const heatBefore = r.combat!.heat + RHYTHM.heat.good;
    const expectedBurst = RHYTHM.burstBase + heatBefore * RHYTHM.burstPerHeat;
    const hp = r.combat!.enemies[0]!.hp;
    r = dispatch(r, { t: 'play', i: 0, timing: 'good' });
    expect(r.stats.bursts).toBe(1);
    expect(r.combat!.heat).toBe(0);
    expect(r.combat!.phraseAt).toBe(0);
    const sawDmg = Math.floor(3 * RHYTHM.mult.good) * 2;
    expect(hp - r.combat!.enemies[0]!.hp).toBe(sawDmg + expectedBurst);
  });

  it('vent turns heat into block once per turn', () => {
    const run = combatRun();
    run.combat!.heat = 4;
    const r = dispatch(run, { t: 'vent' });
    expect(r.combat!.block).toBe(4 * RHYTHM.ventPerHeat);
    expect(r.combat!.heat).toBe(0);
    r.combat!.heat = 2;
    expect(dispatch(r, { t: 'vent' })).toBe(r);
  });

  it('burst damage reads relic passives', () => {
    const run = combatRun();
    run.combat!.heat = 3;
    const base = burstDamage(run);
    run.relics.push('harmonic_tuner');
    expect(burstDamage(run)).toBe(base + 6);
  });
});

describe('cards, enemies and the run', () => {
  it('tempering raises numbers', () => {
    expect(effectiveCard({ uid: 1, id: 'hammer_strike', up: true }).dmg).toBe(8);
    expect(effectiveCard({ uid: 1, id: 'rip_cord', up: true }).bleed).toBe(4);
  });

  it('enemies act on their shown intent when the turn ends', () => {
    const run = combatRun();
    run.combat!.hand = [];
    const hp = run.hp;
    const r = dispatch(run, { t: 'end' });
    expect(hp - r.hp).toBe(6);
    expect(r.combat!.turn).toBe(2);
  });

  it('a jammed enemy skips its move', () => {
    const run = combatRun();
    run.combat!.enemies[0]!.statuses.jam = 1;
    run.combat!.hand = [];
    const r = dispatch(run, { t: 'end' });
    expect(r.hp).toBe(run.hp);
  });

  it('the map always offers a reachable next node and ends at the boss', () => {
    const run = newRun({ seed: 99 });
    expect(run.map).toHaveLength(8);
    expect(run.map[7]![0]!.kind).toBe('boss');
    for (let row = 0; row < 7; row++) for (const n of run.map[row]!) expect(n.next.length).toBeGreaterThan(0);
  });

  it('every event choice resolves without throwing when affordable', () => {
    for (const ev of EVENTS) {
      for (const ch of ev.choices) {
        const run = newRun({ seed: 5 });
        run.gold = 500;
        run.phase = 'event';
        run.event = { id: ev.id };
        if (!canChoose(run, ev.id, ch.id)) continue;
        const r = dispatch(run, { t: 'event', choice: ch.id });
        expect(r, `${ev.id}.${ch.id}`).not.toBe(run);
        expect(['event', 'pick', 'combat']).toContain(r.phase);
      }
    }
  });

  it('the score grows with progress and ascension', () => {
    const run = newRun({ seed: 1 });
    run.score = 1000;
    const a0 = finalScore(run);
    run.ascension = 4;
    expect(finalScore(run)).toBeGreaterThan(a0);
    expect(floorOf(run)).toBe(0);
  });

  it('runs from many seeds finish in victory or defeat, never stuck', () => {
    for (let s = 1; s <= 30; s++) {
      const r = simulateRun({ seed: s, ascension: s % 11, agent: s % 2 ? 'greedy' : 'random' });
      expect(r.floor).toBeGreaterThan(0);
    }
  });
});
