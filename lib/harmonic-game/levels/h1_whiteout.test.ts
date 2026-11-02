import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IN_ATTACK } from '../../tf2-game/core/constants';
import type { Vec3 } from '../../tf2-game/core/vec';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { compileLevel } from '../compiler';
import '../narrative';
import { findScript } from '../narrative/scripts';
import { attachHarmonicSim, COLD_MAX, WEAPONS } from '../sim';
import { findHarmonicLevel, HARMONIC_LEVELS } from './index';
import { H1, h1WhiteoutSource } from './h1_whiteout';

/** The compiler's Uint16 caps are 65,535; stay well inside, and keep the face count sensible. */
const MAX_BRUSHES = 1500;
const MAX_FACES = 20000;

const compile = () => compileLevel(h1WhiteoutSource(), { materials: HARMONIC_MATERIAL_LOOKUP });

async function load() {
  const level = compile();
  const world = await SpWorld.create({
    game: 'hl2',
    mapName: 'h1_whiteout',
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  const sim = attachHarmonicSim(world);
  const d = new Driver(world);
  return { level, world, sim, d };
}

const locale = JSON.parse(
  readFileSync(new URL('../../../locales/en/harmonic.json', import.meta.url), 'utf8'),
) as Record<string, string>;

describe('h1_whiteout', () => {
  it('is registered under the chapter title key and compiles within budget', () => {
    const entry = findHarmonicLevel('h1_whiteout');
    expect(entry?.titleKey).toBe('chapter_h1_whiteout');
    expect(HARMONIC_LEVELS.map((l) => l.id)).toContain('h1_whiteout');
    expect(locale.chapter_h1_whiteout).toBe(entry?.titleDefault);
    const level = compile();
    for (const m of level.materials.values()) expect(m.color).not.toEqual([1, 0, 1]);
    expect(level.stats.faces).toBeLessThan(MAX_FACES);
    expect(level.stats.faces).toBeGreaterThan(200);
    expect(level.stats.brushes).toBeLessThan(MAX_BRUSHES);
  });

  it('spawns the player on the ground, with no weapon and a full meter', async () => {
    const { world, d, sim } = await load();
    d.idle(1);
    expect(world.player.health).toBe(100);
    expect(world.player.origin.z).toBeGreaterThan(H1.start.z - 3);
    expect(world.player.origin.z).toBeLessThan(H1.start.z + 3);
    expect(sim.weapons.state.owned.prybar).toBeFalsy();
    expect(sim.cold.value).toBe(COLD_MAX);
  });

  it('opens the jammed hatch only with the pry bar', async () => {
    const { world, d, sim } = await load();
    d.idle(0.3);
    const hatch = world.findByName('hatch')!;
    expect(hatch).toBeTruthy();
    // Bare-handed: the hatch holds.
    d.walkTo({ x: 520, y: 0, z: 27 }, { radius: 12 });
    d.look({ x: 568, y: 0, z: 60 });
    for (let i = 0; i < 4; i++) {
      d.press(IN_ATTACK);
      d.idle(0.6);
    }
    expect(hatch.removed).toBe(false);
    // Fetch the pry bar from the wreck floor.
    d.walkTo(H1.prybar, { radius: 24 });
    d.idle(0.6);
    expect(sim.weapons.state.owned.prybar).toBe(true);
    sim.weapons.select(WEAPONS.prybar.slot);
    d.idle(0.8);
    d.walkTo({ x: 520, y: 0, z: 27 }, { radius: 12 });
    d.look({ x: 568, y: 0, z: 60 });
    for (let i = 0; i < 4 && !hatch.removed; i++) {
      d.press(IN_ATTACK);
      d.idle(WEAPONS.prybar.fireInterval + 0.2);
    }
    expect(hatch.removed).toBe(true);
  });

  it('walks wreck -> hut -> cache -> ridge -> fence, surviving the cold with no detours', async () => {
    const { world, d, sim } = await load();
    d.idle(0.3);
    let minCold = COLD_MAX;
    let minHealth = 100;
    const watch = () => {
      minCold = Math.min(minCold, sim.cold.value);
      minHealth = Math.min(minHealth, world.player.health);
    };
    const hatch = world.findByName('hatch')!;
    const walk = (p: Vec3, radius = 14) => {
      // walkTo in short hops so the meter is sampled all along the way.
      for (let guard = 0; guard < 200; guard++) {
        const r = d.walkTo(p, { radius, timeout: 0.5 });
        watch();
        expect(r.stuck, `stuck walking to ${p.x},${p.y} at ${world.player.origin.x}`).toBe(false);
        if (r.reached) return;
      }
      throw new Error(`never reached ${p.x},${p.y}`);
    };
    const rest = (secs: number) => {
      d.idle(secs, () => {
        watch();
        return sim.cold.value >= COLD_MAX;
      });
    };

    // The wreck: pry bar, hatch.
    walk(H1.prybar, 24);
    d.idle(0.4);
    sim.weapons.select(WEAPONS.prybar.slot);
    d.idle(0.8);
    walk(v(520, 0, 27), 12);
    d.look({ x: 568, y: 0, z: 60 });
    for (let i = 0; i < 4 && !hatch.removed; i++) {
      d.press(IN_ATTACK);
      d.idle(WEAPONS.prybar.fireInterval + 0.2);
    }
    expect(hatch.removed).toBe(true);

    // Out into the blizzard: the cold drains, then the hut refills it.
    const outsideAt = world.curtime;
    for (const p of H1.path.slice(2, 6)) walk(p);
    expect(sim.cold.sheltered).toBe(true);
    expect(world.curtime).toBeGreaterThan(outsideAt);
    const beforeRest = sim.cold.value;
    expect(beforeRest).toBeLessThan(COLD_MAX - 10);
    rest(30);
    expect(sim.cold.value).toBeGreaterThan(beforeRest);
    expect(sim.cold.value).toBe(COLD_MAX);
    walk(H1.path[6]);

    // Open ice, the pressure ridge, the cache.
    for (const p of H1.path.slice(7, 11)) walk(p);
    expect(sim.cold.value).toBeLessThan(COLD_MAX - 10);
    expect(world.player.origin.z).toBeLessThan(5);
    walk(H1.path[11]);
    expect(sim.cold.sheltered).toBe(true);
    const pistolRounds = sim.weapons.state.reserve.pulse;
    walk(v(H1.ammo.x, H1.ammo.y, 0), 24);
    d.idle(0.5);
    expect(sim.weapons.state.reserve.pulse).toBeGreaterThan(pistolRounds);
    expect(sim.weapons.state.owned.pulse).toBeFalsy();
    rest(30);
    expect(sim.cold.value).toBe(COLD_MAX);

    // The long climb, the summit, and down to the fence.
    walk(H1.path[12]);
    walk(H1.path[13]);
    expect(world.player.origin.z).toBeGreaterThan(H1.summit.height - 5);
    walk(H1.path[14]);
    walk(H1.path[15]);
    d.idle(0.5);
    watch();

    expect(world.player.health).toBeGreaterThan(0);
    expect(minHealth).toBe(100);
    expect(minCold).toBeGreaterThan(15);
    expect(world.player.origin.x).toBeGreaterThan(H1.fenceX - 150);
    expect(world.player.origin.x).toBeLessThan(H1.fenceX);
    // The chapter's last scene started at the gate, and its output chain reaches chapter_end.
    expect(d.fired('fence_dialogue.start')).toBe(true);
    // When the last radio scene ends, the chapter-end input is sent (to the class H3.2 registers).
    d.idle(40);
    expect(d.fired('chapter_end.end')).toBe(true);
    // Every dialogue the path walked past has started.
    for (const n of ['outside', 'hut', 'cache', 'ridge', 'fence'])
      expect(d.fired(`${n}_dialogue.start`), n).toBe(true);
  });

  it('flickers the ship on and off during the ridge scene', async () => {
    const { world, d } = await load();
    d.idle(0.3);
    const ship = world.findByName('ship_hull') as unknown as { removed: boolean };
    expect(ship).toBeTruthy();
    // Place the player on the summit; the scene starts and strikes the flicker at line 3.
    world.teleportEntity(world.player, v(H1.summit.from - 200, 0, 110), null, null);
    d.idle(0.3);
    d.walkTo(v(H1.summit.from + 90, 0, H1.summit.height), { radius: 10 });
    d.idle(60);
    expect(d.fired('ship_flicker.trigger')).toBe(true);
    const enables = d.inputs.filter((i) => i === 'ship_hull.enable').length;
    const disables = d.inputs.filter((i) => i === 'ship_hull.disable').length;
    expect(enables).toBeGreaterThanOrEqual(3);
    expect(disables).toBeGreaterThanOrEqual(enables);
  });

  it('has every I/O target, a chapter_end wired from the finish, and every dialogue key in the locale', () => {
    const level = compile();
    const names = new Set<string>();
    for (const e of level.bsp.entities) {
      const n = e.get('targetname');
      if (n) names.add(n.toLowerCase());
    }
    let outputs = 0;
    let endWired = false;
    for (const e of level.bsp.entities) {
      for (const [k, val] of e.props) {
        if (!/^On[A-Z]/.test(k)) continue;
        outputs++;
        const target = val.split(',')[0].toLowerCase();
        expect(names.has(target), `${e.classname}.${k} -> ${target}`).toBe(true);
        if (/^chapter_end,end,/i.test(val)) endWired = true;
      }
    }
    expect(outputs).toBeGreaterThan(20);
    expect(endWired).toBe(true);
    expect(names.has('chapter_end')).toBe(true);

    // Dialogue entities name scripts that exist; every line and hint key is in the catalogue.
    for (const e of level.bsp.entities) {
      if (e.classname === 'harmonic_dialogue') {
        const script = findScript(e.get('script') ?? '');
        expect(script, e.get('script')).toBeTruthy();
        for (const line of script!.lines) {
          expect(locale[line.key], line.key).toBe(line.defaultValue);
        }
      }
      if (e.classname === 'harmonic_hint') {
        expect(locale[e.get('hintkey') ?? ''], e.get('hintkey')).toBe(e.get('hinttext'));
      }
      if (e.classname === 'trigger_harmonic_exposure' && e.get('hintkey')) {
        const key = (e.get('hintkey') ?? '').replace(/^harmonic:/, '');
        expect(locale[key], key).toBe(e.get('hint'));
      }
    }
  });
});

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
