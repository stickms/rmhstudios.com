/**
 * Items on players (loadout-models.ts): how a held weapon looks (stock vs unlock: its role,
 * view-model activity table, minigun/sniper flags, loadout model), team paint colours, and a
 * player's outfit — a loadout part hung on the body's bone at its pose, painted for the team,
 * its body groups returned for the class body, its unusual effect started on the head and
 * stopped with the body.
 */
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
  Uint16BufferAttribute,
  Vector3,
  Vector4,
} from 'three';
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
import { killstreakerSystem, sheenColor } from '@/lib/tf2-loadout/killstreak';
import { encodeItems } from '../../sim/items/loadout';
import {
  ItemInstance,
  LoadoutModels,
  paintColor,
  PlayerOutfit,
  setSheenUniforms,
  weaponEffect,
  weaponLook,
} from './loadout-models';
import { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';

function catalog(): Catalog {
  const c = testCatalog();
  return {
    ...c,
    items: c.items.map((i) => (i.id === 127 ? { ...i, ps: 'rocketlauncher' } : i)),
    paints: [...c.paints, { id: 5046, n: 'Team Spirit', rgb: '#b8383b', rgb2: '#5885a2' }],
    effects: [
      ...c.effects,
      { id: 701, n: 'Hot', system: 'weapon_unusual_hot', category: 'weapon' as const },
    ],
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

/** A loadout part from a fake GLB, loaded the way the game loads one. */
async function loadPart(gltf: GLTF) {
  const lib = new LoadoutModels(
    { list: async () => ['x'], url: (n) => `/m/${n}.glb` },
    { loadAsync: async () => gltf },
  );
  lib.peek('x');
  await lib.whenIdle();
  return lib.peek('x')!;
}

describe('team skins', () => {
  it('a BLU player wears the model’s BLU texture and default tint; RED gets its own back', async () => {
    const scene = new Group();
    const red = new Texture();
    const blu = new Texture();
    const material = new MeshStandardMaterial({ map: red });
    material.userData = {
      tint: true,
      tintDefault: [0.72, 0.22, 0.23],
      blu: { baseColorTexture: 1, tintDefault: [0.35, 0.52, 0.64], name: 'hat_blue' },
    };
    scene.add(new Mesh(new BoxGeometry(0.2, 0.1, 0.2), material));
    scene.userData = { attach: { bone: 'bip_head', pose: new Matrix4().toArray() } };
    const gltf = fakeGltf(scene);
    const getDependency = vi.fn(async (_type: string, i: number) => (i === 1 ? blu : red));
    (gltf.parser as unknown as { getDependency: typeof getDependency }).getDependency =
      getDependency;
    const part = await loadPart(gltf);
    expect(part.teamVariants).toBe(true);
    const item = new ItemInstance(part, bodyInstance().uniforms);
    const mat = () => {
      let m: { uniforms: Record<string, { value: unknown }> } | undefined;
      item.inst.forEachMaterial((x) => (m = x));
      return m!;
    };
    expect(mat().uniforms.uMap.value).toBe(red);
    item.dress({ team: TF_TEAM_BLUE });
    await new Promise((r) => setTimeout(r, 0));
    expect(getDependency).toHaveBeenCalledWith('texture', 1);
    expect(mat().uniforms.uMap.value).toBe(blu);
    const tint = mat().uniforms.uPaintDefault.value as Vector3;
    expect(tint.z).toBeGreaterThan(tint.x);
    item.dress({ team: TF_TEAM_RED });
    expect(mat().uniforms.uMap.value).toBe(red);
    expect((mat().uniforms.uPaintDefault.value as Vector3).x).toBeGreaterThan(0.4);
  });

  it('a model without team colours loads nothing for BLU', async () => {
    const gltf = hatGltf();
    const getDependency = vi.fn();
    (gltf.parser as unknown as { getDependency: typeof getDependency }).getDependency =
      getDependency;
    const part = await loadPart(gltf);
    expect(part.teamVariants).toBe(false);
    new ItemInstance(part, bodyInstance().uniforms).dress({ team: TF_TEAM_BLUE });
    await new Promise((r) => setTimeout(r, 0));
    expect(getDependency).not.toHaveBeenCalled();
  });
});

describe('killstreak kits', () => {
  it('rides the item string as x<sheen>[.<killstreaker>] on weapons', () => {
    const items = decodeItems('P127x3.2004/S133w/M6x1/C183p5046');
    expect(items.weapons[0]).toMatchObject({ item: 127, sheen: 3, streaker: 2004 });
    expect(items.weapons[2]).toMatchObject({ item: 6, sheen: 1 });
    expect(items.weapons[2].streaker).toBeUndefined();
    expect(encodeItems(items)).toBe('P127x3.2004/S133w/M6x1/C183p5046');
    // After a war paint's fields, as the encoder writes them.
    expect(decodeItems('P127k300.2.7x7.2008').weapons[0]).toMatchObject({
      kit: 300,
      seed: 7,
      sheen: 7,
      streaker: 2008,
    });
  });

  it('picks the killstreaker system by streak and the sheen colour by team', () => {
    expect(killstreakerSystem(2004, 4)).toBeUndefined();
    expect(killstreakerSystem(2004, 5)).toBe('killstreak_t3_lvl1');
    expect(killstreakerSystem(2008, 12)).toBe('killstreak_t7_lvl2');
    expect(killstreakerSystem(undefined, 20)).toBeUndefined();
    // Team Shine follows the wearer's team; the others do not.
    expect(sheenColor(1, TF_TEAM_RED)![0]).toBeGreaterThan(sheenColor(1, TF_TEAM_BLUE)![0]);
    expect(sheenColor(4, TF_TEAM_RED)).toEqual(sheenColor(4, TF_TEAM_BLUE));
  });

  it('the sheen goes on the weapon’s own uniforms, never the wearer’s', async () => {
    const body = bodyInstance();
    const item = new ItemInstance(await loadPart(hatGltf()), body.uniforms);
    item.setSheen(4, TF_TEAM_RED, 2.5);
    const s = item.inst.uniforms.uSheen.value as Vector4;
    expect(s.w).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(s.x); // Mean Green
    expect(item.inst.uniforms.uSheenTime.value).toBe(2.5);
    expect(body.uniforms.uSheen).toBeUndefined();
    setSheenUniforms(item.inst.uniforms, undefined, TF_TEAM_RED, 3);
    expect((item.inst.uniforms.uSheen.value as Vector4).w).toBe(0);
  });

  it('a weapon unusual resolves to its per-weapon variant', () => {
    const [dh] = decodeItems('P127e701').weapons;
    expect(weaponEffect(dh)).toBe('unusual:701:rocketlauncher');
    // A cosmetic effect id, or a weapon without a particle suffix, has none.
    expect(weaponEffect(decodeItems('P127e13').weapons[0])).toBeUndefined();
    expect(weaponEffect(decodeItems('P18e701').weapons[0])).toBeUndefined();
  });
});

describe('worn weapon-slot items spread over the feet', () => {
  /** A skinned model over the given bones, one vertex per bone. */
  function skinned(names: string[]): Group {
    const scene = new Group();
    const bones = names.map((n) => {
      const b = new Bone();
      b.name = n;
      scene.add(b);
      return b;
    });
    const geo = new BoxGeometry(0.1, 0.1, 0.1);
    const count = geo.attributes.position.count;
    const joints: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < count; i++) {
      joints.push(i % names.length, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
    geo.setAttribute('skinIndex', new Uint16BufferAttribute(joints, 4));
    geo.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
    const mesh = new SkinnedMesh(geo, new MeshStandardMaterial());
    mesh.bind(new Skeleton(bones));
    scene.add(mesh);
    return scene;
  }

  it('the Gunboats are bone-merged: each boot follows its own foot of the wearer', async () => {
    const boots = skinned(['bip_foot_l', 'bip_foot_r']);
    boots.userData = {
      boneMerge: true,
      attach: { bone: 'bip_foot_l', pose: new Matrix4().toArray() },
    };
    const part = await loadPart(fakeGltf(boots));
    expect(part.boneMerge).toBe(true);
    const bodyScene = skinned(['bip_foot_l', 'bip_foot_r']);
    const body = new ModelInstance(new ModelAsset('body', fakeGltf(bodyScene), [], null), {});
    const outfit = new PlayerOutfit(3, null);
    const lib = new LoadoutModels(
      { list: async () => ['133'], url: (n) => `/m/${n}.glb` },
      { loadAsync: async () => fakeGltf(boots) },
    );
    const ctx = { loadout: lib } as unknown as RenderContext;
    const items = decodeItems('P18/S133w/M6');
    for (let i = 0; i < 3; i++) {
      outfit.update(body, items, TF_CLASS_SOLDIER, TF_TEAM_RED, ctx);
      await lib.whenIdle();
    }
    expect(body.attached).toHaveLength(1);
    const worn = body.attached[0];
    let skel: Skeleton | null = null;
    worn.scene.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skel = (o as SkinnedMesh).skeleton;
    });
    const wearer = new Set(body.bones);
    expect(skel!.bones.map((b) => b.name)).toEqual(['bip_foot_l', 'bip_foot_r']);
    expect(skel!.bones.every((b) => wearer.has(b))).toBe(true);
  });
});

describe('jiggle bones in game', () => {
  it('swing only within JIGGLE_LOD_DISTANCE of the camera, and rest beyond it', async () => {
    const scene = new Group();
    const root = new Bone();
    root.name = 'bip_head';
    const tassel = new Bone();
    tassel.name = 'tassel';
    tassel.position.set(0, 0.1, 0);
    root.add(tassel);
    scene.add(root);
    const geo = new BoxGeometry(0.05, 0.05, 0.05);
    const n = geo.attributes.position.count;
    geo.setAttribute(
      'skinIndex',
      new Uint16BufferAttribute(
        new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );
    geo.setAttribute(
      'skinWeight',
      new Float32BufferAttribute(
        new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );
    const mesh = new SkinnedMesh(geo, new MeshStandardMaterial());
    mesh.bind(new Skeleton([root, tassel]));
    scene.add(mesh);
    scene.userData = {
      attach: { bone: 'bip_head', pose: new Matrix4().toArray() },
      jiggle: [
        {
          bone: 'tassel',
          length: 0.1,
          yawStiffness: 100,
          yawDamping: 4,
          pitchStiffness: 100,
          pitchDamping: 4,
          alongStiffness: 100,
          alongDamping: 4,
          angleLimit: 0,
        },
      ],
    };
    const lib = new LoadoutModels(
      { list: async () => ['30001'], url: (x) => `/m/${x}.glb` },
      { loadAsync: async () => fakeGltf(scene) },
    );
    const body = bodyInstance();
    const outfit = new PlayerOutfit(5, null);
    const camera = new Vector3(0, 1.5, 2);
    const ctx = { loadout: lib, cameraPosition: camera, dt: 1 / 60 } as unknown as RenderContext;
    const items = decodeItems('P18/S10/M6/C30001');
    for (let i = 0; i < 3; i++) {
      outfit.update(body, items, TF_CLASS_SOLDIER, TF_TEAM_RED, ctx);
      await lib.whenIdle();
    }
    body.updateMatrices();
    expect(outfit.afterPose(ctx)).toBe(1);
    camera.set(0, 1.5, 1200 * 0.01905); // 1200 units away: past the jiggle LOD
    expect(outfit.afterPose(ctx)).toBe(0);
  });
});

describe('item draw budget', () => {
  it('a player past the frame’s item budget shows no cosmetics, and spends none of it', async () => {
    const lib = new LoadoutModels(
      { list: async () => ['30001'], url: (n) => `/m/${n}.glb` },
      { loadAsync: async () => hatGltf() },
    );
    const items = decodeItems('P18/S10/M6/C30001');
    const dress = async (left: number) => {
      const body = bodyInstance();
      const outfit = new PlayerOutfit(9, null);
      const budget = { left };
      const ctx = { loadout: lib, itemDrawBudget: budget } as unknown as RenderContext;
      for (let i = 0; i < 3; i++) {
        budget.left = left;
        outfit.update(body, items, TF_CLASS_SOLDIER, TF_TEAM_RED, ctx);
        await lib.whenIdle();
      }
      return { shown: body.attached[0]?.root.visible, left: budget.left };
    };
    expect(await dress(10)).toEqual({ shown: true, left: 9 });
    expect(await dress(0)).toEqual({ shown: false, left: 0 });
  });
});

describe('the builder’s team switch (model-utils applyTeam)', () => {
  it('shows BLU’s texture and tint, keeps a war paint on top, and puts RED’s back', async () => {
    const { applyTeam, applyPaintTexture } =
      await import('@/components/tf2-hud/loadout/model-utils');
    const red = new Texture();
    const blu = new Texture();
    const paint = new Texture();
    const material = new MeshStandardMaterial({ map: red });
    material.userData = {
      tint: true,
      tintDefault: [0.7, 0.2, 0.2],
      blu: { baseColorTexture: 3, tintDefault: [0.3, 0.5, 0.6] },
    };
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), material));
    const textures = new Map([[3, blu]]);
    applyTeam(root, 'blu', textures);
    expect(material.map).toBe(blu);
    expect(material.userData.tintDefault).toEqual([0.3, 0.5, 0.6]);
    // A war paint replaces the shown map; switching team changes what it falls back to only.
    applyPaintTexture(root, paint);
    applyTeam(root, 'red', textures);
    expect(material.map).toBe(paint);
    applyPaintTexture(root, null);
    expect(material.map).toBe(red);
    expect(material.userData.tintDefault).toEqual([0.7, 0.2, 0.2]);
  });
});
