import { describe, expect, it } from 'vitest';
import { IN_ATTACK } from '../../tf2-game/core/constants';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { compileLevel } from '../compiler';
import { devCombatSource } from '../levels/dev_combat';
import { attachHarmonicSim, type CombatEvent, DEBUG_PULSE_DAMAGE, DEBUG_PULSE_INTERVAL, MELEE_DAMAGE, MELEE_RANGE } from './index';
import type { HarmonicTarget } from './entities';

async function load(attach = true) {
  const level = compileLevel(devCombatSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({
    game: 'hl2',
    mapName: 'dev_combat',
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  const sim = attach ? attachHarmonicSim(world) : null;
  const events: CombatEvent[] = [];
  sim?.combat.on((e) => events.push(e));
  const d = new Driver(world);
  d.idle(0.5);
  const target = (name: string) => world.findByName(name) as unknown as HarmonicTarget;
  const lookAt = (name: string) => {
    const t = target(name);
    d.look({ x: t.origin.x, y: t.origin.y, z: t.origin.z + 32 });
  };
  const relayFires = () => d.inputs.filter((i) => i === 'range_relay.trigger').length;
  return { world, sim, d, events, target, lookAt, relayFires };
}

describe('Harmonic combat (H1.1)', () => {
  it('registers the range and its targets spawn with their health', async () => {
    const { target } = await load();
    expect(target('t_near').health).toBe(40);
    expect(target('t_mid').health).toBe(100);
  });

  it('a pulse shot hurts the target by the expected damage and fires OnHurt', async () => {
    const { d, target, lookAt, relayFires, events } = await load();
    lookAt('t_near');
    d.press(IN_ATTACK);
    expect(target('t_near').health).toBe(40 - DEBUG_PULSE_DAMAGE);
    expect(relayFires()).toBe(1);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ type: 'hit', damage: DEBUG_PULSE_DAMAGE, damageType: 'bullet', killed: false });
  });

  it('keeps firing at the fire interval, then OnDeath at zero (once)', async () => {
    const { d, target, lookAt, relayFires, events } = await load();
    lookAt('t_near');
    d.cmd.buttons |= IN_ATTACK;
    d.run(DEBUG_PULSE_INTERVAL * 6);
    d.cmd.buttons &= ~IN_ATTACK;
    const t = target('t_near');
    expect(t.health).toBe(0);
    expect(t.dead).toBe(true);
    // 40 hp at 12 per pulse: three OnHurt that leave it alive, a fourth that kills (OnHurt + OnDeath).
    expect(relayFires()).toBe(5);
    expect(events.filter((e) => e.type === 'kill')).toHaveLength(1);
    // A dead target is no longer solid: further shots reach what is behind it.
    expect(t.isSolid()).toBe(false);
  });

  it('does not fire faster than the interval', async () => {
    const { d, target, lookAt } = await load();
    lookAt('t_near');
    d.cmd.buttons |= IN_ATTACK;
    d.run(DEBUG_PULSE_INTERVAL * 0.9);
    d.cmd.buttons &= ~IN_ATTACK;
    expect(target('t_near').health).toBe(40 - DEBUG_PULSE_DAMAGE);
  });

  it('a shot blocked by a wall does no damage', async () => {
    const { d, target, lookAt, events } = await load();
    lookAt('t_behind');
    d.press(IN_ATTACK);
    expect(target('t_behind').health).toBe(40);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ type: 'hit', target: null, damage: 0 });
  });

  it('melee respects its range', async () => {
    const { world, sim, target } = await load();
    const t = target('t_near');
    const from = { x: t.origin.x - 40, y: t.origin.y, z: t.origin.z + 32 };
    const dir = { x: 1, y: 0, z: 0 };
    const hit = sim!.combat.melee(from, dir, MELEE_RANGE, MELEE_DAMAGE, world.player);
    expect(hit.kind).toBe('entity');
    expect(t.health).toBe(40 - MELEE_DAMAGE);
    const far = sim!.combat.melee({ ...from, x: t.origin.x - 120 }, dir, MELEE_RANGE, MELEE_DAMAGE, world.player);
    expect(far.kind).toBe('none');
    expect(t.health).toBe(40 - MELEE_DAMAGE);
  });

  it('player damage lowers health, and death returns the player to the checkpoint', async () => {
    const { world, sim, d, events } = await load();
    const start = { ...world.player.origin };
    const r = sim!.combat.hurt(world.player, 30, 'cold');
    expect(r.dealt).toBe(30);
    expect(world.player.health).toBe(70);
    expect(events).toContainEqual(expect.objectContaining({ type: 'playerHurt', amount: 30, damageType: 'cold', health: 70, dead: false }));
    world.teleportEntity(world.player, { x: 300, y: 300, z: 1 }, null, null);
    const k = sim!.combat.hurt(world.player, 500, 'phase');
    expect(k.killed).toBe(true);
    expect(world.player.dead).toBe(true);
    expect(events.some((e) => e.type === 'kill' && e.isPlayer)).toBe(true);
    // Dead players cannot fire.
    d.cmd.buttons |= IN_ATTACK;
    d.idle(4);
    d.cmd.buttons = 0;
    expect(world.player.dead).toBe(false);
    expect(world.player.health).toBe(100);
    expect(world.player.origin.x).toBeCloseTo(start.x, 0);
  });

  it('is inert when no hooks are set (no attach: attack does nothing)', async () => {
    const { world, d, target, lookAt } = await load(false);
    expect(world.hooks).toBeNull();
    lookAt('t_near');
    d.press(IN_ATTACK);
    expect(target('t_near').health).toBe(40);
  });
});
