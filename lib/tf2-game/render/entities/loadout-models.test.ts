/**
 * Items on players (loadout-models.ts): how a held weapon looks (stock vs unlock: its role,
 * view-model activity table, minigun/sniper flags, loadout model), team paint colours, and a
 * player's outfit — a loadout part hung on the body's bone at its pose, painted for the team,
 * its body groups returned for the class body, its unusual effect started on the head and
 * stopped with the body.
 */
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Bone, Vector3 } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '@/lib/tf2-loadout/catalog-types';
import {
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_SCOUT,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../../core/constants';
import { decodeItems } from '../../sim/items/loadout';
import { setItemCatalog } from '../../sim/items/registry';
import { testCatalog } from '../../sim/items/__fixtures__/catalog';
import type { RenderContext } from './common';
import type { EffectSystem } from './effects';
import { LoadoutModels, paintColor, PlayerOutfit, weaponLook } from './loadout-models';
import { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';

function catalog(): Catalog {
  const c = testCatalog();
  return {
    ...c,
    paints: [...c.paints, { id: 5046, n: 'Team Spirit', rgb: '#b8383b', rgb2: '#5885a2' }],
  };
}

beforeEach(() => setItemCatalog(catalog()));
afterAll(() => setItemCatalog(null));

describe('weaponLook', () => {
  it('stock weapons keep their own data and the game channel model', () => {
    const look = weaponLook(18, TF_CLASS_SOLDIER)!;
    expect(look.modelItem).toBeNull();
    expect(look.stock?.defindex).toBe(18);
    expect(look.role).toBe('PRIMARY');
  });

  it('an unlock takes its role, activity table and loadout model; the stock weapon stands in', () => {
    const dh = weaponLook(127, TF_CLASS_SOLDIER)!;
    expect(dh.modelItem).toBe(127);
    expect(dh.role).toBe('PRIMARY');
    expect(dh.vmActivities.ACT_VM_IDLE).toBe('ACT_PRIMARY_VM_IDLE');
    expect(dh.stock?.defindex).toBe(18);
    expect(weaponLook(41, TF_CLASS_HEAVYWEAPONS)!.isMinigun).toBe(true);
    // The Shortstop is a primary held like a secondary (anim_slot).
    const ss = weaponLook(220, TF_CLASS_SCOUT)!;
    expect(ss.role).toBe('SECONDARY');
    expect(ss.vmActivities.ACT_VM_IDLE).toBe('ACT_SECONDARY_VM_IDLE');
    expect(weaponLook(127, TF_CLASS_SCOUT)).toBeUndefined();
  });
});

describe('paintColor', () => {
  it('BLU wears a two-tone paint’s second colour', () => {
    expect(paintColor(5046, TF_TEAM_RED)).toBe('#b8383b');
    expect(paintColor(5046, TF_TEAM_BLUE)).toBe('#5885a2');
    expect(paintColor(5029, TF_TEAM_BLUE)).toBe('#e6e6e6');
    expect(paintColor(undefined, TF_TEAM_RED)).toBeUndefined();
  });
});

/** A one-mesh GLB-like object as GLTFLoader returns it. */
function fakeGltf(scene: Group): GLTF {
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: {},
    userData: {},
    parser: { json: {}, associations: new Map() },
  } as unknown as GLTF;
}

function bodyInstance(): ModelInstance {
  const scene = new Group();
  const head = new Bone();
  head.name = 'bip_head';
  head.position.set(0, 1.5, 0);
  scene.add(head);
  const gltf = fakeGltf(scene);
  const asset = new ModelAsset('body', gltf, [], null);
  return new ModelInstance(asset, {});
}

function hatGltf(): GLTF {
  const scene = new Group();
  const material = new MeshStandardMaterial();
  material.name = 'hat';
  material.userData = { tint: true, tintReplace: 0 };
  scene.add(new Mesh(new BoxGeometry(0.2, 0.1, 0.2), material));
  scene.userData = {
    attach: { bone: 'bip_head', pose: new Matrix4().makeTranslation(0, 0.1, 0).toArray() },
  };
  return fakeGltf(scene);
}

describe('PlayerOutfit', () => {
  it('hangs a painted cosmetic on its bone, selects body groups and runs its unusual effect', async () => {
    const loader = { loadAsync: vi.fn(async () => hatGltf()) };
    const lib = new LoadoutModels(
      { list: async () => ['30001'], url: (n) => `/m/${n}.glb` },
      loader,
    );
    const effects = { loop: vi.fn(), stop: vi.fn() } as unknown as EffectSystem;
    const outfit = new PlayerOutfit(7, effects);
    const body = bodyInstance();
    const ctx = { loadout: lib } as unknown as RenderContext;
    const items = decodeItems('P18/S10/M6/C30001s1p5046e13');
    expect(outfit.update(body, items, TF_CLASS_SOLDIER, TF_TEAM_BLUE, ctx)).toEqual({ hat: 1 });
    await lib.whenIdle();
    outfit.update(body, items, TF_CLASS_SOLDIER, TF_TEAM_BLUE, ctx);
    await lib.whenIdle();
    outfit.update(body, items, TF_CLASS_SOLDIER, TF_TEAM_BLUE, ctx);
    expect(loader.loadAsync).toHaveBeenCalledWith('/m/30001.glb');
    expect(body.attached).toHaveLength(1);
    const part = body.attached[0];
    expect(part.root.parent?.name).toBe('bip_head');
    expect(new Vector3().setFromMatrixPosition(part.root.matrix).y).toBeCloseTo(0.1);
    // Team Spirit on BLU: the second colour (linear).
    const paint = part.uniforms.uPaint.value as Vector3;
    expect(part.uniforms.uPaintOn.value).toBe(1);
    expect(paint.z).toBeGreaterThan(paint.x);
    expect(effects.loop).toHaveBeenCalledWith('unusual:7:c0:30001', 'unusual:13', {
      entity: 7,
      attachment: 'head',
    });
    // Hidden (death, first person): the effect stops; a new body forgets the old items.
    outfit.setVisible(false);
    expect(effects.stop).toHaveBeenCalledWith('unusual:7:c0:30001');
    const next = bodyInstance();
    outfit.setVisible(true);
    outfit.update(next, decodeItems('P18/S10/M6'), TF_CLASS_SOLDIER, TF_TEAM_BLUE, ctx);
    expect(next.attached).toHaveLength(0);
    expect(body.attached).toHaveLength(1);
  });
});
