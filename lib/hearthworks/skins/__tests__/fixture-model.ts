/**
 * A small skinned, animated character built in code, for tests and for the browser harness. Not a Valve asset and
 * not shipped: a boxy 1.8 m person with a 8-bone skeleton, a nose on +Z so its facing is visible, and ten clips that
 * move bones the way the real ones would (legs swing for walk/run, arms up for jump, collapse for death).
 */

import {
  AnimationClip,
  Bone,
  BufferAttribute,
  BoxGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  VectorKeyframeTrack,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ClipNames, ModelEntry } from '../model-manifest';

export const FIXTURE_HEIGHT = 1.8;

const BONES = ['Hips', 'Spine', 'Head', 'LegL', 'LegR', 'ArmL', 'ArmR', 'HandR'] as const;
type BoneName = (typeof BONES)[number];

/** The animation names inside the fixture (what the animator is handed once a model is loaded). */
export const FIXTURE_CLIPS = {
  clips: {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    jump: 'Jump',
    fall: 'Fall',
    shoot: 'Shoot',
    reload: 'Reload',
    hurt: 'Hurt',
    death: 'Death',
    interact: 'Interact',
  },
} satisfies { clips: ClipNames };

/** The same model with only the two required clips. */
export const MINIMAL_CLIPS = { clips: { idle: 'Idle', walk: 'Walk' } } satisfies { clips: ClipNames };

/** A manifest entry (v2) that names the fixture's clips; the fixture stands in for `models/fixture.mdl` of the `hl2` channel. */
export const FIXTURE_ENTRY: ModelEntry = {
  game: 'hl2',
  mdl: 'models/fixture.mdl',
  skin: 0,
  height: FIXTURE_HEIGHT,
  yaw: 0,
  handBone: 'HandR',
  provenance: 'steam-r2',
  clips: {
    idle: { clip: 'Idle' },
    walk: { clip: 'Walk' },
    run: { clip: 'Run' },
    jump: { clip: 'Jump' },
    fall: { clip: 'Fall' },
    shoot: { clip: 'Shoot' },
    reload: { clip: 'Reload' },
    hurt: { clip: 'Hurt' },
    death: { clip: 'Death' },
    interact: { clip: 'Interact' },
  },
};

/** The same entry with only the two required clips. */
export const MINIMAL_ENTRY: ModelEntry = { ...FIXTURE_ENTRY, clips: { idle: { clip: 'Idle' }, walk: { clip: 'Walk' } } };

function part(
  bone: BoneName,
  size: [number, number, number],
  at: [number, number, number],
  color: string,
): BufferGeometry {
  const g = new BoxGeometry(...size);
  g.translate(...at);
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  const c = new Color(color);
  const b = BONES.indexOf(bone);
  for (let i = 0; i < n; i++) {
    idx[i * 4] = b;
    wt[i * 4] = 1;
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('skinIndex', new BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new BufferAttribute(wt, 4));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

const q = (x: number, y = 0, z = 0) => new Quaternion().setFromEuler(new Euler(x, y, z));

/** A quaternion track from keyframes of an X rotation. */
function rotX(bone: BoneName, times: number[], angles: number[]) {
  const values: number[] = [];
  for (const a of angles) values.push(...q(a).toArray());
  return new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

function clips(): AnimationClip[] {
  const cyc = (d: number) => [0, d * 0.25, d * 0.5, d * 0.75, d];
  const swing = (a: number) => [a, 0, -a, 0, a];
  const gait = (d: number, leg: number, arm: number, lean: number) =>
    new AnimationClip(d === 1 ? 'Walk' : 'Run', d, [
      rotX('LegL', cyc(d), swing(leg)),
      rotX('LegR', cyc(d), swing(-leg)),
      rotX('ArmL', cyc(d), swing(-arm)),
      rotX('ArmR', cyc(d), swing(arm)),
      rotX('Spine', cyc(d), [lean, lean, lean, lean, lean]),
    ]);
  return [
    new AnimationClip('Idle', 2, [
      rotX('Spine', [0, 1, 2], [0, 0.04, 0]),
      rotX('Head', [0, 1, 2], [0, -0.03, 0]),
      rotX('ArmL', [0, 1, 2], [0.02, 0.06, 0.02]),
    ]),
    gait(1, 0.6, 0.5, 0.05),
    gait(0.7, 1.0, 0.95, 0.22),
    new AnimationClip('Jump', 0.8, [
      rotX('LegL', [0, 0.3, 0.8], [0, -0.9, -0.4]),
      rotX('LegR', [0, 0.3, 0.8], [0, -0.6, -0.2]),
      rotX('ArmL', [0, 0.3, 0.8], [0, -2.6, -1.8]),
      rotX('ArmR', [0, 0.3, 0.8], [0, -2.6, -1.8]),
    ]),
    new AnimationClip('Fall', 0.6, [
      rotX('LegL', [0, 0.3, 0.6], [-0.3, 0.2, -0.3]),
      rotX('LegR', [0, 0.3, 0.6], [0.2, -0.3, 0.2]),
      rotX('ArmL', [0, 0.3, 0.6], [-2.6, -2.3, -2.6]),
      rotX('ArmR', [0, 0.3, 0.6], [-2.3, -2.6, -2.3]),
    ]),
    new AnimationClip('Shoot', 0.5, [
      rotX('ArmR', [0, 0.1, 0.18, 0.5], [0, -1.55, -1.7, 0]),
      rotX('Spine', [0, 0.1, 0.5], [0, -0.1, 0]),
    ]),
    new AnimationClip('Reload', 1.2, [
      rotX('ArmR', [0, 0.3, 0.9, 1.2], [0, -1.0, -1.0, 0]),
      rotX('ArmL', [0, 0.3, 0.9, 1.2], [0, -1.3, -1.3, 0]),
    ]),
    new AnimationClip('Hurt', 0.5, [rotX('Spine', [0, 0.12, 0.5], [0, -0.45, 0]), rotX('Head', [0, 0.12, 0.5], [0, 0.3, 0])]),
    new AnimationClip('Death', 1.2, [
      rotX('Hips', [0, 1.0, 1.2], [0, -1.35, -1.5708]),
      new VectorKeyframeTrack('Hips.position', [0, 1.0, 1.2], [0, 0.95, 0, 0, 0.3, 0, 0, 0.18, 0]),
    ]),
    new AnimationClip('Interact', 1, [rotX('ArmR', [0, 0.4, 1], [0, -1.2, 0]), rotX('Spine', [0, 0.4, 1], [0, 0.35, 0])]),
  ];
}

export interface Fixture {
  scene: Group;
  animations: AnimationClip[];
}

/** A fresh copy of the fixture model every call (tests mutate and dispose what they get); `suit` tints the torso and arms. */
export function buildFixture(suit = '#5fb8b2'): Fixture {
  const bones = Object.fromEntries(BONES.map((n) => [n, Object.assign(new Bone(), { name: n })])) as Record<BoneName, Bone>;
  bones.Hips.position.set(0, 0.95, 0);
  bones.Spine.position.set(0, 0.3, 0);
  bones.Head.position.set(0, 0.3, 0);
  bones.LegL.position.set(0.12, 0, 0);
  bones.LegR.position.set(-0.12, 0, 0);
  bones.ArmL.position.set(0.28, 0.25, 0);
  bones.ArmR.position.set(-0.28, 0.25, 0);
  bones.HandR.position.set(0, -0.6, 0);
  bones.Hips.add(bones.Spine, bones.LegL, bones.LegR);
  bones.Spine.add(bones.Head, bones.ArmL, bones.ArmR);
  bones.ArmR.add(bones.HandR);
  // Hips is the skeleton root and sits at hip height: bone positions above are relative, geometry below is in model space.
  const geometry = mergeGeometries([
    part('Hips', [0.36, 0.2, 0.22], [0, 0.95, 0], '#4a6a8a'),
    part('Spine', [0.4, 0.6, 0.22], [0, 1.25, 0], suit),
    part('Head', [0.22, 0.3, 0.22], [0, 1.65, 0], '#ffc9c0'),
    part('Head', [0.06, 0.06, 0.08], [0, 1.65, 0.14], '#ff9a8a'),
    part('LegL', [0.16, 0.95, 0.16], [0.12, 0.475, 0], '#33485c'),
    part('LegR', [0.16, 0.95, 0.16], [-0.12, 0.475, 0], '#33485c'),
    part('ArmL', [0.1, 0.6, 0.1], [0.28, 1.2, 0], suit),
    part('ArmR', [0.1, 0.6, 0.1], [-0.28, 1.2, 0], suit),
    part('HandR', [0.1, 0.1, 0.1], [-0.28, 0.85, 0], '#ffc9c0'),
  ])!;
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = 'Body';
  const scene = new Group();
  scene.add(bones.Hips, mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new Skeleton(BONES.map((n) => bones[n])));
  return { scene, animations: clips() };
}
