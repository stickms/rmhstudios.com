import { describe, expect, it } from 'vitest';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { compileLevel } from '../compiler';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_LEVELS } from './index';
import { devBoxSource } from './dev_box';

async function load() {
  const level = compileLevel(devBoxSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({
    game: 'hl2',
    mapName: 'dev_box',
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  return { level, world, d: new Driver(world) };
}

describe('dev_box', () => {
  it('is registered and compiles with no unknown (magenta) material', () => {
    expect(HARMONIC_LEVELS.map((l) => l.id)).toContain('dev_box');
    const level = compileLevel(devBoxSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
    for (const m of level.materials.values()) expect(m.color).not.toEqual([1, 0, 1]);
    expect(level.stats.faces).toBeGreaterThan(50);
  });

  it('spawns the player on the ground', async () => {
    const { world, d } = await load();
    d.idle(1);
    expect(world.player.origin.z).toBeGreaterThan(-0.5);
    expect(world.player.origin.z).toBeLessThan(2);
    expect(world.player.health).toBe(100);
  });

  it('climbs the stairs to the mezzanine and the ramp reaches it too', async () => {
    const { world, d } = await load();
    d.idle(0.5);
    const path = d.findPath({ x: 672, y: 420, z: 96 });
    expect(path).not.toBeNull();
    d.followPath(path!);
    expect(world.player.origin.z).toBeCloseTo(96, 0);
    expect(world.player.origin.y).toBeGreaterThan(320);
  });

  it('opens the alcove door with +use and with the button', async () => {
    const { world, d } = await load();
    const door = world.findByName('alcove_door') as unknown as { isOpen(): boolean; state: number };
    expect(door).toBeTruthy();
    expect(door.isOpen()).toBe(false);
    // Stand in the hall facing the door, use it.
    world.teleportEntity(world.player, { x: 232, y: 80, z: 1 }, { x: 0, y: 180, z: 0 }, null);
    d.look({ x: 192, y: 80, z: 48 });
    d.idle(0.2);
    d.use();
    d.idle(0.5);
    expect(door.isOpen()).toBe(true);
    d.idle(8); // wait 4 s, then it closes again
    expect(door.isOpen()).toBe(false);
    // The button fires the door's Open input.
    world.findByName('alcove_button')!.acceptInput('Press', '', world.player, world.player);
    d.idle(0.5);
    expect(d.fired('alcove_door.open')).toBe(true);
    expect(door.isOpen()).toBe(true);
  });

  it('hurts and then respawns a player who falls into the pit', async () => {
    const { world, d } = await load();
    d.idle(0.5);
    world.teleportEntity(world.player, { x: 480, y: 144, z: 40 }, null, null);
    let minHealth = 100;
    for (let i = 0; i < 400 * 4 && !world.player.dead; i++) {
      d.tick();
      minHealth = Math.min(minHealth, world.player.health);
    }
    expect(minHealth).toBeLessThan(100);
    expect(world.player.origin.z).toBeLessThan(-40);
    // Death reloads the level-start checkpoint.
    d.idle(8);
    expect(world.player.dead).toBe(false);
    expect(world.player.health).toBe(100);
    expect(world.player.origin.z).toBeGreaterThan(-0.5);
  });

  it('wades into the pool (water contents) and every I/O target exists', async () => {
    const { level, world, d } = await load();
    world.teleportEntity(world.player, { x: 288, y: 112, z: 20 }, null, null);
    d.idle(1);
    expect(world.player.origin.z).toBeLessThan(16);

    const names = new Set<string>();
    for (const e of level.bsp.entities) {
      const n = e.get('targetname');
      if (n) names.add(n.toLowerCase());
    }
    let outputs = 0;
    for (const e of level.bsp.entities) {
      for (const [k, v] of e.props) {
        if (!/^On[A-Z]/.test(k)) continue;
        outputs++;
        const target = v.split(',')[0].toLowerCase();
        expect(names.has(target), `${e.classname}.${k} -> ${target}`).toBe(true);
      }
    }
    expect(outputs).toBeGreaterThan(0);
  });
});
