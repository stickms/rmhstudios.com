import { describe, expect, it } from 'vitest';
import { createEmptyAssets } from '../../sp-game/assets';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { compileLevel, room, stairs, v3 } from './index';

describe('compiled level in the single-player world', () => {
  it('spawns the player at info_player_start on the floor and walks 256 units without falling through', async () => {
    const level = compileLevel({
      id: 'dev',
      title: 'Dev',
      world: [...room({ min: v3(0, 0, 0), max: v3(1024, 512, 256), material: 'concrete' })],
      entities: [{ classname: 'info_player_start', origin: v3(128, 256, 1), angles: v3(0, 0, 0) }],
    });
    const w = await SpWorld.create({
      game: 'hl2',
      mapName: 'dev',
      bsp: level.bsp,
      assets: createEmptyAssets('hl2'),
    });
    expect(w.player.origin.x).toBeCloseTo(128, 3);
    expect(w.player.origin.y).toBeCloseTo(256, 3);

    const d = new Driver(w);
    d.idle(1);
    expect(w.player.origin.z).toBeGreaterThan(-0.5);
    expect(w.player.origin.z).toBeLessThan(2);

    const start = w.player.origin.x;
    const r = d.walkTo({ x: start + 256, y: 256, z: 0 }, { radius: 8, timeout: 10 });
    expect(r.reached).toBe(true);
    expect(w.player.origin.x - start).toBeGreaterThan(240);
    expect(w.player.origin.z).toBeGreaterThan(-0.5);
    expect(w.player.origin.z).toBeLessThan(2);
  });

  it('climbs compiled stairs', async () => {
    const level = compileLevel({
      id: 'dev_stairs',
      title: 'Stairs',
      world: [
        ...room({ min: v3(0, 0, 0), max: v3(1024, 512, 256), material: 'concrete' }),
        ...stairs({
          min: v3(400, 224, 0),
          dir: 'east',
          width: 64,
          steps: 4,
          rise: 8,
          run: 24,
          material: 'steel',
        }),
        { box: { min: v3(496, 224, 0), max: v3(600, 288, 32) }, material: 'steel' },
      ],
      entities: [{ classname: 'info_player_start', origin: v3(256, 256, 1) }],
    });
    const w = await SpWorld.create({
      game: 'hl2',
      mapName: 'dev_stairs',
      bsp: level.bsp,
      assets: createEmptyAssets('hl2'),
    });
    const d = new Driver(w);
    d.idle(0.5);
    d.walkTo({ x: 560, y: 256, z: 0 }, { radius: 10, timeout: 15 });
    expect(w.player.origin.z).toBeCloseTo(32, 0);
  });
});
