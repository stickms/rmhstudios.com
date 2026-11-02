/**
 * The model catalog (plan H2.4): one table, `HARMONIC_MODELS`, keyed by model path
 * (`models/harmonic/<name>.mdl`), pairing each procedural builder with its `SpModelInfo`.
 *
 * Render side — imports three. The simulation reads only `info.ts` (pure).
 *
 * Paths and clips (H1.3 / H2.2 / H2.3 use these):
 *   characters   meridian_trooper meridian_shield unstrung_drifter ines lind_old
 *                clips idle walk run aim fire reload die hurt; attachments muzzle (armed), eyes
 *   world guns   w_prybar w_pulse_pistol w_coil_rifle w_tuner (rigid; attachment muzzle / tines)
 *   view models  v_prybar v_pulse_pistol v_coil_rifle v_tuner; clips draw idle fire reload
 *   props        crate locker heater antenna_mast lamp_post oil_drum
 */
import { Matrix4, Vector3 } from 'three';
import type { SpModelInfo } from '../../../sp-game/assets';
import { CHARACTER_BUILDERS } from './characters';
import { HARMONIC_MODEL_INFO, MODEL_SPECS, modelPath, type ModelSpec } from './info';
import { assemble, sourceBasis, U, type ModelObject } from './parts';
import { PROP_BUILDERS } from './props';
import { VIEWMODEL_BUILDERS } from './viewmodels';
import { WEAPON_MATS, WEAPON_MUZZLE, WEAPON_PARTS, type WeaponName } from './weapons';

function worldWeapon(weapon: WeaponName): ModelObject {
  const name = `w_${weapon}`;
  const { root } = assemble(name, WEAPON_PARTS[weapon], WEAPON_MATS);
  const spec = MODEL_SPECS.find((s) => s.name === name)!;
  const at = WEAPON_MUZZLE[weapon];
  const m = sourceBasis(
    new Vector3(0, 0, 1),
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(at.x * U, at.y * U, at.z * U),
  );
  root.userData = {
    skinned: false,
    attachments: [
      {
        name: weapon === 'tuner' ? 'tines' : 'muzzle',
        bone: 'root',
        local: new Matrix4().copy(m).toArray(),
      },
    ].filter((a) => spec.attachments.includes(a.name)),
  };
  return root;
}

const WORLD_BUILDERS: Record<string, () => ModelObject> = {
  w_prybar: () => worldWeapon('prybar'),
  w_pulse_pistol: () => worldWeapon('pulse_pistol'),
  w_coil_rifle: () => worldWeapon('coil_rifle'),
  w_tuner: () => worldWeapon('tuner'),
};

/** Attachments of props (three axes, units): a heat source, a light. */
const PROP_ATTACHMENTS: Record<string, Array<{ name: string; at: [number, number, number] }>> = {
  heater: [{ name: 'warmth', at: [0, 16, 12] }],
  lamp_post: [{ name: 'light', at: [0, 138, 24] }],
};

const BUILDERS: Record<string, () => ModelObject> = {
  ...CHARACTER_BUILDERS,
  ...WORLD_BUILDERS,
  ...VIEWMODEL_BUILDERS,
  ...PROP_BUILDERS,
};

export interface HarmonicModel {
  name: string;
  path: string;
  spec: ModelSpec;
  info: SpModelInfo;
  /** A fresh Object3D (scene + `animations` + `userData` extras) each call. */
  build(): ModelObject;
}

/** The catalog: model path → builder + `SpModelInfo`. */
export const HARMONIC_MODELS: Readonly<Record<string, HarmonicModel>> = Object.fromEntries(
  MODEL_SPECS.map((spec) => {
    const builder = BUILDERS[spec.name];
    if (!builder) throw new Error(`no builder for ${spec.name}`);
    const model: HarmonicModel = {
      name: spec.name,
      path: modelPath(spec.name),
      spec,
      info: HARMONIC_MODEL_INFO.get(spec.path)!,
      build: () => {
        const root = builder();
        root.userData = {
          ...root.userData,
          sequences: spec.clips.map((c) => ({
            name: c.name,
            looping: c.looping,
            delta: false,
            post: false,
            fps: 30,
            frames: Math.round(c.duration * 30) + 1,
            clips: [c.name],
            activity: c.activity,
          })),
          activities: Object.fromEntries(
            spec.clips.map((c) => [c.activity, [{ seq: c.name, weight: 1 }]]),
          ),
        };
        const extra = PROP_ATTACHMENTS[spec.name];
        if (extra) {
          root.userData.attachments = extra.map((e) => ({
            name: e.name,
            bone: 'root',
            local: sourceBasis(
              new Vector3(0, 0, 1),
              new Vector3(1, 0, 0),
              new Vector3(0, 1, 0),
              new Vector3(e.at[0] * U, e.at[1] * U, e.at[2] * U),
            ).toArray(),
          }));
        }
        if (!root.userData.source) {
          root.userData.source = {
            hullMin: [...spec.mins],
            hullMax: [...spec.maxs],
            clipFrame: [0, 1, 0, 0, 0, 1, 1, 0, 0],
          };
        }
        return root;
      },
    };
    return [spec.path, model];
  }),
);
