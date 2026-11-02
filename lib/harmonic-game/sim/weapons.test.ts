import { describe, expect, it } from 'vitest';
import { IN_ATTACK, IN_ATTACK2, IN_RELOAD } from '../../tf2-game/core/constants';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { harmonicSounds, type HarmonicSoundEvent } from '../audio/events';
import { readHudState } from '../client/hud-state';
import { compileLevel } from '../compiler';
import { devWeaponsSource } from '../levels/dev_weapons';
import { attachHarmonicSim, spreadOffset, WEAPONS, RESERVE_MAX, AMMO_PICKUP_AMOUNT, type WeaponEvent } from './index';
import type { HarmonicTarget } from './entities';

async function load() {
  const level = compileLevel(devWeaponsSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({ game: 'hl2', mapName: 'dev_weapons', bsp: level.bsp, assets: createHarmonicAssets() });
  const sim = attachHarmonicSim(world);
  const events: WeaponEvent[] = [];
  sim.weapons.on((e) => events.push(e));
  const sounds: HarmonicSoundEvent[] = [];
  const off = harmonicSounds.on((e) => sounds.push(e));
  const d = new Driver(world);
  d.idle(0.2);
  const target = (n: string) => world.findByName(n) as unknown as HarmonicTarget;
  const lookAt = (n: string) => {
    const t = target(n);
    d.look({ x: t.origin.x, y: t.origin.y, z: t.origin.z + 32 });
  };
  const hold = (btn: number, secs: number) => {
    d.cmd.buttons |= btn;
    d.run(secs);
    d.cmd.buttons &= ~btn;
  };
  /** Teleports next to the firing line and gives the draw time to pass. */
  const arm = (id: 'prybar' | 'pulse' | 'coil', reserve = 60) => {
    sim.weapons.give(id, reserve);
    sim.weapons.select(WEAPONS[id].slot);
    d.idle(0.7);
  };
  const dispose = () => off();
  return { world, sim, d, events, sounds, target, lookAt, hold, arm, dispose };
}

describe('Harmonic weapons (H1.3)', () => {
  it('starts with nothing: attack does nothing and the HUD has no weapon', async () => {
    const { sim, d, target, lookAt, world } = await load();
    lookAt('t_a');
    d.press(IN_ATTACK);
    expect(target('t_a').health).toBe(60);
    expect(sim.weapons.hud()).toBeUndefined();
    expect(readHudState({ player: world.player }, sim).weapon).toBeUndefined();
  });

  it('walking over pickups collects weapons and ammo and removes the entities', async () => {
    const { sim, d, world, events, sounds } = await load();
    d.walkTo({ x: 320, y: 192, z: 0 }, { radius: 8 });
    d.walkTo({ x: 300, y: 100, z: 0 }, { radius: 8 });
    const s = sim.weapons.state;
    expect(s.owned).toEqual({ prybar: true, pulse: true, coil: true });
    expect(s.clip.pulse).toBe(12);
    expect(s.clip.coil).toBe(30);
    expect(s.active).toBe('prybar'); // the first thing picked up is equipped
    expect(s.reserve.pulse).toBe(WEAPONS.pulse.pickupReserve);
    expect(s.reserve.coil).toBe(WEAPONS.coil.pickupReserve + AMMO_PICKUP_AMOUNT.coil);
    expect(events.filter((e) => e.type === 'pickup')).toHaveLength(4);
    expect(sounds.some((e) => e.type === 'sfx' && e.sound === 'pickup')).toBe(true);
    let left = 0;
    world.forEachEntity((e) => {
      if (e.classname.startsWith('harmonic_weapon_') || e.classname.startsWith('harmonic_ammo_')) left++;
    });
    expect(left).toBe(1); // the pulse ammo box at (220, 100) was not walked over
  });

  it('refuses ammo when the pool is full', async () => {
    const { sim } = await load();
    expect(sim.weapons.addAmmo('pulse')).toBe(true);
    expect(sim.weapons.addAmmo('pulse')).toBe(true);
    expect(sim.weapons.addAmmo('pulse')).toBe(true);
    expect(sim.weapons.state.reserve.pulse).toBe(RESERVE_MAX.pulse);
    expect(sim.weapons.addAmmo('pulse')).toBe(false);
  });

  it('pulse: shot damage, semi-auto, fire interval and clip', async () => {
    const { sim, d, target, lookAt, arm, hold, sounds } = await load();
    arm('pulse');
    lookAt('t_a');
    d.press(IN_ATTACK);
    expect(target('t_a').health).toBe(60 - WEAPONS.pulse.damage);
    expect(sim.weapons.state.clip.pulse).toBe(11);
    expect(sounds.some((e) => e.type === 'sfx' && e.sound === 'pulse.fire')).toBe(true);
    // Holding does not repeat (semi-auto).
    d.idle(0.5);
    hold(IN_ATTACK, 1);
    expect(sim.weapons.state.clip.pulse).toBe(10);
    // Faster than the interval is refused.
    d.idle(0.5);
    d.press(IN_ATTACK);
    d.press(IN_ATTACK);
    expect(sim.weapons.state.clip.pulse).toBe(9);
  });

  it('coil: full-auto at its fire interval', async () => {
    const { sim, d, arm, hold } = await load();
    arm('coil');
    hold(IN_ATTACK, 1.0);
    const fired = 30 - sim.weapons.state.clip.coil;
    const expected = Math.ceil(1.0 / WEAPONS.coil.fireInterval);
    expect(Math.abs(fired - expected)).toBeLessThanOrEqual(1);
    d.idle(0.1);
  });

  it('empty click, auto reload, and reload timing moves rounds from reserve', async () => {
    const { sim, d, arm, hold, events, sounds } = await load();
    arm('pulse', 20);
    sim.weapons.state.clip.pulse = 0;
    d.press(IN_ATTACK); // empty click -> reload starts
    expect(sounds.some((e) => e.type === 'sfx' && e.sound === 'pulse.empty')).toBe(true);
    expect(sim.weapons.reloading).toBe(true);
    expect(sim.weapons.hud()).toMatchObject({ ammo: 0, reserve: 20, reloading: true });
    // Cannot fire while reloading.
    hold(IN_ATTACK, 0.3);
    expect(sim.weapons.state.clip.pulse).toBe(0);
    d.idle(WEAPONS.pulse.reloadTime - 0.5);
    expect(sim.weapons.reloading).toBe(true);
    d.idle(0.7);
    expect(sim.weapons.reloading).toBe(false);
    expect(sim.weapons.state.clip.pulse).toBe(12);
    expect(sim.weapons.state.reserve.pulse).toBe(8);
    expect(events.filter((e) => e.type === 'reloaded')).toHaveLength(1);
  });

  it('manual reload (R) tops up a partial clip with what the reserve has', async () => {
    const { sim, d, arm } = await load();
    arm('coil', 5);
    sim.weapons.state.clip.coil = 10;
    d.press(IN_RELOAD);
    expect(sim.weapons.reloading).toBe(true);
    d.idle(WEAPONS.coil.reloadTime + 0.1);
    expect(sim.weapons.state.clip.coil).toBe(15);
    expect(sim.weapons.state.reserve.coil).toBe(0);
    // Nothing left to reload with.
    d.press(IN_RELOAD);
    expect(sim.weapons.reloading).toBe(false);
  });

  it('switching: by slot, cancels a reload, honours the draw time, and builds the loadout context', async () => {
    const { sim, d, arm, events, target, lookAt } = await load();
    sim.weapons.give('prybar');
    arm('pulse');
    arm('coil');
    expect(sim.weapons.weaponContext()).toEqual({ slots: [1, 2, 3], active: 3, last: 2 });
    sim.weapons.state.clip.coil = 5;
    d.press(IN_RELOAD);
    expect(sim.weapons.reloading).toBe(true);
    d.cmd.weaponSelect = 2;
    d.tick();
    d.cmd.weaponSelect = 0;
    expect(sim.weapons.state.active).toBe('pulse');
    expect(sim.weapons.reloading).toBe(false);
    expect(events.filter((e) => e.type === 'draw').pop()).toMatchObject({ weapon: 'pulse' });
    // Drawing: no fire until the draw time has passed.
    lookAt('t_a');
    d.press(IN_ATTACK);
    expect(target('t_a').health).toBe(60);
    d.idle(WEAPONS.pulse.drawTime);
    d.press(IN_ATTACK);
    expect(target('t_a').health).toBe(60 - WEAPONS.pulse.damage);
    // A slot not owned does nothing; selecting the active one does nothing.
    expect(sim.weapons.select(9)).toBe(false);
    expect(sim.weapons.select(2)).toBe(false);
  });

  it('prybar pries the breakable panel open (and hurts targets in reach)', async () => {
    const { sim, d, world, arm } = await load();
    arm('prybar');
    world.teleportEntity(world.player, { x: 530, y: 192, z: 1 }, null, null);
    d.idle(0.3);
    d.look({ x: 568, y: 192, z: 80 });
    const panel = world.findByName('pry_panel')!;
    expect(panel.removed).toBe(false);
    d.press(IN_ATTACK);
    expect(panel.removed).toBe(false);
    d.idle(WEAPONS.prybar.fireInterval);
    d.press(IN_ATTACK);
    expect(panel.removed).toBe(true);
    expect(sim.weapons.state.clip.prybar).toBe(0);
    // The hall beyond is open: a far target is now reachable by a shot.
  });

  it('ADS: coil zooms to its FOV while attack2 is held, and a reload cancels it', async () => {
    const { sim, d, arm, events, d: driver } = await load();
    arm('coil');
    const zooms = () => driver.events.filter((e) => e.type === 'zoom') as { type: 'zoom'; fov: number }[];
    d.cmd.buttons |= IN_ATTACK2;
    d.run(0.1);
    expect(sim.weapons.ads).toBe(true);
    expect(sim.weapons.zoomFov).toBe(WEAPONS.coil.adsFov);
    expect(zooms().pop()?.fov).toBe(WEAPONS.coil.adsFov);
    sim.weapons.state.clip.coil = 20;
    d.press(IN_RELOAD);
    expect(sim.weapons.ads).toBe(false);
    expect(zooms().pop()?.fov).toBe(0);
    d.cmd.buttons &= ~IN_ATTACK2;
    d.idle(WEAPONS.coil.reloadTime + 0.1);
    d.cmd.buttons |= IN_ATTACK2;
    d.run(0.1);
    expect(sim.weapons.ads).toBe(true);
    d.cmd.buttons &= ~IN_ATTACK2;
    d.run(0.1);
    expect(sim.weapons.ads).toBe(false);
    expect(zooms().pop()?.fov).toBe(0);
    expect(events.filter((e) => e.type === 'ads').length).toBe(4);
    // The pulse pistol has no aim-down-sights.
    arm('pulse');
    d.cmd.buttons |= IN_ATTACK2;
    d.run(0.1);
    d.cmd.buttons &= ~IN_ATTACK2;
    expect(sim.weapons.ads).toBe(false);
  });

  it('spread is deterministic (a pure function of the shot index) and aimed fire is tighter', () => {
    const a = [0, 1, 2, 3, 4].map((i) => spreadOffset(i, 2.2));
    const b = [0, 1, 2, 3, 4].map((i) => spreadOffset(i, 2.2));
    expect(a).toEqual(b);
    expect(new Set(a.map((o) => o.x)).size).toBeGreaterThan(1);
    const max = Math.tan((2.2 * Math.PI) / 180);
    for (const o of a) expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(max + 1e-9);
    const tight = spreadOffset(3, 2.2 * WEAPONS.coil.adsSpreadScale);
    expect(Math.hypot(tight.x, tight.y)).toBeLessThanOrEqual(max * WEAPONS.coil.adsSpreadScale + 1e-9);
    expect(spreadOffset(3, 0)).toEqual({ x: 0, y: 0 });
  });

  it('two identical runs land the same shots', async () => {
    const run = async () => {
      const { sim, d, arm, hold, events } = await load();
      arm('coil');
      hold(IN_ATTACK, 0.5);
      d.idle(0.1);
      return events.flatMap((e) => (e.type === 'fire' ? [[e.hit.position.x, e.hit.position.y, e.hit.position.z]] : [])).concat([[sim.weapons.state.shots, 0, 0]]);
    };
    const first = await run();
    const second = await run();
    expect(first.length).toBeGreaterThan(3);
    expect(second).toEqual(first);
  });

  it('HUD weapon field mirrors the equipped weapon', async () => {
    const { sim, world, arm, d } = await load();
    arm('coil', 40);
    sim.weapons.state.clip.coil = 22;
    const hud = readHudState({ player: world.player }, sim);
    expect(hud.weapon).toEqual({ id: 'coil', ammo: 22, reserve: 40, reloading: false });
    d.press(IN_RELOAD);
    expect(readHudState({ player: world.player }, sim).weapon?.reloading).toBe(true);
  });

  it('view model: draw on equip, fire and reload activities, consumed once', async () => {
    const { sim, d, arm } = await load();
    arm('pulse');
    expect(sim.weapons.viewFrame()).toMatchObject({ mdl: 'models/harmonic/v_pulse_pistol.mdl', visible: true, play: ['ACT_VM_DRAW'] });
    expect(sim.weapons.viewFrame()?.play).toBeUndefined();
    d.press(IN_ATTACK);
    expect(sim.weapons.viewFrame()?.play).toEqual(['ACT_VM_PRIMARYATTACK']);
    d.idle(0.4);
    d.press(IN_RELOAD);
    expect(sim.weapons.viewFrame()?.play).toEqual(['ACT_VM_RELOAD']);
  });

  it('inventory follows the checkpoint: dying drops what was found after it', async () => {
    const { sim, d, world } = await load();
    // Checkpoint is the level start: empty. Find a weapon, then die.
    d.walkTo({ x: 230, y: 192, z: 0 }, { radius: 8 });
    expect(sim.weapons.state.owned.pulse).toBe(true);
    world.saveCheckpoint(); // a mid-level save keeps the pulse pistol...
    d.idle(0.1);
    sim.weapons.state.clip.pulse = 3;
    sim.combat.hurt(world.player, 500, 'phase');
    d.idle(4);
    expect(world.player.dead).toBe(false);
    expect(sim.weapons.state.owned.pulse).toBe(true);
    expect(sim.weapons.state.clip.pulse).toBe(12); // ...as it was at the save, not as it was at death
    expect(sim.weapons.state.active).toBe('prybar');
  });

  it('inventory follows the checkpoint: the level-start checkpoint restores an empty hand', async () => {
    const { sim, d, world } = await load();
    d.walkTo({ x: 150, y: 192, z: 0 }, { radius: 8 });
    expect(sim.weapons.state.owned.prybar).toBe(true);
    sim.combat.hurt(world.player, 500, 'phase');
    d.idle(4);
    expect(sim.weapons.state.owned.prybar).toBe(false);
    expect(sim.weapons.state.active).toBeNull();
    // ...and the pickup is back in the world, so it is found again.
    d.walkTo({ x: 150, y: 192, z: 0 }, { radius: 8 });
    expect(sim.weapons.state.owned.prybar).toBe(true);
  });
});
