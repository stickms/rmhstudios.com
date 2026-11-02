import { describe, expect, it } from 'vitest';
import { MASK_PLAYERSOLID } from '../../tf2-game/core/constants';
import { emptyTrace } from '../../tf2-game/core/types';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import {
  LAYER_BRUSH_NAMES,
  bspDigest,
  box,
  compileLevel,
  room,
  v3,
  type LevelSource,
} from '../compiler';
import { bindPhaseView, type PhaseRenderTarget } from '../client/phase-view';
import { devBoxSource } from '../levels/dev_box';
import { DEV_PHASE, devPhaseSource } from '../levels/dev_phase';
import { getPhase, type PhaseDrawMode } from './phase';

async function load(src: LevelSource = devPhaseSource()) {
  const level = compileLevel(src, { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({
    game: 'hl2',
    mapName: src.id,
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  const phase = getPhase(world)!;
  return { level, world, phase, d: new Driver(world) };
}

const HULL = { mins: v3(-16, -16, 0), maxs: v3(16, 16, 72) };
function blockedAt(world: SpWorld, from: number, to: number): boolean {
  const t = emptyTrace();
  world.traceHull(
    v3(from, 192, 20),
    v3(to, 192, 20),
    HULL.mins,
    HULL.maxs,
    MASK_PLAYERSOLID,
    world.player.traceFilter,
    t,
  );
  return t.fraction < 1;
}

describe('compiler: phase layers', () => {
  it('groups layered world brushes into one model per layer, deterministically', () => {
    const a = compileLevel(devPhaseSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
    const b = compileLevel(devPhaseSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
    expect(bspDigest(a.bsp)).toBe(bspDigest(b.bsp));
    const ents = a.bsp.entities;
    const past = ents.find((e) => e.get('targetname') === LAYER_BRUSH_NAMES.past)!;
    const present = ents.find((e) => e.get('targetname') === LAYER_BRUSH_NAMES.present)!;
    expect(past.classname).toBe('func_brush');
    expect(past.get('layer')).toBe('past');
    expect(present.get('layer')).toBe('present');
    expect(past.get('model')).not.toBe(present.get('model'));
    // The world model has neither layered brush (button + two layer models + world = 4 models).
    expect(a.bsp.models.length).toBe(4);
    expect(ents.filter((e) => e.classname === 'harmonic_phase_controller')).toHaveLength(1);
  });

  it("leaves 'both' and untagged brushes alone: no controller, no layer keys, same models", () => {
    const plain = compileLevel(devBoxSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
    const src = devBoxSource();
    const tagged = compileLevel(
      { ...src, world: src.world.map((w) => ({ ...w, layer: 'both' as const })) },
      { materials: HARMONIC_MATERIAL_LOOKUP },
    );
    expect(bspDigest(tagged.bsp)).toBe(bspDigest(plain.bsp));
    expect(plain.bsp.entities.some((e) => e.classname === 'harmonic_phase_controller')).toBe(false);
    expect(plain.bsp.entities.some((e) => e.get('layer') !== undefined)).toBe(false);
  });

  it('entity brushes honour layer; mixed layers in one entity are an error', () => {
    const base = {
      id: 't',
      title: 't',
      world: room({ min: v3(0, 0, 0), max: v3(256, 256, 128), material: 'concrete' }),
    };
    const ok = compileLevel({
      ...base,
      entities: [
        {
          classname: 'func_brush',
          keys: { targetname: 'x' },
          brushes: [box(v3(8, 8, 0), v3(24, 24, 24), 'concrete', { layer: 'past' })],
        },
      ],
    });
    expect(ok.bsp.entities.find((e) => e.get('targetname') === 'x')!.get('layer')).toBe('past');
    expect(() =>
      compileLevel({
        ...base,
        entities: [
          {
            classname: 'func_brush',
            brushes: [
              box(v3(8, 8, 0), v3(24, 24, 24), 'concrete', { layer: 'past' }),
              box(v3(40, 8, 0), v3(56, 24, 24), 'concrete', { layer: 'present' }),
            ],
          },
        ],
      }),
    ).toThrow(/mixes layers/);
  });
});

describe('PhaseService on dev_phase', () => {
  it('starts in the present and attaches from the compiled controller', async () => {
    const { phase } = await load();
    expect(phase.currentLayer).toBe('present');
    expect(phase.listening).toBe(false);
  });

  it('the past wall blocks traces and the player only while currentLayer is past', async () => {
    const { world, phase, d } = await load();
    const [w0, w1] = DEV_PHASE.wallX;
    expect(blockedAt(world, w0 - 40, w1 + 40)).toBe(false);
    phase.setLayer('past');
    expect(blockedAt(world, w0 - 40, w1 + 40)).toBe(true);
    // A walking player is stopped by it.
    world.teleportEntity(world.player, { x: 100, y: 192, z: 1 }, null, null);
    d.idle(0.3);
    const r = d.walkTo({ x: 400, y: 192, z: 0 }, { timeout: 4 });
    expect(r.reached).toBe(false);
    expect(world.player.origin.x).toBeLessThan(w0);
    // Back to the present: both ways.
    phase.setLayer('present');
    expect(blockedAt(world, w0 - 40, w1 + 40)).toBe(false);
    const r2 = d.walkTo({ x: 300, y: 192, z: 0 }, { timeout: 6 });
    expect(r2.reached).toBe(true);
  });

  it('the present bridge holds the player only in the present', async () => {
    const { world, phase, d } = await load();
    world.teleportEntity(world.player, { x: 384, y: 192, z: 1 }, null, null);
    d.idle(1);
    expect(world.player.origin.z).toBeGreaterThan(-1);
    phase.setLayer('past');
    d.idle(1.5);
    expect(world.player.origin.z).toBeLessThan(-60);
  });

  it('the button toggles the layer through the controller (I/O)', async () => {
    const { world, phase, d } = await load();
    const seen: string[] = [];
    phase.on('layerChanged', (e) => seen.push(`${e.from}>${e.to}`));
    world.findByName('phase_button')!.acceptInput('Press', '', world.player, world.player);
    d.idle(0.5);
    expect(phase.currentLayer).toBe('past');
    world.findByName('harmonic_phase')!.acceptInput('SetLayer', 'present', null, null);
    expect(phase.currentLayer).toBe('present');
    expect(seen).toEqual(['present>past', 'past>present']);
  });

  it('shifting an entity flips isInPlayerLayer and fires entityShifted', async () => {
    const { world, phase } = await load();
    const start = world.findByName('phase_button')!;
    expect(phase.getLayer(start)).toBe('both');
    expect(phase.isInPlayerLayer(start)).toBe(true);
    const shifted: string[] = [];
    phase.on('entityShifted', (e) => shifted.push(`${e.from}>${e.to}`));
    phase.setEntityLayer(start, 'past');
    expect(phase.isInPlayerLayer(start)).toBe(false);
    phase.setLayer('past');
    expect(phase.isInPlayerLayer(start)).toBe(true);
    phase.setEntityLayer(start, 'both');
    expect(phase.isInPlayerLayer(start)).toBe(true);
    expect(shifted).toEqual(['both>past', 'past>both']);
  });

  it('shifting a brush entity moves its collision to the other layer', async () => {
    const { world, phase } = await load();
    const [w0, w1] = DEV_PHASE.wallX;
    const wall = world.findByName(LAYER_BRUSH_NAMES.past)!;
    phase.setEntityLayer(wall, 'present'); // the wall now exists in the present
    expect(blockedAt(world, w0 - 40, w1 + 40)).toBe(true);
    phase.setEntityLayer(wall, 'past');
    expect(blockedAt(world, w0 - 40, w1 + 40)).toBe(false);
  });

  it('draw modes: other layer hidden, ghosted while listening, own layer normal', async () => {
    const { level, phase } = await load();
    const modelOf = (name: string) =>
      parseInt(
        level.bsp.entities.find((e) => e.get('targetname') === name)!.get('model')!.slice(1),
        10,
      );
    const past = modelOf(LAYER_BRUSH_NAMES.past);
    const present = modelOf(LAYER_BRUSH_NAMES.present);
    const modes = new Map<number, PhaseDrawMode>();
    const target: PhaseRenderTarget = { setModelVisibility: (m, mode) => modes.set(m, mode) };
    bindPhaseView(phase, target);
    expect(modes.get(past)).toBe('hidden');
    expect(modes.get(present)).toBe('normal');
    phase.setListening(true);
    expect(modes.get(past)).toBe('ghost');
    phase.setLayer('past');
    expect(modes.get(past)).toBe('normal');
    expect(modes.get(present)).toBe('ghost');
    phase.setListening(false);
    expect(modes.get(present)).toBe('hidden');
  });

  it('death reload puts the level back in its start layer', async () => {
    const { world, phase, d } = await load();
    phase.setLayer('past');
    phase.setListening(true);
    d.idle(0.2);
    world.reloadAfterDeath();
    expect(phase.currentLayer).toBe('present');
    expect(phase.listening).toBe(false);
    expect(blockedAt(world, 200, 312)).toBe(false);
  });
});
