import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmbientLight, Box3, Group, NoColorSpace, Quaternion, SRGBColorSpace, Texture, type SkinnedMesh } from 'three';
import { CharacterAnimator, newDrive } from '../animator';
import { figureWorldHeight } from '../figure-scale';
import {
  MAX_RESIDENT_MODELS,
  acquireModel,
  instantiate,
  isModelBad,
  loadSkinModel,
  loadedModel,
  markModelBad,
  modelsEnabled,
  prepareGltf,
  resetModelCacheForTests,
  seedModelForTests,
} from '../model-loader';
import { SKIN_IDS } from '../catalog';
import { FIXTURE_ENTRY, MINIMAL_ENTRY, buildFixture } from './fixture-model';
import { fixtureGlb } from './fixture-glb';

const prepared = (entry = FIXTURE_ENTRY) => prepareGltf('citizen', entry, buildFixture())!;

const skinned = (root: { traverse(f: (o: unknown) => void): void }) => {
  const out: SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh);
  });
  return out;
};

describe('prepareGltf', () => {
  it('accepts a model with idle and walk and indexes its clips by name', () => {
    const m = prepared();
    expect(m.clips.size).toBe(10);
    expect(m.clips.has('Walk')).toBe(true);
    expect(m.height).toBe(FIXTURE_ENTRY.height);
    expect(m.triangles).toBeGreaterThan(0);
  });

  it('refuses a model without the required clips', () => {
    const f = buildFixture();
    f.animations = f.animations.filter((c) => c.name !== 'Walk');
    expect(prepareGltf('citizen', FIXTURE_ENTRY, f)).toBeNull();
    const g = buildFixture();
    expect(prepareGltf('citizen', { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, idle: 'Nope' } }, g)).toBeNull();
  });

  it('refuses a file with nothing to deform', () => {
    expect(prepareGltf('citizen', FIXTURE_ENTRY, { scene: new Group(), animations: buildFixture().animations })).toBeNull();
  });

  it('strips lights and cameras the file brought along', () => {
    const f = buildFixture();
    f.scene.add(new AmbientLight());
    const m = prepareGltf('citizen', FIXTURE_ENTRY, f)!;
    let lights = 0;
    m.template.traverse((o) => ((o as { isLight?: boolean }).isLight ? lights++ : 0));
    expect(lights).toBe(0);
  });

  it('puts colour textures in sRGB and keeps surfaces matte', () => {
    const f = buildFixture();
    const mesh = skinned(f.scene)[0];
    const mat = mesh.material as import('three').MeshStandardMaterial;
    mat.map = new Texture();
    mat.map.colorSpace = NoColorSpace;
    mat.metalness = 1;
    mat.roughness = 0.1;
    prepareGltf('citizen', FIXTURE_ENTRY, f);
    expect(mat.map.colorSpace).toBe(SRGBColorSpace);
    expect(mat.metalness).toBeLessThanOrEqual(0.1);
    expect(mat.roughness).toBeGreaterThanOrEqual(0.7);
  });

  it('trusts the manifest’s height unless the file measures wildly differently', () => {
    expect(prepared().height).toBe(1.8);
    expect(prepareGltf('citizen', { ...FIXTURE_ENTRY, height: 1.7 }, buildFixture())!.height).toBe(1.7);
    // A manifest that says 0.018 m for a 1.8 m file (cm vs m): believe the file.
    const wrong = prepareGltf('citizen', { ...FIXTURE_ENTRY, height: 0.018 }, buildFixture())!;
    expect(wrong.height).toBeCloseTo(1.8, 1);
  });
});

describe('instantiate', () => {
  it('stands as tall as the procedural figure it replaces', () => {
    for (const lookHeight of [0.96, 1, 1.1]) {
      const inst = instantiate(prepared(), lookHeight);
      inst.root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(inst.root);
      // (bind-pose bounds: feet at the origin)
      expect(box.min.y).toBeCloseTo(0, 2);
      expect(box.max.y).toBeCloseTo(figureWorldHeight(lookHeight), 2);
      expect(inst.scale).toBeCloseTo(figureWorldHeight(lookHeight) / 1.8, 10);
      inst.dispose();
    }
  });

  it('faces +z after the manifest yaw is applied', () => {
    const inst = instantiate(prepareGltf('citizen', { ...FIXTURE_ENTRY, yaw: Math.PI / 2 }, buildFixture())!, 1);
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
    expect(a.skeletonRoot.getObjectByName('LegL')!.quaternion.x).not.toBeCloseTo(0, 3);
    expect(b.skeletonRoot.getObjectByName('LegL')!.quaternion.x).toBe(0);
    anim.dispose();
  });

  it('finds the hand bone and a transform that keeps a prop upright whatever the bone’s own axes', () => {
    const inst = instantiate(prepared(), 1);
    expect(inst.handBone?.name).toBe('HandR');
    expect(inst.hand).not.toBeNull();
    // The fixture’s bones are world-aligned, so the correction is the identity rotation and undoes the model scale.
    expect(inst.hand!.quaternion.w).toBeCloseTo(1, 5);
    expect(inst.hand!.scale).toBeCloseTo(1 / inst.scale, 5);

    // Tilt the hand bone in the bind pose, as an exporter that orients bones along their length would.
    const model = prepared();
    model.template.getObjectByName('HandR')!.rotation.set(0.7, 1.1, -0.4);
    model.template.updateMatrixWorld(true);
    const tilted = instantiate(model, 1);
    tilted.root.updateMatrixWorld(true);
    const prop = tilted.handBone!.getWorldQuaternion(new Quaternion()).multiply(tilted.hand!.quaternion);
    expect(prop.w).toBeCloseTo(1, 4); // prop axes = scene axes
  });

  it('has no hand when the manifest names none or a bone the file lacks', () => {
    expect(instantiate(prepared({ ...FIXTURE_ENTRY, handBone: null }), 1).hand).toBeNull();
    const missing = instantiate(prepared({ ...FIXTURE_ENTRY, handBone: 'NoSuchBone' }), 1);
    expect(missing.handBone).toBeNull();
    expect(missing.hand).toBeNull();
  });

  it('disposes each clone’s own skeleton and leaves the shared geometry and materials alone', () => {
    const model = prepared();
    const inst = instantiate(model, 1);
    const [mesh] = skinned(inst.skeletonRoot);
    const dispGeo = vi.spyOn(mesh.geometry, 'dispose');
    const dispMat = vi.spyOn(mesh.material as import('three').Material, 'dispose');
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

describe('model cache', () => {
  beforeEach(() => {
    resetModelCacheForTests();
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetModelCacheForTests();
  });

  const fetchOf = (buf: ArrayBuffer, ok = true) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 404, headers: { get: () => String(buf.byteLength) }, arrayBuffer: async () => buf }) as unknown as Response);

  it('loads a real GLB through GLTFLoader: skinned, animated, ready to clone', async () => {
    const buf = await fixtureGlb();
    vi.stubGlobal('fetch', fetchOf(buf));
    const model = await loadSkinModel('citizen', FIXTURE_ENTRY);
    expect(model).not.toBeNull();
    expect(model!.clips.has('Idle')).toBe(true);
    expect(model!.clips.has('Death')).toBe(true);
    expect(skinned(model!.template).length).toBeGreaterThan(0);
    expect(loadedModel('citizen')).toBe(model);
    // and the loaded model animates
    const inst = instantiate(model!, 1);
    const anim = new CharacterAnimator(inst.skeletonRoot, model!.clips, model!.entry);
    const drive = newDrive();
    drive.speed = 1.6;
    for (let i = 0; i < 20; i++) anim.update(1 / 60, drive);
    expect(inst.skeletonRoot.getObjectByName('LegL')!.quaternion.x).not.toBeCloseTo(0, 3);
    anim.dispose();
    inst.dispose();
  });

  it('downloads a skin once however many people wear it', async () => {
    const f = fetchOf(await fixtureGlb());
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([loadSkinModel('citizen', FIXTURE_ENTRY), loadSkinModel('citizen', FIXTURE_ENTRY)]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 404', () => fetchOf(new ArrayBuffer(0), false)],
    ['bytes that are not a glb', () => fetchOf(new TextEncoder().encode('<html>not a model at all</html>').buffer as ArrayBuffer)],
    ['a network error', () => vi.fn(async () => { throw new TypeError('offline'); })],
  ])('resolves null (never throws) on %s', async (_n, make) => {
    vi.stubGlobal('fetch', make());
    await expect(loadSkinModel('citizen', FIXTURE_ENTRY)).resolves.toBeNull();
  });

  it('refuses a GLB whose manifest clip names are not in the file', async () => {
    vi.stubGlobal('fetch', fetchOf(await fixtureGlb()));
    const entry = { ...FIXTURE_ENTRY, clips: { ...FIXTURE_ENTRY.clips, idle: 'Standing_Idle_Missing' } };
    await expect(loadSkinModel('worker', entry)).resolves.toBeNull();
  });

  it('is switched off by the low-performance tier, low memory, the debug flag, and a skin that failed to render', async () => {
    vi.stubGlobal('fetch', fetchOf(await fixtureGlb()));
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
      const m = prepareGltf(skin, { ...FIXTURE_ENTRY, bytes: 1000 }, buildFixture())!;
      m.lastUsed = i;
      return m;
    });
    const disposed = new Map(seeded.map((m) => [m.skin, vi.spyOn(skinned(m.template)[0].geometry, 'dispose')]));
    // pin the oldest: it must survive
    const release = acquireModel(seeded[0]);
    for (const m of seeded) seedModelForTests(m);
    vi.stubGlobal('fetch', fetchOf(await fixtureGlb()));
    await loadSkinModel('gman', { ...FIXTURE_ENTRY, bytes: 1000 }); // a new load triggers the trim
    const resident = SKIN_IDS.filter((s) => loadedModel(s));
    expect(resident.length).toBeLessThanOrEqual(MAX_RESIDENT_MODELS);
    expect(loadedModel(seeded[0].skin)).not.toBeNull(); // pinned
    expect(loadedModel('gman')).not.toBeNull(); // just loaded
    const evicted = seeded.filter((m) => !loadedModel(m.skin));
    expect(evicted.length).toBeGreaterThan(0);
    for (const m of evicted) expect(disposed.get(m.skin)).toHaveBeenCalled();
    release();
  });
});

describe('minimal models', () => {
  it('load and clone with only the required clips', () => {
    const m = prepareGltf('citizen', MINIMAL_ENTRY, buildFixture())!;
    expect(m).not.toBeNull();
    const inst = instantiate(m, 1);
    const anim = new CharacterAnimator(inst.skeletonRoot, m.clips, m.entry);
    expect(anim.trigger('shoot')).toBe(false);
    anim.dispose();
    inst.dispose();
  });
});
