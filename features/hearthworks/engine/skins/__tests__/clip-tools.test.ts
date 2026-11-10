import { describe, expect, it } from 'vitest';
import {
  AnimationClip,
  Bone,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  applyClipPose,
  capturePose,
  clipBytes,
  filterGlbAnimations,
  keepInPlace,
  nodeName,
  onlyNodes,
  poseDuration,
  rebaseDelta,
  restorePose,
  trimClip,
} from '../clip-tools';
import { buildFixture } from './fixture-model';
import { packGlb } from './fixture-glb';

const q = (x: number) => new Quaternion().setFromEuler(new Euler(x, 0, 0));
const rotX = (bone: string, times: number[], angles: number[]) =>
  new QuaternionKeyframeTrack(`${bone}.quaternion`, times, angles.flatMap((a) => q(a).toArray()));
const pos = (bone: string, times: number[], xyz: number[]) => new VectorKeyframeTrack(`${bone}.position`, times, xyz);

describe('filterGlbAnimations: cut the pack before it is parsed', () => {
  const wanted = new AnimationClip('walk_all@4', 1, [rotX('Spine', [0, 1], [0, 0.4])]);
  const other = new AnimationClip('walk_all@0', 1, [rotX('Spine', [0, 1], [0, -0.4])]);
  const delta = new AnimationClip('flinch', 0.5, [rotX('Head', [0, 0.5], [0, 0.2])]);

  it('lists only the named animations, in file order, with their extras', async () => {
    const buf = await packGlb([other, wanted, delta], { flinch: { delta: true, fps: 30 }, 'walk_all@4': { groundSpeed: 80 } });
    const cut = filterGlbAnimations(buf, new Set(['walk_all@4', 'flinch', 'not_in_the_file']))!;
    expect(cut.kept.map((k) => k.name)).toEqual(['walk_all@4', 'flinch']);
    expect(cut.kept[0].extras.groundSpeed).toBe(80);
    expect(cut.kept[1].extras.delta).toBe(true);
  });

  it('yields a GLB that parses to exactly those clips, and is has a much smaller JSON chunk than the pack', async () => {
    const buf = await packGlb([other, wanted], {}, 60);
    const cut = filterGlbAnimations(buf, new Set(['walk_all@4']))!;
    const gltf = await new GLTFLoader().parseAsync(cut.buffer, '');
    expect(gltf.animations.map((a) => a.name)).toEqual(['walk_all@4']);
    expect(gltf.animations[0].userData.fps).toBe(30);
    // the binary chunk is carried over untouched; the JSON lost 61 animations and the scene's sequence table
    expect(new DataView(cut.buffer).getUint32(12, true)).toBeLessThan(new DataView(buf).getUint32(12, true) * 0.7);
    expect(gltf.scene.userData.sequences).toBeUndefined();
  });

  it('drops the accessors and buffer views that nothing left reads (a real pack lists ~50 000 of them)', async () => {
    const jsonOf = (b: ArrayBuffer) =>
      JSON.parse(new TextDecoder().decode(new Uint8Array(b, 20, new DataView(b).getUint32(12, true)))) as { accessors: unknown[]; bufferViews: unknown[]; animations: unknown[] };
    const buf = await packGlb([wanted, other], {}, 60);
    const before = jsonOf(buf);
    const after = jsonOf(filterGlbAnimations(buf, new Set(['walk_all@4']))!.buffer);
    expect(after.animations).toHaveLength(1);
    expect(after.accessors.length).toBeLessThan(before.accessors.length / 10);
    expect(after.bufferViews.length).toBeLessThan(before.bufferViews.length / 10);
  });

  it('keeps the animation data of the kept clip intact (same keys, same values)', async () => {
    const buf = await packGlb([wanted]);
    const cut = filterGlbAnimations(buf, new Set(['walk_all@4']))!;
    const gltf = await new GLTFLoader().parseAsync(cut.buffer, '');
    const t = gltf.animations[0].tracks.find((x) => x.name === 'Spine.quaternion')!;
    expect(Array.from(t.times)).toEqual([0, 1]);
    expect(new Quaternion().fromArray(t.values, 4).angleTo(q(0.4))).toBeLessThan(1e-3);
  });

  it.each([
    ['not a glb', () => new TextEncoder().encode('<html>nope, this is a page, not a model</html>').buffer as ArrayBuffer],
    ['too short', () => new ArrayBuffer(8)],
    ['a glTF with a corrupt JSON chunk', () => {
      const b = new Uint8Array(64);
      const v = new DataView(b.buffer);
      v.setUint32(0, 0x46546c67, true);
      v.setUint32(4, 2, true);
      v.setUint32(8, 64, true);
      v.setUint32(12, 40, true);
      v.setUint32(16, 0x4e4f534a, true);
      b.fill(0x7b, 20, 60);
      return b.buffer;
    }],
  ])('answers null for %s', (_n, make) => {
    expect(filterGlbAnimations(make(), new Set(['x']))).toBeNull();
  });
});

describe('trimClip: a window cut out of a longer sequence', () => {
  const clip = new AnimationClip('long', 3, [
    rotX('Spine', [0, 1, 2, 3], [0, 1, 2, 3]),
    // all its keys fall outside the window: it must still hold its pose there
    rotX('Head', [0, 3], [0, 3]),
  ]);

  it('starts at 0, lasts the window, and its ends are the source poses at those times', () => {
    const w = trimClip(clip, 'win', 0.5, 2.5);
    expect(w.name).toBe('win');
    expect(w.duration).toBeCloseTo(2, 6);
    const spine = w.tracks.find((t) => t.name === 'Spine.quaternion')!;
    expect(Array.from(spine.times).map((t) => +t.toFixed(3))).toEqual([0, 0.5, 1.5, 2]);
    expect(new Quaternion().fromArray(spine.values, 0).angleTo(q(0.5))).toBeLessThan(1e-3);
    expect(new Quaternion().fromArray(spine.values, 12).angleTo(q(2.5))).toBeLessThan(1e-3);
  });

  it('keeps a bone whose keys all lie outside the window, sampled at both ends', () => {
    const head = trimClip(clip, 'win', 1, 2).tracks.find((t) => t.name === 'Head.quaternion')!;
    expect(head.times.length).toBe(2);
    expect(new Quaternion().fromArray(head.values, 0).angleTo(q(1))).toBeLessThan(1e-3);
    expect(new Quaternion().fromArray(head.values, 4).angleTo(q(2))).toBeLessThan(1e-3);
  });

  it('survives a window past the end or a zero-length one', () => {
    expect(trimClip(clip, 'a', 2.5, 99).duration).toBeGreaterThan(0);
    expect(trimClip(clip, 'b', 1, 1).duration).toBeGreaterThan(0);
  });
});

describe('keepInPlace: the pelvis does not walk away from the figure', () => {
  const root = new Set(['Hips']);
  // Travels 2 m in z over 1 s (root motion), sways 3 cm in x and bounces in y.
  const travel = () =>
    new AnimationClip('walk', 1, [
      pos('Hips', [0, 0.5, 1], [0, 0.9, 0, 0.03, 0.95, 1, 0, 0.9, 2]),
      pos('LegL', [0, 1], [0.1, 0, 0, 0.1, 0, 5]),
    ]);

  it('removes the straight-line travel in x/z and keeps the bounce and the sway', () => {
    const c = travel();
    const removed = keepInPlace(c, root);
    expect(removed).toBeCloseTo(2, 6);
    const v = c.tracks.find((t) => t.name === 'Hips.position')!.values;
    // first and last horizontal positions agree
    expect(v[6]).toBeCloseTo(v[0], 6);
    expect(v[8]).toBeCloseTo(v[2], 6);
    // y untouched, the mid-sample's sway survives (x = 0.03, z back on the line = 0)
    expect([v[1], v[4], v[7]]).toEqual([expect.closeTo(0.9, 6), expect.closeTo(0.95, 6), expect.closeTo(0.9, 6)]);
    expect(v[3]).toBeCloseTo(0.03, 6);
    expect(v[5]).toBeCloseTo(0, 6);
  });

  it('leaves non-root bones and drift under a centimetre alone', () => {
    const c = travel();
    keepInPlace(c, root);
    const leg = c.tracks.find((t) => t.name === 'LegL.position')!.values;
    expect(leg[5]).toBe(5);
    const still = new AnimationClip('idle', 1, [pos('Hips', [0, 1], [0, 0.9, 0, 0.004, 0.9, 0.004])]);
    expect(keepInPlace(still, root)).toBe(0);
    expect(still.tracks[0].values[3]).toBeCloseTo(0.004, 6);
  });
});

describe('rebaseDelta: an additive layer becomes a full-body pose', () => {
  const bone = (name: string, x: number) => {
    const b = Object.assign(new Bone(), { name });
    b.quaternion.copy(q(x));
    return b;
  };
  const nodes = new Map([['Hips', bone('Hips', 0.1)], ['Spine', bone('Spine', 0.2)], ['Head', bone('Head', 0.3)]]);
  nodes.get('Hips')!.position.set(0, 0.9, 0);
  const base = capturePose(nodes.values());

  it('composes delta * base per Source, adds the translation, and holds untouched bones at the base pose', () => {
    const delta = new AnimationClip('flinch', 0.5, [rotX('Spine', [0, 0.25, 0.5], [0, 0.6, 0]), pos('Hips', [0, 0.5], [0, 0, 0, 0, -0.1, 0])]);
    const out = rebaseDelta(delta, 'hurt', base, new Set(['Hips']));
    expect(out.name).toBe('hurt');
    expect(out.duration).toBe(0.5);
    const byName = new Map(out.tracks.map((t) => [t.name, t]));
    // every bone has a rotation track
    for (const n of ['Hips', 'Spine', 'Head']) expect(byName.has(`${n}.quaternion`)).toBe(true);
    const spine = byName.get('Spine.quaternion')!;
    const mid = new Quaternion().fromArray(spine.values, 4);
    expect(mid.angleTo(q(0.6).multiply(q(0.2)))).toBeLessThan(1e-3);
    expect(new Quaternion().fromArray(spine.values, 0).angleTo(q(0.2))).toBeLessThan(1e-3); // delta 0 → the base pose
    expect(new Quaternion().fromArray(byName.get('Head.quaternion')!.values, 0).angleTo(q(0.3))).toBeLessThan(1e-6);
    const hips = byName.get('Hips.position')!.values;
    expect(hips[1]).toBeCloseTo(0.9, 6);
    expect(hips[4]).toBeCloseTo(0.8, 6);
  });

  it('gives the root a held position even when the layer does not move it', () => {
    const delta = new AnimationClip('d', 0.5, [rotX('Spine', [0, 0.5], [0, 0.3])]);
    const out = rebaseDelta(delta, 'x', base, new Set(['Hips']));
    expect(out.tracks.find((t) => t.name === 'Hips.position')!.values[1]).toBeCloseTo(0.9, 6);
  });
});

describe('poses and node names', () => {
  it('applyClipPose puts nodes in a clip’s pose at a time, and restorePose puts them back', () => {
    const { scene } = buildFixture();
    const nodes = new Map<string, Bone>();
    scene.traverse((o) => {
      if ((o as Bone).isBone) nodes.set(o.name, o as Bone);
    });
    const before = capturePose(nodes.values());
    const clip = new AnimationClip('c', 2, [rotX('ArmL', [0, 2], [0, 1])]);
    applyClipPose(nodes, clip, 1);
    expect(nodes.get('ArmL')!.quaternion.angleTo(q(0.5))).toBeLessThan(1e-3);
    expect(nodes.get('ArmR')!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    restorePose(nodes, before);
    expect(nodes.get('ArmL')!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });

  it('onlyNodes drops tracks for bones the mesh lacks and keeps userData', () => {
    const c = new AnimationClip('c', 1, [rotX('Spine', [0, 1], [0, 1]), rotX('ghost_bone', [0, 1], [0, 1])]);
    c.userData = { fps: 12 };
    const out = onlyNodes(c, new Set(['Spine']), 'renamed');
    expect(out.name).toBe('renamed');
    expect(out.tracks.map((t) => t.name)).toEqual(['Spine.quaternion']);
    expect(out.userData.fps).toBe(12);
    expect(clipBytes(out)).toBeGreaterThan(0);
  });

  it('nodeName is what three calls Source’s dotted bone names; poseDuration never returns 0', () => {
    expect(nodeName('valvebiped.bip01_r_hand')).toBe('valvebipedbip01_r_hand');
    expect(nodeName('bip_hand_r')).toBe('bip_hand_r');
    expect(poseDuration({ fps: 30, frames: 61 })).toBeCloseTo(2, 6);
    expect(poseDuration({ fps: 30, frames: 1 })).toBeGreaterThan(0);
    expect(poseDuration({})).toBeGreaterThan(0);
  });
});
