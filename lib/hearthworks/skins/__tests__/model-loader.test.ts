import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AmbientLight,
  AnimationClip,
  Box3,
  Euler,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Quaternion,
  QuaternionKeyframeTrack,
  SRGBColorSpace,
  SkinnedMesh,
  Texture,
  VectorKeyframeTrack,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterAnimator, newDrive } from '../animator';
import { figureWorldHeight } from '../figure-scale';
import {
  MAX_ANIMS_BYTES,
  MAX_RESIDENT_MODELS,
  acquireModel,
  applySkinFamily,
  instantiate,
  isModelBad,
  loadSkinModel,
  loadedModel,
  markModelBad,
  modelsEnabled,
  prepareModel,
  resetModelCacheForTests,
  seedModelForTests,
} from '../model-loader';
import { resetModelIndexForTests } from '../model-index';
import { SKIN_IDS } from '../catalog';
import type { ModelEntry } from '../model-manifest';
import { FIXTURE_ENTRY, MINIMAL_ENTRY, buildFixture } from './fixture-model';
import { fixtureGlb, packGlb } from './fixture-glb';

const q = (x: number) => new Quaternion().setFromEuler(new Euler(x, 0, 0));
const rotX = (bone: string, times: number[], angles: number[]) =>
  new QuaternionKeyframeTrack(`${bone}.quaternion`, times, angles.flatMap((a) => q(a).toArray()));

/** The fixture's own clips, as the anim pack of the channel presents them: named like the sequences, with their extras. */
const fixturePack = (): AnimationClip[] =>
  buildFixture().animations.map((c) => {
    c.userData = { fps: 30, frames: Math.round(c.duration * 30) + 1, delta: false };
    return c;
  });

const withExtras = (c: AnimationClip, extras: Record<string, unknown> = {}) => {
  c.userData = { fps: 30, frames: Math.round(c.duration * 30) + 1, delta: false, ...extras };
  return c;
};

const prepared = (entry: ModelEntry = FIXTURE_ENTRY, pack: AnimationClip[] = fixturePack()) => prepareModel('citizen', entry, buildFixture(), pack)!;

const skinned = (root: { traverse(f: (o: unknown) => void): void }) => {
  const out: SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh);
  });
  return out;
};

describe('prepareModel: the clips', () => {
  it('keeps the named sequences and renames each to its slot', () => {
    const m = prepared();
    expect([...m.clips.keys()].sort()).toEqual(['death', 'fall', 'hurt', 'idle', 'interact', 'jump', 'reload', 'run', 'shoot', 'walk']);
    expect(m.entry.clips).toMatchObject({ idle: 'idle', walk: 'walk', death: 'death' });
    expect(m.clips.get('walk')!.userData.source).toBe('Walk');
    expect(m.triangles).toBeGreaterThan(0);
  });

  it('drops every sequence the manifest does not name (the pack has ~1000 of them)', () => {
    const pack = [...fixturePack(), ...Array.from({ length: 200 }, (_, i) => withExtras(new AnimationClip(`junk_${i}`, 1, [rotX('Spine', [0, 1], [0, 1])])))];
    const m = prepared(FIXTURE_ENTRY, pack);
    expect(m.clips.size).toBe(10);
    expect([...m.clips.keys()].some((k) => k.startsWith('junk'))).toBe(false);
  });

  it('refuses a model without idle or walk in the pack', () => {
    expect(prepareModel('citizen', FIXTURE_ENTRY, buildFixture(), fixturePack().filter((c) => c.name !== 'Walk'))).toBeNull();
    expect(prepareModel('citizen', FIXTURE_ENTRY, buildFixture(), fixturePack().filter((c) => c.name !== 'Idle'))).toBeNull();
    expect(prepareModel('citizen', { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, idle: { clip: 'Standing_Idle_Missing' } } }, buildFixture(), fixturePack())).toBeNull();
  });

  it('plays without the optional clips a pack lacks: they fall back (and the model still loads)', () => {
    const m = prepared(FIXTURE_ENTRY, fixturePack().filter((c) => !['Run', 'Death', 'Shoot'].includes(c.name)));
    expect(m.clips.has('run')).toBe(false);
    expect(m.entry.clips.run).toBeUndefined();
    const inst = instantiate(m, 1);
    const anim = new CharacterAnimator(inst.skeletonRoot, m.clips, m.entry);
    expect(anim.trigger('shoot')).toBe(false);
    expect(anim.hasOwnClip('death')).toBe(false);
    anim.dispose();
  });

  it('picks the blend cell the manifest names, not its neighbours', () => {
    // A blend set: walk_all@0..7. Each cell's pose is told apart by the Spine angle; @4 is the forward one.
    const cells = Array.from({ length: 8 }, (_, i) => withExtras(new AnimationClip(`walk_all@${i}`, 1, [rotX('Spine', [0, 1], [i * 0.1, i * 0.1])]), { movement: [{ vector: [i === 4 ? 1 : 0, 0, 0] }] }));
    const pack = [...fixturePack().filter((c) => c.name !== 'Walk'), ...cells];
    const entry: ModelEntry = { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, walk: { clip: 'walk_all@4' } } };
    const walk = prepared(entry, pack).clips.get('walk')!;
    expect(walk.userData.source).toBe('walk_all@4');
    expect(new Quaternion().fromArray(walk.tracks.find((t) => t.name === 'Spine.quaternion')!.values, 0).angleTo(q(0.4))).toBeLessThan(1e-3);
    // a cell that is not in the pack is a missing clip, not a neighbour
    const wrong: ModelEntry = { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, walk: { clip: 'walk_all@9' } } };
    expect(prepareModel('citizen', wrong, buildFixture(), pack)).toBeNull();
  });

  it('cuts a trim window: starts at 0, lasts the window, keeps both end poses', () => {
    const long = withExtras(new AnimationClip('cit_door', 4.6, [rotX('Hips', [0, 1.2, 4.6], [0, -1.5, -1.5]), rotX('Spine', [0, 4.6], [0, 2])]), { frames: 139 });
    const pack = [...fixturePack().filter((c) => c.name !== 'Death'), long];
    const entry: ModelEntry = { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, death: { clip: 'cit_door', trim: [12, 52] } } };
    const death = prepared(entry, pack).clips.get('death')!;
    expect(death.duration).toBeCloseTo(40 / 30, 4);
    const spine = death.tracks.find((t) => t.name === 'Spine.quaternion')!;
    expect(spine.times[0]).toBe(0);
    // the Spine has no key inside the window, yet it holds its pose there
    expect(new Quaternion().fromArray(spine.values, 0).angleTo(q((2 * 0.4) / 4.6))).toBeLessThan(2e-3);
    expect(new Quaternion().fromArray(spine.values, 4).angleTo(q((2 * 52) / 30 / 4.6))).toBeLessThan(2e-3);
  });

  it('keeps the root bone in place: a gait with root motion does not slide the figure', () => {
    const slide = withExtras(
      new AnimationClip('Walk', 1, [
        rotX('Spine', [0, 1], [0, 0]),
        new VectorKeyframeTrack('Hips.position', [0, 0.5, 1], [0, 0.95, 0, 0.02, 1, 1.2, 0, 0.95, 2.4]),
      ]),
    );
    const pack = [...fixturePack().filter((c) => c.name !== 'Walk'), slide];
    const walk = prepared(FIXTURE_ENTRY, pack).clips.get('walk')!;
    const v = walk.tracks.find((t) => t.name === 'Hips.position')!.values;
    expect(v[8]).toBeCloseTo(v[2], 6); // first z = last z
    expect(v[4]).toBeCloseTo(1, 6); // the bounce survives
  });

  it('drops tracks for bones the mesh does not have (they would warn at bind time)', () => {
    const odd = withExtras(new AnimationClip('Idle', 2, [rotX('Spine', [0, 2], [0, 0.1]), rotX('forward', [0, 2], [0, 1]), rotX('ghost_bone', [0, 2], [0, 1])]));
    const idle = prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Idle'), odd]).clips.get('idle')!;
    expect(idle.tracks.map((t) => t.name)).toEqual(['Spine.quaternion']);
  });

  it('gives a static pose (single keys) the sequence’s length as its duration, not 0', () => {
    const still = withExtras(new AnimationClip('Idle', 0, [rotX('Spine', [0], [0.1])]), { frames: 61, fps: 30 });
    const idle = prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Idle'), still]).clips.get('idle')!;
    expect(idle.duration).toBeCloseTo(2, 6);
    // and it animates without NaN
    const m = prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Idle'), still]);
    const inst = instantiate(m, 1);
    const anim = new CharacterAnimator(inst.skeletonRoot, m.clips, m.entry, { seed: 0.4 });
    for (let i = 0; i < 20; i++) anim.update(1 / 60, newDrive());
    expect(Number.isFinite(inst.skeletonRoot.getObjectByName('Spine')!.quaternion.x)).toBe(true);
    anim.dispose();
  });

  it('rebases a delta layer (Source’s additive sequences) onto the standing pose: a full-body clip', () => {
    const idle = withExtras(new AnimationClip('Idle', 2, [rotX('ArmL', [0, 2], [0.3, 0.3]), rotX('Head', [0, 2], [0.1, 0.1])]));
    const layer = withExtras(new AnimationClip('Flinch', 0.4, [rotX('Head', [0, 0.2, 0.4], [0, 0.5, 0])]), { delta: true });
    const pack = [...fixturePack().filter((c) => !['Idle', 'Hurt'].includes(c.name)), idle, layer];
    const entry: ModelEntry = { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, hurt: { clip: 'Flinch' } } };
    const hurt = prepared(entry, pack).clips.get('hurt')!;
    const names = hurt.tracks.map((t) => t.name);
    // the arm the layer does not touch is held at the standing pose rather than left to the mixer
    expect(names).toContain('ArmL.quaternion');
    expect(names).toContain('Hips.position');
    const head = hurt.tracks.find((t) => t.name === 'Head.quaternion')!;
    expect(new Quaternion().fromArray(head.values, 4).angleTo(q(0.5).multiply(q(0.1)))).toBeLessThan(1e-3);
    const arm = hurt.tracks.find((t) => t.name === 'ArmL.quaternion')!;
    expect(new Quaternion().fromArray(arm.values, 0).angleTo(q(0.3))).toBeLessThan(1e-3);
  });
});

describe('prepareModel: the model', () => {
  it('refuses a file with nothing to deform', () => {
    expect(prepareModel('citizen', FIXTURE_ENTRY, { scene: new Group(), animations: [] }, fixturePack())).toBeNull();
  });

  it('shows body 0: drops the optional submodels of a body group (a Soldier’s rocket) and keeps the default ones', () => {
    const f = buildFixture();
    const [body] = skinned(f.scene);
    const part = (bodygroup: string, sub: number) => {
      const m = new SkinnedMesh(body.geometry.clone(), body.material);
      m.bind(body.skeleton, body.bindMatrix);
      m.geometry.userData = { bodygroup, sub };
      f.scene.add(m);
      return m;
    };
    const hat = part('hat', 0);
    const rocket = part('rocket', 1);
    const dispose = vi.spyOn(rocket.geometry, 'dispose');
    const m = prepareModel('citizen', FIXTURE_ENTRY, f, fixturePack())!;
    expect(rocket.parent).toBeNull();
    expect(dispose).toHaveBeenCalled();
    expect(hat.parent).not.toBeNull();
    expect(skinned(m.template)).toContain(hat);
  });

  it('strips lights and cameras the file brought along', () => {
    const f = buildFixture();
    f.scene.add(new AmbientLight());
    const m = prepareModel('citizen', FIXTURE_ENTRY, f, fixturePack())!;
    let lights = 0;
    m.template.traverse((o) => ((o as { isLight?: boolean }).isLight ? lights++ : 0));
    expect(lights).toBe(0);
  });

  it('puts colour textures in sRGB and keeps surfaces matte', () => {
    const f = buildFixture();
    const mat = skinned(f.scene)[0].material as MeshStandardMaterial;
    mat.map = new Texture();
    mat.map.colorSpace = NoColorSpace;
    mat.metalness = 1;
    mat.roughness = 0.1;
    prepareModel('citizen', FIXTURE_ENTRY, f, fixturePack());
    expect(mat.map.colorSpace).toBe(SRGBColorSpace);
    expect(mat.metalness).toBeLessThanOrEqual(0.1);
    expect(mat.roughness).toBeGreaterThanOrEqual(0.7);
  });

  it('measures the height from the standing pose when the manifest gives none, and trusts the manifest unless it is far off', () => {
    const { height: _drop, ...noHeight } = FIXTURE_ENTRY;
    const measured = prepared(noHeight as ModelEntry);
    expect(measured.height).toBeGreaterThan(1.6);
    expect(measured.height).toBeLessThan(1.95);
    expect(prepared({ ...FIXTURE_ENTRY, height: 1.7 }).height).toBe(1.7);
    // a manifest that says 0.018 m for a 1.8 m person (cm vs m): believe the file
    expect(prepared({ ...FIXTURE_ENTRY, height: 0.018 }).height).toBeCloseTo(1.8, 1);
  });

  it('bakes the standing pose (idle at t=0) into the template, so clones never show the bind pose', () => {
    const idle = withExtras(new AnimationClip('Idle', 2, [rotX('ArmL', [0, 2], [0.8, 0.8])]));
    const m = prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Idle'), idle]);
    expect(m.template.getObjectByName('ArmL')!.quaternion.angleTo(q(0.8))).toBeLessThan(1e-3);
    const inst = instantiate(m, 1);
    expect(inst.skeletonRoot.getObjectByName('ArmL')!.quaternion.angleTo(q(0.8))).toBeLessThan(1e-3);
  });

  it('records where a held prop is aligned: the middle of the shoot clip, else the standing pose', () => {
    const shoot = withExtras(new AnimationClip('Shoot', 0.5, [rotX('ArmR', [0, 0.5], [-1.2, -1.2])]));
    const withAim = prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Shoot'), shoot]);
    // HandR hangs off ArmR in the fixture: its world rotation is ArmR's
    expect(withAim.handRef!.angleTo(q(-1.2))).toBeLessThan(1e-3);
    // the template is back in its standing pose afterwards
    expect(withAim.template.getObjectByName('ArmR')!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-3);
    const noAim = prepared(FIXTURE_ENTRY, fixturePack().filter((c) => c.name !== 'Shoot'));
    expect(noAim.handRef!.angleTo(new Quaternion())).toBeLessThan(1e-3);
    expect(prepared({ ...FIXTURE_ENTRY, handBone: null }).handRef).toBeNull();
  });
});

describe('instantiate', () => {
  it('stands as tall as the procedural figure it replaces, feet on the ground', () => {
    for (const lookHeight of [0.96, 1, 1.1]) {
      const inst = instantiate(prepared(), lookHeight);
      inst.root.updateMatrixWorld(true);
      const box = new Box3();
      for (const m of skinned(inst.root)) {
        m.skeleton.update();
        m.computeBoundingBox();
        box.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      }
      expect(box.min.y).toBeCloseTo(0, 1);
      expect(box.max.y).toBeCloseTo(figureWorldHeight(lookHeight), 1);
      inst.dispose();
    }
  });

  it('lowers a model whose standing pose floats above (or sinks below) y = 0', () => {
    const lift = withExtras(new AnimationClip('Idle', 2, [new VectorKeyframeTrack('Hips.position', [0, 2], [0, 1.15, 0, 0, 1.15, 0])]));
    const m = prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Idle'), lift]);
    expect(m.groundOffset).toBeCloseTo(0.2, 1);
    expect(instantiate(m, 1).skeletonRoot.position.y).toBeCloseTo(-0.2, 1);
  });

  it('faces +z after the manifest yaw is applied', () => {
    const inst = instantiate(prepared({ ...FIXTURE_ENTRY, yaw: Math.PI / 2 }), 1);
    expect(inst.root.rotation.y).toBeCloseTo(Math.PI / 2, 10);
  });

  it('clones share geometry and materials but not skeletons', () => {
    const model = prepared();
    const a = instantiate(model, 1);
    const b = instantiate(model, 1);
    const [ma] = skinned(a.skeletonRoot);
    const [mb] = skinned(b.skeletonRoot);
    expect(ma.geometry).toBe(mb.geometry);
    expect(ma.material).toBe(mb.material);
    expect(ma.skeleton).not.toBe(mb.skeleton);
    expect(ma.skeleton.bones[0]).not.toBe(mb.skeleton.bones[0]);
    expect(skinned(model.template)[0].skeleton).not.toBe(ma.skeleton);
  });

  it('animating one clone does not move another', () => {
    const model = prepared();
    const a = instantiate(model, 1);
    const b = instantiate(model, 1);
    const anim = new CharacterAnimator(a.skeletonRoot, model.clips, model.entry, { seed: 0.4 });
    const drive = newDrive();
    drive.speed = 1.6;
    for (let i = 0; i < 30; i++) anim.update(1 / 60, drive);
    const before = b.skeletonRoot.getObjectByName('LegL')!.quaternion.x;
    expect(a.skeletonRoot.getObjectByName('LegL')!.quaternion.x).not.toBeCloseTo(before, 3);
    expect(b.skeletonRoot.getObjectByName('LegL')!.quaternion.x).toBe(before);
    anim.dispose();
  });

  it('finds the hand bone (named as the GLB names it) and a transform that keeps a prop pointing where the model aims', () => {
    // (no shoot clip: aligned to the standing pose, where the fixture's bones are world-aligned)
    const inst = instantiate(prepared(FIXTURE_ENTRY, fixturePack().filter((c) => c.name !== 'Shoot')), 1);
    expect(inst.handBone?.name).toBe('HandR');
    expect(inst.hand).not.toBeNull();
    expect(inst.hand!.quaternion.w).toBeCloseTo(1, 5);
    expect(inst.hand!.scale).toBeCloseTo(1 / inst.scale, 5);

    // Tilt the hand in the aiming pose, as Source bones are (they are oriented along their length).
    const shoot = withExtras(new AnimationClip('Shoot', 0.5, [rotX('ArmR', [0, 0.5], [0.7, 0.7])]));
    const tilted = instantiate(prepared(FIXTURE_ENTRY, [...fixturePack().filter((c) => c.name !== 'Shoot'), shoot]), 1);
    // in the aiming pose the prop's axes are the model's: bone rotation (ArmR 0.7) · correction = identity
    const prop = q(0.7).multiply(tilted.hand!.quaternion);
    expect(prop.angleTo(new Quaternion())).toBeLessThan(1e-3);
  });

  it('has no hand when the manifest names none or a bone the file lacks, and sanitises a Source bone name like three does', () => {
    expect(instantiate(prepared({ ...FIXTURE_ENTRY, handBone: null }), 1).hand).toBeNull();
    const missing = instantiate(prepared({ ...FIXTURE_ENTRY, handBone: 'NoSuchBone' }), 1);
    expect(missing.handBone).toBeNull();
    expect(missing.hand).toBeNull();
    const f = buildFixture();
    f.scene.getObjectByName('HandR')!.name = 'valvebipedbip01_r_hand'; // what GLTFLoader makes of "valvebiped.bip01_r_hand"
    const m = prepareModel('citizen', { ...FIXTURE_ENTRY, handBone: 'valvebiped.bip01_r_hand' }, f, fixturePack())!;
    expect(instantiate(m, 1).handBone?.name).toBe('valvebipedbip01_r_hand');
  });

  it('disposes each clone’s own skeleton and leaves the shared geometry and materials alone', () => {
    const model = prepared();
    const inst = instantiate(model, 1);
    const [mesh] = skinned(inst.skeletonRoot);
    const dispGeo = vi.spyOn(mesh.geometry, 'dispose');
    const dispMat = vi.spyOn(mesh.material as Material, 'dispose');
    const dispSkel = vi.spyOn(mesh.skeleton, 'dispose');
    const parent = new Group();
    parent.add(inst.root);
    inst.dispose();
    inst.dispose(); // idempotent
    expect(dispSkel).toHaveBeenCalledTimes(1);
    expect(dispGeo).not.toHaveBeenCalled();
    expect(dispMat).not.toHaveBeenCalled();
    expect(inst.root.parent).toBeNull();
  });
});

describe('applySkinFamily: TF2 team skins and other material families', () => {
  /** A fake GLTF: two slots (body, head), a material per skin family, `getDependency('material', i)` hands them out. */
  function fake() {
    const mats = ['red_body', 'red_head', 'blu_body', 'blu_head'].map((name) => Object.assign(new MeshStandardMaterial(), { name }));
    const scene = new Group();
    scene.userData.skins = [[0, 1], [2, 3], [2, -1]];
    const meshes = [0, 1].map((slot) => {
      const mesh = new Mesh(undefined, mats[slot]);
      mesh.geometry.userData.slot = slot;
      scene.add(mesh);
      return mesh;
    });
    const gltf = { scene, parser: { getDependency: vi.fn(async (_t: string, i: number) => mats[i]) } } as unknown as GLTF;
    return { gltf, meshes, mats };
  }

  it('family 0 (TF2 RED) is what the file already shows: nothing is loaded', async () => {
    const { gltf, meshes, mats } = fake();
    await applySkinFamily(gltf, 0);
    expect(meshes.map((m) => m.material)).toEqual([mats[0], mats[1]]);
    expect((gltf.parser.getDependency as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('family 1 (TF2 BLU) swaps each primitive’s material by its skin-reference slot, and frees the RED ones', async () => {
    const { gltf, meshes, mats } = fake();
    const dispose = vi.spyOn(mats[0], 'dispose');
    await applySkinFamily(gltf, 1);
    expect(meshes.map((m) => m.material)).toEqual([mats[2], mats[3]]);
    expect(dispose).toHaveBeenCalled();
  });

  it('hides a primitive whose slot has no material in the family (-1)', async () => {
    const { gltf, meshes } = fake();
    await applySkinFamily(gltf, 2);
    expect(meshes.map((m) => m.visible)).toEqual([true, false]);
  });

  it('throws for a family the model does not have (the loader turns that into "no model")', async () => {
    await expect(applySkinFamily(fake().gltf, 7)).rejects.toThrow(/skin family 7/);
  });
});

describe('model cache and the channel', () => {
  beforeEach(() => {
    resetModelCacheForTests();
    resetModelIndexForTests();
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetModelCacheForTests();
    resetModelIndexForTests();
  });

  const sha = (c: string) => c.repeat(40);
  const MESH = `${sha('a')}.glb`;
  const PACK = `${sha('b')}.glb`;
  const base = '/api/hl2-game/assets/mdl/';

  /** A fake channel: index.json plus the files, by URL. Anything else is a 404. */
  function channel(files: Record<string, ArrayBuffer | object | null>, headers: Record<string, string> = {}) {
    return vi.fn(async (url: string) => {
      const hit = files[url];
      if (hit === undefined || hit === null) return { ok: false, status: 404, headers: { get: () => null } } as unknown as Response;
      const buf = hit instanceof ArrayBuffer ? hit : new TextEncoder().encode(JSON.stringify(hit)).buffer;
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => headers[k.toLowerCase()] ?? String((buf as ArrayBuffer).byteLength) },
        arrayBuffer: async () => buf,
        json: async () => hit,
      } as unknown as Response;
    });
  }

  async function goodChannel() {
    const fixturePackClips = buildFixture().animations;
    return channel({
      [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK, skins: 2, skinned: true } },
      [`${base}${MESH}`]: await fixtureGlb(),
      [`${base}${PACK}`]: await packGlb(fixturePackClips),
    });
  }

  it('loads a skin from the channel: index → mesh + anim pack → only the named clips, in the standing pose', async () => {
    const f = await goodChannel();
    vi.stubGlobal('fetch', f);
    const model = await loadSkinModel('citizen', FIXTURE_ENTRY);
    expect(model).not.toBeNull();
    expect(f.mock.calls.map((c) => c[0]).sort()).toEqual([`${base}${MESH}`, `${base}${PACK}`, `${base}index.json`].sort());
    // 10 clips kept out of 50 in the pack
    expect(model!.clips.size).toBe(10);
    expect(model!.entry.clips.death).toBe('death');
    expect(skinned(model!.template).length).toBeGreaterThan(0);
    expect(loadedModel('citizen')).toBe(model);
    expect(model!.bytes).toBeGreaterThan(1000);
    // and the loaded model animates
    const inst = instantiate(model!, 1);
    const anim = new CharacterAnimator(inst.skeletonRoot, model!.clips, model!.entry);
    const drive = newDrive();
    drive.speed = 1.6;
    const start = inst.skeletonRoot.getObjectByName('LegL')!.quaternion.x;
    for (let i = 0; i < 20; i++) anim.update(1 / 60, drive);
    expect(inst.skeletonRoot.getObjectByName('LegL')!.quaternion.x).not.toBeCloseTo(start, 3);
    anim.dispose();
    inst.dispose();
  });

  it('downloads a skin once however many people wear it, and the index once per game', async () => {
    const f = await goodChannel();
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([loadSkinModel('citizen', FIXTURE_ENTRY), loadSkinModel('citizen', FIXTURE_ENTRY)]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(3);
    await loadSkinModel('worker', { ...FIXTURE_ENTRY });
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith('index.json'))).toHaveLength(1);
  });

  it('shows the team skin the entry names (family 1 of 2)', async () => {
    vi.stubGlobal('fetch', await goodChannel());
    // the fixture has no skin families, so family 1 is "no model": the entry asks for something the model lacks
    await expect(loadSkinModel('citizen', { ...FIXTURE_ENTRY, skin: 1 })).resolves.toBeNull();
  });

  it('refuses a skin family beyond the index’s count without downloading the files', async () => {
    const f = await goodChannel();
    vi.stubGlobal('fetch', f);
    await expect(loadSkinModel('citizen', { ...FIXTURE_ENTRY, skin: 2 })).resolves.toBeNull();
    expect(f).toHaveBeenCalledTimes(1); // the index only
  });

  it('falls back (resolves null, never throws) when there is no R2 behind the route: a 404 index', async () => {
    vi.stubGlobal('fetch', channel({}));
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
  });

  it('falls back when the index does not list the model (combine soldiers, Dr. Breen)', async () => {
    const f = channel({ [`${base}index.json`]: { 'models/barney.mdl': { glb: MESH, anims: PACK } } });
    vi.stubGlobal('fetch', f);
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the mesh is a 404', async () => channel({ [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK } }, [`${base}${PACK}`]: await packGlb(buildFixture().animations) })],
    ['the anim pack is a 404', async () => channel({ [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK } }, [`${base}${MESH}`]: await fixtureGlb() })],
    ['the model has no anim pack', async () => channel({ [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH } }, [`${base}${MESH}`]: await fixtureGlb() })],
    ['the mesh is bytes that are not a glb', async () => channel({ [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK } }, [`${base}${MESH}`]: new TextEncoder().encode('<html>not a model at all</html>').buffer as ArrayBuffer, [`${base}${PACK}`]: await packGlb(buildFixture().animations) })],
    ['the pack is bytes that are not a glb', async () => channel({ [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK } }, [`${base}${MESH}`]: await fixtureGlb(), [`${base}${PACK}`]: new TextEncoder().encode('<html>not a pack at all</html>').buffer as ArrayBuffer })],
    ['the pack has none of the named sequences', async () => channel({ [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK } }, [`${base}${MESH}`]: await fixtureGlb(), [`${base}${PACK}`]: await packGlb([], {}, 12) })],
  ])('resolves null (never throws) when %s', async (_n, make) => {
    vi.stubGlobal('fetch', await make());
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
  });

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
  });

  it('refuses an anim pack bigger than the cap, by its declared size, before reading it', async () => {
    const f = channel(
      {
        [`${base}index.json`]: { 'models/fixture.mdl': { glb: MESH, anims: PACK } },
        [`${base}${MESH}`]: await fixtureGlb(),
        [`${base}${PACK}`]: await packGlb(buildFixture().animations),
      },
      { 'content-length': String(MAX_ANIMS_BYTES + 1) },
    );
    vi.stubGlobal('fetch', f);
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
  });

  it('refuses a model whose manifest clip names are not in the pack', async () => {
    vi.stubGlobal('fetch', await goodChannel());
    const entry = { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, idle: { clip: 'Standing_Idle_Missing' } } };
    await expect(loadSkinModel('worker', entry)).resolves.toBeNull();
  });

  it('is switched off by the low-performance tier, low memory, the debug flag, and a skin that failed to render', async () => {
    vi.stubGlobal('fetch', await goodChannel());
    expect(modelsEnabled()).toBe(true);
    vi.stubGlobal('document', { documentElement: { classList: { contains: (c: string) => c === 'perf-lite' } } });
    expect(modelsEnabled()).toBe(false);
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
    vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } });
    vi.stubGlobal('window', { localStorage: { getItem: () => 'off' } });
    expect(modelsEnabled()).toBe(false);
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    expect(modelsEnabled()).toBe(true);
    markModelBad('citizen');
    expect(isModelBad('citizen')).toBe(true);
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
  });

  it('is off on the server', () => {
    vi.unstubAllGlobals();
    expect(modelsEnabled()).toBe(false);
  });

  it('keeps at most MAX_RESIDENT_MODELS templates, evicting the least recently used unreferenced ones and disposing them', async () => {
    const seeded = SKIN_IDS.slice(0, MAX_RESIDENT_MODELS + 3).map((skin, i) => {
      const m = prepareModel(skin, FIXTURE_ENTRY, buildFixture(), fixturePack())!;
      m.bytes = 1000;
      m.lastUsed = i;
      return m;
    });
    const disposed = new Map(seeded.map((m) => [m.skin, vi.spyOn(skinned(m.template)[0].geometry, 'dispose')]));
    // pin the oldest: it must survive
    const release = acquireModel(seeded[0]);
    for (const m of seeded) seedModelForTests(m);
    vi.stubGlobal('fetch', await goodChannel());
    await loadSkinModel('gman', FIXTURE_ENTRY); // a new load triggers the trim
    const resident = SKIN_IDS.filter((s) => loadedModel(s));
    expect(resident.length).toBeLessThanOrEqual(MAX_RESIDENT_MODELS);
    expect(loadedModel(seeded[0].skin)).not.toBeNull(); // pinned
    expect(loadedModel('gman')).not.toBeNull(); // just loaded
    const evicted = seeded.filter((m) => !loadedModel(m.skin));
    expect(evicted.length).toBeGreaterThan(0);
    for (const m of evicted) expect(disposed.get(m.skin)).toHaveBeenCalled();
    release();
  });

  it('evicts by the memory a model costs, not only by count', async () => {
    const big = SKIN_IDS.slice(0, 4).map((skin, i) => {
      const m = prepareModel(skin, FIXTURE_ENTRY, buildFixture(), fixturePack())!;
      m.bytes = 20 * 1024 * 1024;
      m.lastUsed = i;
      return m;
    });
    for (const m of big) seedModelForTests(m);
    vi.stubGlobal('fetch', await goodChannel());
    await loadSkinModel('gman', FIXTURE_ENTRY);
    expect(SKIN_IDS.filter((s) => loadedModel(s)).length).toBeLessThanOrEqual(3);
    expect(loadedModel('gman')).not.toBeNull();
  });
});

describe('minimal models', () => {
  it('load and clone with only the required clips', () => {
    const m = prepareModel('citizen', MINIMAL_ENTRY, buildFixture(), fixturePack())!;
    expect(m).not.toBeNull();
    expect([...m.clips.keys()].sort()).toEqual(['idle', 'walk']);
    const inst = instantiate(m, 1);
    const anim = new CharacterAnimator(inst.skeletonRoot, m.clips, m.entry);
    expect(anim.trigger('shoot')).toBe(false);
    anim.dispose();
    inst.dispose();
  });
});
