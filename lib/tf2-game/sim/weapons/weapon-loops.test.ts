/**
 * Weapon loops follow the replicated weapon state (C_TFMinigun::WeaponSoundUpdate,
 * C_TFFlameThrower::OnDataChanged): the player record's `weaponLoop` names the loop the active
 * weapon wants, it clears when firing stops, on a weapon switch and on death, and no loop ever
 * goes out as a start/stop event that could be lost.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_PYRO,
  TF_TEAM_RED,
} from '../../core/constants';
import type { SimEvent, SoundEvent } from '../events';
import { createNetRecord, NET_PLAYER } from '../net-schema';
import type { Player } from '../player';
import type { GameWorld } from '../world';
import {
  addPlayer,
  cmd,
  makeWorld,
  place,
  run,
  setRandomCritsEnabled,
  startRound,
  ticks,
} from './__fixtures__/world';

beforeAll(() => setRandomCritsEnabled(false));
afterAll(() => setRandomCritsEnabled(false));

const LOOPS = new Set([
  'Weapon_Minigun.Fire',
  'Weapon_Minigun.FireCrit',
  'Weapon_Minigun.Spin',
  'Weapon_Minigun.ClipEmpty',
  'Weapon_FlameThrower.FireLoop',
  'Weapon_FlameThrower.FireLoopCrit',
  'Weapon_FlameThrower.PilotLoop',
]);

function solo(cls: number): { world: GameWorld; p: Player } {
  const world = makeWorld();
  const p = addPlayer(world, 'p', TF_TEAM_RED, cls);
  startRound(world);
  run(world, 5);
  place(world, p, 0, 0, 0);
  run(world, ticks(1.1));
  world.drainEvents();
  return { world, p };
}

function recordLoop(p: Player): string {
  const rec = createNetRecord(NET_PLAYER);
  p.writeNet(rec);
  return rec.weaponLoop as string;
}

const loopEvents = (events: readonly SimEvent[]): SoundEvent[] =>
  events.filter((e): e is SoundEvent => e.type === 'sound' && LOOPS.has(e.name));

describe('weapon loops are replicated state, not events', () => {
  it('minigun: spin-up → fire loop while held, spin on attack2, nothing after release', () => {
    const { world, p } = solo(TF_CLASS_HEAVYWEAPONS);
    expect(recordLoop(p)).toBe('');
    run(world, ticks(1.2), () => cmd(p, IN_ATTACK));
    expect(recordLoop(p)).toBe('Weapon_Minigun.Fire');
    run(world, ticks(0.3), () => cmd(p, IN_ATTACK2));
    expect(recordLoop(p)).toBe('Weapon_Minigun.Spin');
    run(world, ticks(1.5));
    expect(recordLoop(p)).toBe('');
    const events = world.drainEvents();
    expect(loopEvents(events)).toEqual([]);
    // The wind-up and wind-down one-shots are still (predicted) events.
    const names = events.filter((e): e is SoundEvent => e.type === 'sound').map((e) => e.name);
    expect(names).toContain('Weapon_Minigun.WindUp');
    expect(names).toContain('Weapon_Minigun.WindDown');
  });

  it('minigun: death silences the loop', () => {
    const { world, p } = solo(TF_CLASS_HEAVYWEAPONS);
    run(world, ticks(1.2), () => cmd(p, IN_ATTACK));
    expect(recordLoop(p)).toBe('Weapon_Minigun.Fire');
    p.commitSuicide();
    expect(recordLoop(p)).toBe('');
  });

  it('flamethrower: fire loop while held, pilot light when idle, nothing on another weapon', () => {
    const { world, p } = solo(TF_CLASS_PYRO);
    expect(recordLoop(p)).toBe('Weapon_FlameThrower.PilotLoop');
    run(world, ticks(0.5), () => cmd(p, IN_ATTACK));
    expect(recordLoop(p)).toBe('Weapon_FlameThrower.FireLoop');
    run(world, ticks(0.5));
    expect(recordLoop(p)).toBe('Weapon_FlameThrower.PilotLoop');
    run(world, ticks(0.5), () => cmd(p, IN_ATTACK));
    run(world, 1, () => cmd(p, IN_ATTACK, 0, 0, 2)); // switch to the shotgun mid-flame
    run(world, ticks(1));
    expect(p.activeSlot).toBe(1);
    expect(recordLoop(p)).toBe('');
    expect(loopEvents(world.drainEvents())).toEqual([]);
  });
});
