/**
 * The pure half of the model catalog (plan H2.4): paths, bounds, sequences, attachment names and
 * physics hulls as `SpModelInfo`. No three.js, no DOM — importable under Node (the simulation's
 * `SpAssets.model()` reads this). The render side (`catalog.ts`) builds the Object3Ds and its
 * clips from the same `ClipSpec`s, so a sequence name here is always a clip name there.
 *
 * Units: Source units, Source axes (X forward, Y left, Z up). Frame rate 30.
 */
import type { SpModelInfo, SpModelPhysics } from '../../../sp-game/assets';

export const MODEL_FPS = 30;

export interface ClipSpec {
  /** Sequence name == clip name. */
  name: string;
  /** Seconds for one cycle (a multiple of 1/30). */
  duration: number;
  looping: boolean;
  /** The activity the sequence answers to (`ACT_*`). */
  activity: string;
}

/** Character clips (every character plays all eight). */
export const CHARACTER_CLIPS: readonly ClipSpec[] = [
  { name: 'idle', duration: 2, looping: true, activity: 'ACT_IDLE' },
  { name: 'walk', duration: 1, looping: true, activity: 'ACT_WALK' },
  { name: 'run', duration: 0.6, looping: true, activity: 'ACT_RUN' },
  { name: 'aim', duration: 1, looping: true, activity: 'ACT_IDLE_ANGRY' },
  { name: 'fire', duration: 0.3, looping: false, activity: 'ACT_RANGE_ATTACK1' },
  { name: 'reload', duration: 1.8, looping: false, activity: 'ACT_RELOAD' },
  { name: 'die', duration: 1.2, looping: false, activity: 'ACT_DIESIMPLE' },
  { name: 'hurt', duration: 0.4, looping: false, activity: 'ACT_FLINCH_CHEST' },
];

/** View-model clips (every view model plays all four). */
export const VIEW_CLIPS: readonly ClipSpec[] = [
  { name: 'draw', duration: 0.5, looping: false, activity: 'ACT_VM_DRAW' },
  { name: 'idle', duration: 2, looping: true, activity: 'ACT_VM_IDLE' },
  { name: 'fire', duration: 0.3, looping: false, activity: 'ACT_VM_PRIMARYATTACK' },
  { name: 'reload', duration: 1.5, looping: false, activity: 'ACT_VM_RELOAD' },
];

export type ModelKind = 'character' | 'viewmodel' | 'weapon' | 'prop';

export interface ModelSpec {
  name: string;
  /** `models/harmonic/<name>.mdl` */
  path: string;
  kind: ModelKind;
  clips: readonly ClipSpec[];
  /** Source-space hull, units. */
  mins: readonly [number, number, number];
  maxs: readonly [number, number, number];
  surfaceProp: string;
  /** kg; 0 for characters and view models. */
  mass: number;
  /** Attachment points the model defines (`muzzle`, `eyes`, …). */
  attachments: readonly string[];
  /** A box physics hull from the bounds (props). */
  hull: boolean;
}

export const modelPath = (name: string): string => `models/harmonic/${name}.mdl`;

const character = (
  name: string,
  mins: ModelSpec['mins'],
  maxs: ModelSpec['maxs'],
  attachments: string[],
): ModelSpec => ({
  name,
  path: modelPath(name),
  kind: 'character',
  clips: CHARACTER_CLIPS,
  mins,
  maxs,
  surfaceProp: 'default',
  mass: 0,
  attachments,
  hull: false,
});

const view = (
  name: string,
  mins: ModelSpec['mins'],
  maxs: ModelSpec['maxs'],
  attachments: string[],
): ModelSpec => ({
  name,
  path: modelPath(name),
  kind: 'viewmodel',
  clips: VIEW_CLIPS,
  mins,
  maxs,
  surfaceProp: 'default',
  mass: 0,
  attachments,
  hull: false,
});

const weapon = (
  name: string,
  mins: ModelSpec['mins'],
  maxs: ModelSpec['maxs'],
  attachments: string[],
): ModelSpec => ({
  name,
  path: modelPath(name),
  kind: 'weapon',
  clips: [],
  mins,
  maxs,
  surfaceProp: 'metal',
  mass: 3,
  attachments,
  hull: true,
});

const prop = (
  name: string,
  mins: ModelSpec['mins'],
  maxs: ModelSpec['maxs'],
  surfaceProp: string,
  mass: number,
  attachments: string[] = [],
): ModelSpec => ({
  name,
  path: modelPath(name),
  kind: 'prop',
  clips: [],
  mins,
  maxs,
  surfaceProp,
  mass,
  attachments,
  hull: true,
});

/** Bounds are checked against the built geometry by `models.test.ts`. */
export const MODEL_SPECS: readonly ModelSpec[] = [
  // Characters (Source hull around 32 wide, 72 tall; the body is narrower than the hull).
  character('meridian_trooper', [-16, -16, 0], [16, 16, 73], ['muzzle', 'eyes']),
  character('meridian_shield', [-16, -16, 0], [16, 16, 73], ['muzzle', 'eyes']),
  character('unstrung_drifter', [-16, -16, 0], [16, 16, 73], ['eyes']),
  character('ines', [-16, -16, 0], [16, 16, 73], ['eyes']),
  character('lind_old', [-16, -16, 0], [16, 16, 73], ['eyes']),
  // Weapons in the world (origin at the grip, muzzle toward +X).
  weapon('w_prybar', [-22, -3, -3], [28, 3, 6], []),
  weapon('w_pulse_pistol', [-4, -3, -7], [14, 3, 5], ['muzzle']),
  weapon('w_coil_rifle', [-19, -3, -9], [26, 3, 7], ['muzzle']),
  weapon('w_tuner', [-12, -3, -2], [24, 3, 3], ['tines']),
  // View models (origin at the eye; the weapon sits low and right of it).
  view('v_prybar', [-26, -20, -34], [38, 12, 13], []),
  view('v_pulse_pistol', [-26, -20, -34], [38, 12, 13], ['muzzle']),
  view('v_coil_rifle', [-26, -20, -34], [38, 12, 13], ['muzzle']),
  view('v_tuner', [-26, -20, -34], [38, 12, 13], ['tines']),
  // Props (origin at the centre of the base).
  prop('crate', [-17, -17, 0], [17, 17, 32], 'wood', 40),
  prop('locker', [-11, -12, 0], [11, 12, 73], 'metal', 60),
  prop('heater', [-10, -15, 0], [10, 15, 43], 'metal', 50, ['warmth']),
  prop('antenna_mast', [-6, -6, 0], [8, 6, 228], 'metal', 0),
  prop('lamp_post', [-6, -5, 0], [29, 5, 145], 'metal', 0, ['light']),
  prop('oil_drum', [-12, -11, 0], [12, 11, 36], 'metal', 30),
];

const hullOf = (mins: ModelSpec['mins'], maxs: ModelSpec['maxs']): Float32Array =>
  new Float32Array([
    mins[0],
    mins[1],
    mins[2],
    maxs[0],
    mins[1],
    mins[2],
    mins[0],
    maxs[1],
    mins[2],
    maxs[0],
    maxs[1],
    mins[2],
    mins[0],
    mins[1],
    maxs[2],
    maxs[0],
    mins[1],
    maxs[2],
    mins[0],
    maxs[1],
    maxs[2],
    maxs[0],
    maxs[1],
    maxs[2],
  ]);

function infoOf(spec: ModelSpec): SpModelInfo {
  const physics: SpModelPhysics | null = spec.hull
    ? {
        hulls: [hullOf(spec.mins, spec.maxs)],
        mass: spec.mass,
        damping: 0,
        rotDamping: 4,
        inertia: 1,
        surfaceProp: spec.surfaceProp,
        massCenter: {
          x: (spec.mins[0] + spec.maxs[0]) / 2,
          y: (spec.mins[1] + spec.maxs[1]) / 2,
          z: (spec.mins[2] + spec.maxs[2]) / 2,
        },
      }
    : null;
  return {
    path: spec.path,
    mins: { x: spec.mins[0], y: spec.mins[1], z: spec.mins[2] },
    maxs: { x: spec.maxs[0], y: spec.maxs[1], z: spec.maxs[2] },
    surfaceProp: spec.surfaceProp,
    sequences: spec.clips.map((c) => ({
      name: c.name,
      activity: c.activity,
      flags: c.looping ? 1 : 0,
      looping: c.looping,
      fps: MODEL_FPS,
      frames: Math.round(c.duration * MODEL_FPS) + 1,
      duration: c.duration,
      events: [],
      groundSpeed: 0,
    })),
    attachments: [...spec.attachments],
    physics,
    keyValues: '',
  };
}

/** `SpModelInfo` by model path. */
export const HARMONIC_MODEL_INFO: ReadonlyMap<string, SpModelInfo> = new Map(
  MODEL_SPECS.map((s) => [s.path, infoOf(s)]),
);

export const HARMONIC_MODEL_PATHS: readonly string[] = MODEL_SPECS.map((s) => s.path);

/** The info for a model path (`models/harmonic/…`, any case); null when it is not ours. */
export function harmonicModelInfo(path: string): SpModelInfo | null {
  return HARMONIC_MODEL_INFO.get(path.toLowerCase().replace(/\\/g, '/')) ?? null;
}
