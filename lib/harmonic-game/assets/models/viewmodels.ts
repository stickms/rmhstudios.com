/**
 * First-person view models (plan H2.4): each weapon with simple arms — jacket sleeves and dark
 * gloves — on a four-bone rig (`vm_root`, `gun`, `hand_r`, `hand_l`). Clips: draw, idle, fire,
 * reload. The model's origin is the eye: the weapon sits low and to the right (-X is right),
 * muzzle toward +Z, in the renderer's model frame.
 */
import {
  AnimationClip,
  Euler,
  Matrix4,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { mixRgb, PALETTE } from '../palette';
import { MODEL_FPS, MODEL_SPECS, VIEW_CLIPS, modelPath } from './info';
import {
  assemble,
  segment,
  sourceBasis,
  U,
  type BoneDef,
  type MatDef,
  type ModelObject,
  type Part,
} from './parts';
import { WEAPON_MATS, WEAPON_MUZZLE, WEAPON_PARTS, type WeaponName } from './weapons';

const VIEW_MATS: Record<string, MatDef> = {
  ...WEAPON_MATS,
  sleeve: { rgb: mixRgb(PALETTE.steelMid, PALETTE.iceDeep, 0.26) },
  cuff: { rgb: PALETTE.steelDark },
  glove: { rgb: PALETTE.deckDark },
};

interface Layout {
  /** Grip position relative to the eye, units. */
  gun: [number, number, number];
  /** Weapon orientation, Euler degrees. */
  tilt: [number, number, number];
  /** Hands relative to the grip, weapon space (before tilt). */
  right: [number, number, number];
  left: [number, number, number];
}

const LAYOUTS: Record<WeaponName, Layout> = {
  prybar: { gun: [-5.2, -5, 17], tilt: [-38, 8, 0], right: [0, -0.2, -2], left: [0, -0.2, 4] },
  pulse_pistol: {
    gun: [-4.6, -3.8, 22],
    tilt: [0, 7, 0],
    right: [0, -3.4, -0.6],
    left: [3.4, -4.4, 0.4],
  },
  coil_rifle: {
    gun: [-5.8, -4.4, 32],
    tilt: [0, 5, 0],
    right: [0, -4.4, -0.8],
    left: [0.4, -3.2, 10.5],
  },
  tuner: { gun: [-4.6, -4.4, 22], tilt: [-10, 8, 0], right: [0, 0, -4.6], left: [3.8, -4.6, 3.6] },
};

const tiltMatrix = (t: readonly [number, number, number]): Matrix4 =>
  new Matrix4().makeRotationFromEuler(
    new Euler((t[0] * Math.PI) / 180, (t[1] * Math.PI) / 180, (t[2] * Math.PI) / 180, 'XYZ'),
  );

const eulerQ = (x: number, y: number, z: number): Quaternion =>
  new Quaternion().setFromEuler(
    new Euler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180, 'XYZ'),
  );

const smooth = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** Offsets of the gun bone (units, euler degrees) and of the support hand, at time t. */
function sample(
  weapon: WeaponName,
  clip: string,
  t: number,
  dur: number,
): { pos: Vector3; rot: [number, number, number]; hand: Vector3 } {
  const u = t / dur;
  const pos = new Vector3();
  const rot: [number, number, number] = [0, 0, 0];
  const hand = new Vector3();
  const melee = weapon === 'prybar';
  switch (clip) {
    case 'draw': {
      const k = 1 - smooth(u);
      pos.set(0.6 * k, -9 * k, -3 * k);
      rot[0] = 38 * k;
      rot[2] = -10 * k;
      hand.set(0, -4 * k, 0);
      break;
    }
    case 'idle': {
      const f = u * Math.PI * 2;
      pos.set(
        0.14 * Math.sin(f),
        0.2 * Math.sin(f * 1) - 0.06 * Math.cos(2 * f),
        0.05 * Math.sin(f),
      );
      rot[0] = 0.5 * Math.sin(f);
      rot[1] = 0.3 * Math.cos(f);
      break;
    }
    case 'fire': {
      if (melee) {
        // Raise, then swing across and down, then recover.
        const raise = smooth(u / 0.3);
        const strike = smooth((u - 0.3) / 0.25);
        const back = smooth((u - 0.6) / 0.4);
        const a = raise * (1 - strike) + strike * (1 - back);
        rot[0] = -(40 * raise - 90 * strike) * (1 - back) - 0 * a;
        rot[2] = 22 * raise * (1 - back) - 40 * strike * (1 - back);
        pos.set(
          -2 * strike * (1 - back),
          1.5 * raise * (1 - strike) - 2.5 * strike * (1 - back),
          3 * strike * (1 - back),
        );
      } else if (weapon === 'tuner') {
        const k = Math.exp(-t * 10);
        pos.set(0, 0, 1.2 * Math.sin(Math.min(1, u * 2) * Math.PI) * 0.6);
        rot[2] = 2.2 * k * Math.sin(t * 90);
        rot[1] = 1.6 * k * Math.sin(t * 70);
      } else {
        const k = Math.exp(-t * 18);
        pos.set(0, 0.5 * k, -2.6 * k);
        rot[0] = -(weapon === 'coil_rifle' ? 4.5 : 7) * k;
      }
      break;
    }
    case 'reload': {
      if (melee) {
        const k = Math.sin(smooth(u) * Math.PI);
        rot[2] = 360 * smooth(u * 1.2);
        pos.set(0, 1 * k, 1.5 * k);
        rot[0] = -14 * k;
      } else if (weapon === 'tuner') {
        const k = Math.sin(smooth(u) * Math.PI);
        rot[0] = -22 * k;
        rot[2] = 34 * k * Math.sin(u * Math.PI * 4);
        pos.set(0, -1 * k, 0);
        hand.set(-1 * k, 2 * k, 0);
      } else {
        // Drop the gun, tilt it toward the body, bring the support hand to the magazine, return.
        const down = smooth(u / 0.22) * (1 - smooth((u - 0.78) / 0.22));
        const swap = smooth((u - 0.25) / 0.2) * (1 - smooth((u - 0.6) / 0.15));
        pos.set(0.8 * down, -3.4 * down, -1.6 * down);
        rot[0] = 24 * down;
        rot[2] = -26 * down;
        const wig = Math.sin(u * 40) * 0.3 * swap;
        hand.set((-2.8 + wig) * swap, -6.4 * swap, -7.5 * swap);
      }
      break;
    }
  }
  return { pos, rot, hand };
}

function buildClips(weapon: WeaponName, layout: Layout): AnimationClip[] {
  const gunBind = new Vector3(...layout.gun);
  return VIEW_CLIPS.map((spec) => {
    const frames = Math.round(spec.duration * MODEL_FPS) + 1;
    const times = new Float32Array(frames);
    const gp = new Float32Array(frames * 3);
    const gq = new Float32Array(frames * 4);
    const hp = new Float32Array(frames * 3);
    const lp = new Vector3(...layout.left).applyMatrix4(tiltMatrix(layout.tilt)); // hand_l local to gun, bound
    const prev = new Quaternion();
    for (let i = 0; i < frames; i++) {
      const t = i / MODEL_FPS;
      times[i] = t;
      const s = sample(weapon, spec.name, spec.looping && i === frames - 1 ? 0 : t, spec.duration);
      gp[i * 3] = (gunBind.x + s.pos.x) * U;
      gp[i * 3 + 1] = (gunBind.y + s.pos.y) * U;
      gp[i * 3 + 2] = (gunBind.z + s.pos.z) * U;
      const q = eulerQ(...s.rot);
      if (i > 0 && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev.copy(q);
      q.toArray(gq, i * 4);
      hp[i * 3] = (lp.x + s.hand.x) * U;
      hp[i * 3 + 1] = (lp.y + s.hand.y) * U;
      hp[i * 3 + 2] = (lp.z + s.hand.z) * U;
    }
    const clip = new AnimationClip(spec.name, spec.duration, [
      new VectorKeyframeTrack('gun.position', times, gp),
      new QuaternionKeyframeTrack('gun.quaternion', times, gq),
      new VectorKeyframeTrack('hand_l.position', times, hp),
    ]);
    clip.userData = { fps: MODEL_FPS, frames };
    return clip;
  });
}

function buildView(weapon: WeaponName): ModelObject {
  const name = `v_${weapon}`;
  const layout = LAYOUTS[weapon];
  const tilt = tiltMatrix(layout.tilt);
  const toGun = (v: readonly [number, number, number]): Vector3 =>
    new Vector3(...v).applyMatrix4(tilt);
  const bones: BoneDef[] = [
    { name: 'vm_root', parent: null, pos: [0, 0, 0] },
    { name: 'gun', parent: 'vm_root', pos: layout.gun },
    {
      name: 'hand_r',
      parent: 'gun',
      pos: toGun(layout.right).toArray() as [number, number, number],
    },
    {
      name: 'hand_l',
      parent: 'gun',
      pos: toGun(layout.left).toArray() as [number, number, number],
    },
  ];
  const world = (v: Vector3): Vector3 => v.clone().add(new Vector3(...layout.gun));
  const gunM = new Matrix4()
    .makeTranslation(layout.gun[0], layout.gun[1], layout.gun[2])
    .multiply(tilt);
  const parts: Part[] = WEAPON_PARTS[weapon].map((p) => ({
    ...p,
    bone: 'gun',
    xf: p.xf ? gunM.clone().multiply(p.xf) : gunM,
  }));
  const hr = world(toGun(layout.right));
  const hl = world(toGun(layout.left));
  const arm = (hand: Vector3, side: number, bone: string): Part[] => {
    const elbow = new Vector3(hand.x + side * 4.5, hand.y - 10, hand.z - 15);
    const shoulder = new Vector3(hand.x + side * 10, hand.y - 20, hand.z - 33);
    return [
      {
        shape: 'box',
        c: hand.toArray() as [number, number, number],
        s: [3.6, 3.4, 4.8],
        mat: 'glove',
        bone,
        xf: new Matrix4(),
      },
      segment(
        [hand.x, hand.y + 0.2, hand.z - 2.6],
        [elbow.x, elbow.y, elbow.z],
        2.7,
        'sleeve',
        bone,
      ),
      segment(
        [hand.x, hand.y + 0.1, hand.z - 2.8],
        [hand.x + side * 0.4, hand.y - 0.3, hand.z - 4.6],
        2.5,
        'cuff',
        bone,
      ),
      segment(
        [elbow.x, elbow.y, elbow.z],
        [shoulder.x, shoulder.y, shoulder.z],
        3.4,
        'sleeve',
        bone,
      ),
    ];
  };
  parts.push(...arm(hr, -1, 'hand_r'), ...arm(hl, 1, 'hand_l'));
  const { root } = assemble(name, parts, VIEW_MATS, bones);
  root.animations = buildClips(weapon, layout);
  const spec = MODEL_SPECS.find((s) => s.name === name)!;
  const muzzleLocal = new Matrix4()
    .copy(tilt)
    .multiply(
      sourceBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3()),
    )
    .setPosition(WEAPON_MUZZLE[weapon].clone().applyMatrix4(tilt));
  const local = muzzleLocal.clone();
  local.elements[12] *= U;
  local.elements[13] *= U;
  local.elements[14] *= U;
  root.userData = {
    skinned: true,
    source: {
      hullMin: [...spec.mins],
      hullMax: [...spec.maxs],
      clipFrame: [0, 1, 0, 0, 0, 1, 1, 0, 0],
    },
    attachments: [
      { name: weapon === 'tuner' ? 'tines' : 'muzzle', bone: 'gun', local: local.toArray() },
    ].filter((a) => spec.attachments.includes(a.name)),
    path: modelPath(name),
  };
  return root;
}

export const VIEWMODEL_BUILDERS: Record<string, () => ModelObject> = {
  v_prybar: () => buildView('prybar'),
  v_pulse_pistol: () => buildView('pulse_pistol'),
  v_coil_rifle: () => buildView('coil_rifle'),
  v_tuner: () => buildView('tuner'),
};
