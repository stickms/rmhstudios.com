/**
 * The sound bank: every Harmonic sound as pure recipe data (see `types.ts`), built from a seeded
 * RNG so the same (name, variant) is the same sound everywhere. Nothing here touches Web Audio;
 * `dsp.ts` renders, `synth.ts` caches, `player.ts` plays.
 *
 * Tone of the bank (story.md): wind on ice, a ship's steel groaning, a resonance hum. The Unstrung
 * are people out of phase, so their voices are breath and formants that never quite settle.
 * All original synthesis — no sampled or imitated material.
 */
import { mulberry32, seedFor } from './rng';
import type {
  Env,
  FilterSpec,
  Layer,
  ModalLayer,
  NoiseLayer,
  Recipe,
  SoundDef,
  ToneLayer,
} from './types';

// ─── Names ───────────────────────────────────────────────────────────────

export const STEP_SURFACES = [
  'concrete',
  'metal',
  'grating',
  'wood',
  'ice',
  'snow',
  'water',
] as const;
export type StepSurface = (typeof STEP_SURFACES)[number];

/** Surfaces a bullet or a heavy object can strike (the step surfaces plus glass). */
export const IMPACT_SURFACES = [
  'concrete',
  'metal',
  'grating',
  'wood',
  'glass',
  'ice',
  'snow',
  'water',
] as const;
export type ImpactSurface = (typeof IMPACT_SURFACES)[number];

export const AREAS = ['ice_open', 'camp_interior', 'ship_1971', 'ship_2030'] as const;
export type AreaId = (typeof AREAS)[number];

export type StepName = `step.${StepSurface}`;
export type ImpactName = `impact.${ImpactSurface}`;
export type BedName = `bed.${AreaId}`;

export type HarmonicSoundName =
  | StepName
  | ImpactName
  | BedName
  | 'player.jump'
  | 'player.land'
  | 'player.hurt'
  | 'player.death'
  | 'melee.swing'
  | 'melee.hit'
  | 'pulse.fire'
  | 'pulse.reload'
  | 'pulse.empty'
  | 'coil.fire'
  | 'coil.reload'
  | 'coil.empty'
  | 'door.open'
  | 'door.close'
  | 'button.press'
  | 'pickup'
  | 'tuner.shift'
  | 'tuner.listen_on'
  | 'tuner.listen_off'
  | 'tuner.charge_ready'
  | 'unstrung.voice'
  | 'wind.loop'
  | 'wind.gust'
  | 'ship.groan'
  | 'radio.click'
  | 'radio.static'
  | 'misc.soft'
  | 'music.drone'
  | 'music.tone'
  | 'music.pulse';

// ─── Builders ────────────────────────────────────────────────────────────

type Rng = () => number;
const jit = (r: Rng, base: number, frac: number): number => base * (1 + (r() * 2 - 1) * frac);
const lp = (freq: number, q = 0.7, freqEnd?: number): FilterSpec => ({
  type: 'lp',
  freq,
  q,
  freqEnd,
});
const hp = (freq: number, q = 0.7, freqEnd?: number): FilterSpec => ({
  type: 'hp',
  freq,
  q,
  freqEnd,
});
const bp = (freq: number, q = 1, freqEnd?: number): FilterSpec => ({
  type: 'bp',
  freq,
  q,
  freqEnd,
});

function noise(
  at: number,
  env: Env,
  gain: number,
  filters: FilterSpec[],
  color: NoiseLayer['color'] = 'white',
  extra: Partial<NoiseLayer> = {},
): NoiseLayer {
  return { kind: 'noise', color, at, env, gain, filters, ...extra };
}
function tone(
  at: number,
  env: Env,
  gain: number,
  freq: number,
  extra: Partial<ToneLayer> = {},
): ToneLayer {
  return { kind: 'tone', wave: 'sine', at, env, gain, freq, ...extra };
}
function modal(
  at: number,
  gain: number,
  modes: ModalLayer['modes'],
  extra: Partial<ModalLayer> = {},
): ModalLayer {
  return { kind: 'modal', at, env: [0, 0, 0], gain, modes, ...extra };
}
/** Modes at inharmonic ratios (a struck bar / plate): `base` Hz, `decay` the lowest mode's T60. */
function plate(r: Rng, base: number, decay: number, count = 4): ModalLayer['modes'] {
  const ratios = [1, 2.76, 5.4, 8.93, 13.34, 18.64];
  return ratios.slice(0, count).map((k, i) => ({
    freq: jit(r, base * k, 0.015),
    decay: decay / (1 + i * 0.7),
    gain: 1 / (1 + i * 0.8),
  }));
}

function oneShot(
  name: string,
  v: number,
  duration: number,
  layers: Layer[],
  peak = 0.8,
  rate = 44100,
): Recipe {
  return { seed: seedFor(name, v), duration, rate, channels: 1, layers, peak };
}

const rngFor = (name: string, v: number): Rng => mulberry32(seedFor(`${name}/jitter`, v));

// ─── Footsteps ───────────────────────────────────────────────────────────

function step(surface: StepSurface, v: number): Recipe {
  const name = `step.${surface}`;
  const r = rngFor(name, v);
  const heel = tone(0, [0.002, 0, 0.09], 0.9, jit(r, 95, 0.12), { freqEnd: 52 });
  switch (surface) {
    case 'concrete':
      return oneShot(
        name,
        v,
        0.2,
        [
          heel,
          noise(0, [0.001, 0, 0.05], 0.7, [lp(jit(r, 2200, 0.2)), hp(300)], 'pink'),
          noise(0.09, [0.002, 0, 0.04], 0.25, [lp(1600)], 'pink'),
        ],
        0.55,
      );
    case 'metal':
      return oneShot(
        name,
        v,
        0.5,
        [
          heel,
          modal(0, 0.4, plate(r, jit(r, 330, 0.1), 0.3, 4)),
          noise(0, [0.001, 0, 0.02], 0.5, [hp(1800)]),
        ],
        0.55,
      );
    case 'grating':
      return oneShot(
        name,
        v,
        0.55,
        [
          tone(0, [0.002, 0, 0.07], 0.5, jit(r, 110, 0.1), { freqEnd: 60 }),
          modal(0, 0.45, plate(r, jit(r, 520, 0.12), 0.35, 5)),
          noise(0.012, [0.001, 0, 0.12], 0.35, [bp(jit(r, 3400, 0.1), 5)]),
          noise(0.05, [0.001, 0, 0.1], 0.2, [bp(jit(r, 4300, 0.1), 6)]),
        ],
        0.55,
      );
    case 'wood':
      return oneShot(
        name,
        v,
        0.3,
        [
          tone(0, [0.002, 0, 0.08], 0.7, jit(r, 120, 0.1), { freqEnd: 70 }),
          modal(0, 0.5, [
            { freq: jit(r, 190, 0.08), decay: 0.16, gain: 1 },
            { freq: jit(r, 410, 0.08), decay: 0.1, gain: 0.5 },
            { freq: jit(r, 760, 0.08), decay: 0.06, gain: 0.25 },
          ]),
          noise(0, [0.001, 0, 0.03], 0.35, [bp(1200, 1.2)], 'pink'),
        ],
        0.55,
      );
    case 'ice':
      return oneShot(
        name,
        v,
        0.35,
        [
          noise(0, [0.001, 0, 0.035], 0.7, [hp(jit(r, 3200, 0.15)), lp(9000)]),
          tone(0.004, [0.001, 0, 0.12], 0.25, jit(r, 2100, 0.1), { freqEnd: 1400 }),
          tone(0, [0.002, 0, 0.1], 0.5, jit(r, 140, 0.1), { freqEnd: 80 }),
          noise(0.02, [0.02, 0, 0.18], 0.14, [bp(jit(r, 5200, 0.1), 8)]),
        ],
        0.5,
      );
    case 'snow':
      return oneShot(
        name,
        v,
        0.35,
        [
          noise(0, [0.012, 0, 0.12], 0.6, [bp(jit(r, 1300, 0.15), 0.9, 700), lp(3000)], 'pink'),
          noise(0.07, [0.01, 0, 0.1], 0.4, [bp(jit(r, 1700, 0.15), 1.1, 900), lp(3200)], 'pink'),
          tone(0, [0.004, 0, 0.1], 0.35, jit(r, 70, 0.1), { freqEnd: 50 }),
        ],
        0.45,
      );
    case 'water':
      return oneShot(
        name,
        v,
        0.55,
        [
          noise(0, [0.012, 0, 0.3], 0.6, [bp(jit(r, 500, 0.15), 1.6, jit(r, 1500, 0.2))], 'pink'),
          tone(0.04, [0.004, 0, 0.1], 0.3, jit(r, 420, 0.2), { freqEnd: jit(r, 900, 0.2) }),
          tone(0.12, [0.004, 0, 0.08], 0.2, jit(r, 600, 0.2), { freqEnd: jit(r, 1100, 0.2) }),
          tone(0, [0.004, 0, 0.1], 0.4, 85, { freqEnd: 55 }),
        ],
        0.5,
      );
  }
}

// ─── Impacts (bullets, hard objects) ─────────────────────────────────────

function impact(surface: ImpactSurface, v: number): Recipe {
  const name = `impact.${surface}`;
  const r = rngFor(name, v);
  const thump = tone(0, [0.001, 0, 0.1], 0.8, jit(r, 120, 0.1), { freqEnd: 50 });
  switch (surface) {
    case 'concrete':
      return oneShot(
        name,
        v,
        0.3,
        [
          thump,
          noise(0, [0.001, 0, 0.07], 0.9, [bp(jit(r, 2600, 0.2), 0.8)], 'white'),
          noise(0.01, [0.002, 0, 0.15], 0.3, [lp(1200)], 'pink'),
        ],
        0.7,
      );
    case 'metal':
      return oneShot(
        name,
        v,
        0.8,
        [
          modal(0, 0.8, plate(r, jit(r, 620, 0.2), 0.6, 5)),
          noise(0, [0.001, 0, 0.03], 0.9, [hp(2500)]),
          thump,
        ],
        0.7,
      );
    case 'grating':
      return oneShot(
        name,
        v,
        0.8,
        [
          modal(0, 0.7, plate(r, jit(r, 880, 0.15), 0.5, 5)),
          noise(0, [0.001, 0, 0.2], 0.4, [bp(jit(r, 4200, 0.1), 6)]),
          noise(0, [0.001, 0, 0.03], 0.7, [hp(2000)]),
        ],
        0.65,
      );
    case 'wood':
      return oneShot(
        name,
        v,
        0.4,
        [
          modal(0, 0.8, [
            { freq: jit(r, 240, 0.1), decay: 0.2, gain: 1 },
            { freq: jit(r, 520, 0.1), decay: 0.12, gain: 0.6 },
            { freq: jit(r, 1100, 0.1), decay: 0.07, gain: 0.3 },
          ]),
          noise(0, [0.001, 0, 0.04], 0.6, [bp(1800, 1)]),
          thump,
        ],
        0.7,
      );
    case 'glass':
      return oneShot(
        name,
        v,
        0.9,
        [
          modal(0, 0.6, plate(r, jit(r, 1700, 0.15), 0.5, 6)),
          noise(0, [0.001, 0, 0.12], 0.8, [hp(jit(r, 4500, 0.1))]),
          noise(0.04 + r() * 0.05, [0.001, 0, 0.1], 0.4, [hp(6000)]),
        ],
        0.65,
      );
    case 'ice':
      return oneShot(
        name,
        v,
        0.7,
        [
          noise(0, [0.001, 0, 0.06], 0.9, [hp(jit(r, 3500, 0.1))]),
          tone(0.005, [0.001, 0, 0.35], 0.35, jit(r, 1500, 0.1), {
            freqEnd: 600,
            fm: { ratio: 1.4, index: 2, indexEnd: 0 },
          }),
          modal(0, 0.3, plate(r, jit(r, 1100, 0.15), 0.4, 4)),
          thump,
        ],
        0.65,
      );
    case 'snow':
      return oneShot(
        name,
        v,
        0.3,
        [
          noise(0, [0.004, 0, 0.12], 0.8, [lp(2200), hp(250)], 'pink'),
          tone(0, [0.003, 0, 0.1], 0.6, 80, { freqEnd: 45 }),
        ],
        0.5,
      );
    case 'water':
      return oneShot(
        name,
        v,
        0.5,
        [
          noise(0, [0.004, 0, 0.25], 0.7, [bp(jit(r, 900, 0.15), 1.2, 400)], 'pink'),
          tone(0.03, [0.003, 0, 0.12], 0.4, jit(r, 600, 0.15), { freqEnd: 1200 }),
        ],
        0.55,
      );
  }
}

// ─── Player, weapons, world ──────────────────────────────────────────────

function pickupSound(v: number): Recipe {
  const r = rngFor('pickup', v);
  const base = jit(r, 392, 0.03);
  return oneShot(
    'pickup',
    v,
    0.9,
    [
      tone(0, [0.004, 0, 0.5], 0.6, base, { partials: [1, 0.25, 0.1] }),
      tone(0.07, [0.004, 0, 0.6], 0.5, base * 1.5, { partials: [1, 0.2] }),
      modal(0, 0.12, [{ freq: base * 4, decay: 0.5, gain: 1 }]),
    ],
    0.55,
  );
}

/** Harmonic-series partials of the 55 Hz fundamental used for the generative tones. */
export const MUSIC_PARTIALS = [2, 3, 4, 5, 6, 8, 9, 12] as const;

export const SOUND_BANK: Readonly<Record<HarmonicSoundName, SoundDef>> = (() => {
  const bank = {} as Record<HarmonicSoundName, SoundDef>;
  const add = (name: HarmonicSoundName, def: SoundDef): void => {
    bank[name] = def;
  };

  for (const s of STEP_SURFACES) {
    add(`step.${s}`, {
      group: 'sfx',
      variants: 4,
      volume: 0.7,
      positional: true,
      soundlevel: 62,
      build: (v) => step(s, v),
    });
  }
  for (const s of IMPACT_SURFACES) {
    add(`impact.${s}`, {
      group: 'sfx',
      variants: 3,
      volume: 0.9,
      positional: true,
      soundlevel: 80,
      build: (v) => impact(s, v),
    });
  }

  add('player.jump', {
    group: 'sfx',
    variants: 2,
    volume: 0.5,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'player.jump',
        v,
        0.3,
        [
          noise(0, [0.02, 0, 0.16], 0.6, [bp(900, 0.8, 1800), lp(4000)], 'pink'),
          tone(0, [0.004, 0, 0.1], 0.5, 90, { freqEnd: 130 }),
        ],
        0.5,
      ),
  });
  add('player.land', {
    group: 'sfx',
    variants: 3,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    build: (v) => {
      const r = rngFor('player.land', v);
      return oneShot(
        'player.land',
        v,
        0.4,
        [
          tone(0, [0.002, 0, 0.18], 1, jit(r, 80, 0.1), { freqEnd: 38 }),
          noise(0, [0.002, 0, 0.1], 0.6, [lp(900), hp(80)], 'brown'),
          noise(0, [0.001, 0, 0.04], 0.3, [bp(1800, 1)], 'pink'),
        ],
        0.75,
      );
    },
  });
  add('player.hurt', {
    group: 'voice',
    variants: 3,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    build: (v) => {
      const r = rngFor('player.hurt', v);
      return oneShot(
        'player.hurt',
        v,
        0.45,
        [
          {
            kind: 'formant',
            at: 0,
            env: [0.01, 0.06, 0.25],
            gain: 1,
            f0: jit(r, 150, 0.1),
            f0End: 105,
            breath: 0.25,
            formants: [
              { freq: 620, q: 6, gain: 1 },
              { freq: 1100, q: 8, gain: 0.6 },
              { freq: 2500, q: 10, gain: 0.25 },
            ],
          },
          tone(0, [0.002, 0, 0.08], 0.5, 70, { freqEnd: 45 }),
          noise(0, [0.001, 0, 0.04], 0.3, [bp(1000, 0.8)], 'pink'),
        ],
        0.7,
      );
    },
  });
  add('player.death', {
    group: 'voice',
    variants: 1,
    volume: 0.85,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'player.death',
        v,
        2.2,
        [
          {
            kind: 'formant',
            at: 0.05,
            env: [0.04, 0.2, 0.9],
            gain: 1,
            f0: 140,
            f0End: 70,
            breath: 0.4,
            formants: [
              { freq: 520, q: 5, gain: 1 },
              { freq: 900, q: 7, gain: 0.5 },
              { freq: 2300, q: 9, gain: 0.2 },
            ],
          },
          tone(0, [0.004, 0, 0.4], 0.8, 60, { freqEnd: 32 }),
          noise(0.3, [0.4, 0.3, 1.2], 0.25, [lp(500, 0.8, 120)], 'brown'),
        ],
        0.7,
      ),
  });

  add('melee.swing', {
    group: 'sfx',
    variants: 3,
    volume: 0.7,
    positional: true,
    soundlevel: 62,
    build: (v) => {
      const r = rngFor('melee.swing', v);
      return oneShot(
        'melee.swing',
        v,
        0.45,
        [
          noise(
            0,
            [0.09, 0, 0.2],
            0.9,
            [bp(jit(r, 450, 0.15), 1.4, jit(r, 1900, 0.15)), lp(5000)],
            'pink',
          ),
          tone(0.02, [0.08, 0, 0.18], 0.12, jit(r, 330, 0.1), { freqEnd: 200, partials: [1, 0.3] }),
        ],
        0.6,
      );
    },
  });
  add('melee.hit', {
    group: 'sfx',
    variants: 3,
    volume: 0.9,
    positional: true,
    soundlevel: 75,
    build: (v) => {
      const r = rngFor('melee.hit', v);
      return oneShot(
        'melee.hit',
        v,
        0.9,
        [
          modal(0, 0.8, plate(r, jit(r, 410, 0.12), 0.7, 5)),
          tone(0, [0.001, 0, 0.12], 1, jit(r, 100, 0.1), { freqEnd: 45 }),
          noise(0, [0.001, 0, 0.04], 0.8, [bp(2200, 0.7)]),
        ],
        0.8,
      );
    },
  });

  // Pulse pistol: a bright electrical crack and a falling resonance. Coil rifle: a heavy discharge.
  add('pulse.fire', {
    group: 'sfx',
    variants: 3,
    volume: 0.8,
    positional: true,
    soundlevel: 95,
    build: (v) => {
      const r = rngFor('pulse.fire', v);
      return oneShot(
        'pulse.fire',
        v,
        0.4,
        [
          tone(0, [0.001, 0, 0.22], 0.9, jit(r, 1900, 0.06), {
            freqEnd: jit(r, 260, 0.1),
            fm: { ratio: 2.01, index: 5, indexEnd: 0 },
          }),
          noise(0, [0.001, 0, 0.05], 0.9, [hp(1500), lp(9000)]),
          tone(0, [0.001, 0, 0.12], 0.7, 120, { freqEnd: 50 }),
          noise(0.03, [0.002, 0, 0.2], 0.2, [bp(3500, 4, 1200)]),
        ],
        0.85,
      );
    },
  });
  add('pulse.reload', {
    group: 'sfx',
    variants: 2,
    volume: 0.6,
    positional: false,
    soundlevel: 0,
    build: (v) => {
      const r = rngFor('pulse.reload', v);
      return oneShot(
        'pulse.reload',
        v,
        1.2,
        [
          modal(0.05, 0.6, plate(r, 1300, 0.08, 3)),
          tone(0.18, [0.15, 0.1, 0.2], 0.25, 300, { freqEnd: 1100, partials: [1, 0.2] }),
          modal(0.55, 0.7, plate(r, 900, 0.12, 3)),
          noise(0.58, [0.001, 0, 0.04], 0.5, [hp(2500)]),
        ],
        0.6,
      );
    },
  });
  add('pulse.empty', {
    group: 'sfx',
    variants: 1,
    volume: 0.5,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'pulse.empty',
        v,
        0.15,
        [
          modal(0, 0.8, [
            { freq: 1700, decay: 0.05, gain: 1 },
            { freq: 3100, decay: 0.03, gain: 0.4 },
          ]),
          noise(0, [0.001, 0, 0.015], 0.8, [hp(3000)]),
        ],
        0.5,
      ),
  });
  add('coil.fire', {
    group: 'sfx',
    variants: 3,
    volume: 0.95,
    positional: true,
    soundlevel: 105,
    build: (v) => {
      const r = rngFor('coil.fire', v);
      return oneShot(
        'coil.fire',
        v,
        1.1,
        [
          tone(0, [0.002, 0, 0.35], 1, jit(r, 110, 0.05), { freqEnd: 30 }),
          noise(0, [0.002, 0, 0.12], 0.9, [lp(5000, 0.7, 500), hp(60)], 'white'),
          noise(0, [0.001, 0, 0.5], 0.5, [bp(2400, 2.5, 150)], 'pink'),
          tone(0.01, [0.001, 0, 0.25], 0.5, 900, {
            freqEnd: 90,
            fm: { ratio: 1.5, index: 6, indexEnd: 0 },
          }),
          noise(0.1, [0.01, 0, 0.8], 0.2, [lp(700, 0.7, 200)], 'brown'),
        ],
        0.9,
      );
    },
  });
  add('coil.reload', {
    group: 'sfx',
    variants: 2,
    volume: 0.6,
    positional: false,
    soundlevel: 0,
    build: (v) => {
      const r = rngFor('coil.reload', v);
      return oneShot(
        'coil.reload',
        v,
        1.9,
        [
          modal(0.05, 0.7, plate(r, 240, 0.25, 4)),
          tone(0.3, [0.5, 0.2, 0.3], 0.35, 140, { freqEnd: 760, partials: [1, 0.5, 0.25] }),
          noise(0.3, [0.4, 0.2, 0.3], 0.15, [bp(1500, 2, 3500)]),
          modal(1.25, 0.9, plate(r, 190, 0.35, 4)),
          noise(1.25, [0.001, 0, 0.05], 0.5, [lp(1500)], 'pink'),
        ],
        0.65,
      );
    },
  });
  add('coil.empty', {
    group: 'sfx',
    variants: 1,
    volume: 0.5,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'coil.empty',
        v,
        0.2,
        [
          modal(0, 0.8, [
            { freq: 420, decay: 0.09, gain: 1 },
            { freq: 1150, decay: 0.05, gain: 0.5 },
          ]),
          noise(0, [0.001, 0, 0.02], 0.6, [bp(1800, 1)]),
        ],
        0.5,
      ),
  });

  add('door.open', {
    group: 'sfx',
    variants: 2,
    volume: 0.8,
    positional: true,
    soundlevel: 70,
    build: (v) => {
      const r = rngFor('door.open', v);
      return oneShot(
        'door.open',
        v,
        1.6,
        [
          noise(0.02, [0.2, 0.5, 0.6], 0.5, [bp(jit(r, 280, 0.1), 3, 460)], 'pink'),
          tone(0.1, [0.3, 0.4, 0.6], 0.25, jit(r, 95, 0.08), {
            freqEnd: 120,
            wave: 'saw',
            filters: [lp(420, 3)],
          }),
          modal(0, 0.5, plate(r, 160, 0.4, 3)),
          modal(1.1, 0.4, plate(r, 130, 0.3, 3)),
        ],
        0.7,
      );
    },
  });
  add('door.close', {
    group: 'sfx',
    variants: 2,
    volume: 0.85,
    positional: true,
    soundlevel: 72,
    build: (v) => {
      const r = rngFor('door.close', v);
      return oneShot(
        'door.close',
        v,
        1.0,
        [
          noise(0, [0.1, 0.1, 0.3], 0.35, [bp(jit(r, 360, 0.1), 3, 220)], 'pink'),
          tone(0.35, [0.002, 0, 0.2], 1, 70, { freqEnd: 40 }),
          modal(0.35, 0.7, plate(r, 150, 0.5, 4)),
          modal(0.5, 0.3, plate(r, 1200, 0.06, 2)),
          noise(0.35, [0.001, 0, 0.05], 0.5, [lp(1200)], 'pink'),
        ],
        0.75,
      );
    },
  });
  add('button.press', {
    group: 'sfx',
    variants: 2,
    volume: 0.6,
    positional: true,
    soundlevel: 60,
    build: (v) => {
      const r = rngFor('button.press', v);
      return oneShot(
        'button.press',
        v,
        0.3,
        [
          modal(0, 0.7, plate(r, jit(r, 1500, 0.08), 0.07, 2)),
          tone(0.035, [0.002, 0, 0.12], 0.5, jit(r, 210, 0.05), { freqEnd: 150 }),
          noise(0, [0.001, 0, 0.012], 0.7, [hp(2500)]),
        ],
        0.55,
      );
    },
  });
  add('pickup', {
    group: 'sfx',
    variants: 2,
    volume: 0.6,
    positional: false,
    soundlevel: 0,
    build: pickupSound,
  });

  // The Tuner: a resonance fork. Shifting is a swept chord; listening opens and closes a hum.
  add('tuner.shift', {
    group: 'sfx',
    variants: 1,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'tuner.shift',
        v,
        1.6,
        [
          tone(0, [0.05, 0.1, 0.9], 0.8, 220, {
            freqEnd: 880,
            partials: [1, 0.4, 0.2],
            vibrato: { rate: 6, depth: 0.004 },
          }),
          tone(0.04, [0.05, 0.1, 0.9], 0.5, 330, { freqEnd: 1320, partials: [1, 0.3] }),
          tone(0, [0.1, 0.2, 1.1], 0.4, 110, { freqEnd: 55, partials: [1, 0.6, 0.3] }),
          noise(0, [0.3, 0.2, 0.9], 0.15, [bp(1200, 3, 4500)]),
          modal(0.55, 0.3, [
            { freq: 1760, decay: 1.0, gain: 1 },
            { freq: 2640, decay: 0.8, gain: 0.5 },
          ]),
        ],
        0.75,
      ),
  });
  add('tuner.listen_on', {
    group: 'sfx',
    variants: 1,
    volume: 0.7,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'tuner.listen_on',
        v,
        1.0,
        [
          tone(0, [0.5, 0.1, 0.4], 0.8, 110, {
            partials: [1, 0.5, 0.35, 0.2],
            filters: [lp(300, 1, 1800)],
          }),
          tone(0, [0.4, 0.2, 0.4], 0.35, 441, { freqEnd: 440 }),
          noise(0, [0.4, 0.1, 0.5], 0.12, [bp(600, 2, 2600)], 'pink'),
        ],
        0.6,
      ),
  });
  add('tuner.listen_off', {
    group: 'sfx',
    variants: 1,
    volume: 0.7,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'tuner.listen_off',
        v,
        0.9,
        [
          tone(0, [0.02, 0.1, 0.6], 0.8, 110, {
            partials: [1, 0.5, 0.35, 0.2],
            filters: [lp(1800, 1, 200)],
          }),
          noise(0, [0.02, 0, 0.5], 0.12, [bp(2600, 2, 500)], 'pink'),
        ],
        0.6,
      ),
  });
  add('tuner.charge_ready', {
    group: 'sfx',
    variants: 1,
    volume: 0.6,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'tuner.charge_ready',
        v,
        1.6,
        [
          modal(0, 0.7, [
            { freq: 440, decay: 1.4, gain: 1 },
            { freq: 660, decay: 1.2, gain: 0.55 },
            { freq: 1320, decay: 0.8, gain: 0.2 },
          ]),
          tone(0, [0.01, 0, 0.5], 0.2, 220, { partials: [1, 0.4] }),
        ],
        0.5,
      ),
  });

  // The Unstrung: people out of phase. A breathy voice that slides down and never settles, with a
  // second, slightly detuned self a beat behind it. Sad before it is threatening.
  add('unstrung.voice', {
    group: 'voice',
    variants: 4,
    volume: 0.7,
    positional: true,
    soundlevel: 70,
    build: (v) => {
      const r = rngFor('unstrung.voice', v);
      const f0 = jit(r, 125 + v * 22, 0.05);
      const vowels = [
        [
          { freq: 520, q: 7, gain: 1 },
          { freq: 920, q: 9, gain: 0.7 },
          { freq: 2400, q: 12, gain: 0.25 },
        ],
        [
          { freq: 400, q: 7, gain: 1 },
          { freq: 780, q: 9, gain: 0.8 },
          { freq: 2300, q: 12, gain: 0.2 },
        ],
        [
          { freq: 680, q: 7, gain: 1 },
          { freq: 1150, q: 9, gain: 0.6 },
          { freq: 2500, q: 12, gain: 0.25 },
        ],
        [
          { freq: 330, q: 7, gain: 1 },
          { freq: 640, q: 9, gain: 0.9 },
          { freq: 2200, q: 12, gain: 0.2 },
        ],
      ][v % 4];
      return oneShot(
        'unstrung.voice',
        v,
        2.6,
        [
          {
            kind: 'formant',
            at: 0,
            env: [0.5, 0.3, 1.4],
            gain: 1,
            f0,
            f0End: f0 * 0.78,
            breath: 0.45,
            formants: vowels,
            vibrato: { rate: 4.6, depth: 0.012 },
          },
          {
            kind: 'formant',
            at: 0.18,
            env: [0.6, 0.2, 1.5],
            gain: 0.55,
            f0: f0 * 1.06,
            f0End: f0 * 0.8,
            breath: 0.6,
            formants: vowels.map((f) => ({ ...f, freq: f.freq * 0.93 })),
            vibrato: { rate: 3.7, depth: 0.02 },
          },
          noise(0, [0.8, 0.3, 1.4], 0.18, [bp(2000, 0.6, 700)], 'pink', {
            tremolo: { rate: 5.5, depth: 0.5 },
          }),
        ],
        0.6,
      );
    },
  });

  // Weather and structure.
  add('wind.loop', {
    group: 'ambient',
    variants: 1,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    loop: true,
    build: (v) => ({
      seed: seedFor('wind.loop', v),
      duration: 14,
      rate: 22050,
      channels: 2,
      peak: 0.6,
      loop: true,
      layers: [
        noise(0, [0, 14, 0], 1, [lp(650, 0.6), hp(60)], 'pink', {
          tremolo: { rate: 0.11, depth: 0.45 },
        }),
        noise(0, [0, 14, 0], 0.5, [bp(380, 3.5, 520)], 'pink', {
          tremolo: { rate: 0.19, depth: 0.7 },
        }),
        noise(0, [0, 14, 0], 0.12, [bp(1900, 9, 1500)], 'white', {
          tremolo: { rate: 0.07, depth: 0.9 },
        }),
      ],
    }),
  });
  add('wind.gust', {
    group: 'ambient',
    variants: 3,
    volume: 0.7,
    positional: false,
    soundlevel: 0,
    build: (v) => {
      const r = rngFor('wind.gust', v);
      return {
        seed: seedFor('wind.gust', v),
        duration: 5,
        rate: 22050,
        channels: 2,
        peak: 0.6,
        layers: [
          noise(
            0,
            [1.6, 0.4, 2.6],
            1,
            [lp(jit(r, 500, 0.2), 0.7, jit(r, 1300, 0.2)), hp(70)],
            'pink',
          ),
          noise(0.3, [1.4, 0.2, 2.4], 0.4, [bp(jit(r, 700, 0.2), 4, jit(r, 1500, 0.2))], 'pink'),
        ],
      };
    },
  });
  add('ship.groan', {
    group: 'ambient',
    variants: 3,
    volume: 0.9,
    positional: true,
    soundlevel: 80,
    build: (v) => {
      const r = rngFor('ship.groan', v);
      const base = jit(r, 46, 0.12);
      return {
        seed: seedFor('ship.groan', v),
        duration: 6.5,
        rate: 22050,
        channels: 1,
        peak: 0.75,
        layers: [
          tone(0, [1.4, 0.6, 3.5], 1, base * 1.5, {
            freqEnd: base,
            wave: 'saw',
            filters: [lp(260, 7, 150), bp(base * 3, 5)],
            vibrato: { rate: 0.7, depth: 0.03 },
          }),
          modal(0.4, 0.5, plate(r, base * 1.9, 3.5, 5)),
          noise(0, [1.5, 0.5, 3], 0.4, [bp(jit(r, 150, 0.2), 4, 90)], 'brown', {
            tremolo: { rate: 2.3, depth: 0.35 },
          }),
          noise(1.2, [0.6, 0.2, 1.5], 0.08, [bp(jit(r, 1100, 0.2), 14, 700)], 'white', {
            tremolo: { rate: 9, depth: 0.8 },
          }),
        ],
      };
    },
  });

  add('radio.click', {
    group: 'ui',
    variants: 3,
    volume: 0.5,
    positional: false,
    soundlevel: 0,
    build: (v) =>
      oneShot(
        'radio.click',
        v,
        0.12,
        [
          noise(0, [0.001, 0, 0.012], 0.9, [bp(2600, 1.2)]),
          modal(0, 0.4, [{ freq: 1100 + v * 90, decay: 0.04, gain: 1 }]),
          noise(0.045, [0.001, 0, 0.01], 0.4, [bp(3200, 1)]),
        ],
        0.5,
      ),
  });
  add('radio.static', {
    group: 'ui',
    variants: 2,
    volume: 0.4,
    positional: false,
    soundlevel: 0,
    build: (v) => {
      const r = rngFor('radio.static', v);
      const crackles: Layer[] = [];
      for (let i = 0; i < 9; i++) {
        crackles.push(noise(r() * 1.3, [0.001, 0, 0.01 + r() * 0.02], 0.5 + r() * 0.5, [hp(1500)]));
      }
      return oneShot(
        'radio.static',
        v,
        1.5,
        [
          noise(0, [0.03, 1.2, 0.2], 0.5, [bp(1800, 0.8), hp(500)], 'white', {
            tremolo: { rate: 9 + v * 3, depth: 0.55 },
          }),
          tone(0, [0.03, 1.2, 0.2], 0.04, 1000, { tremolo: { rate: 2, depth: 0.6 } }),
          ...crackles,
        ],
        0.5,
        22050,
      );
    },
  });
  add('misc.soft', {
    group: 'sfx',
    variants: 1,
    volume: 0.35,
    positional: true,
    soundlevel: 55,
    build: (v) =>
      oneShot(
        'misc.soft',
        v,
        0.2,
        [
          noise(0, [0.003, 0, 0.07], 0.7, [bp(900, 1.2), lp(2500)], 'pink'),
          tone(0, [0.003, 0, 0.1], 0.5, 110, { freqEnd: 70 }),
        ],
        0.4,
      ),
  });

  // Ambient beds (seamless stereo loops, one per area) and the music layer's material.
  const bed = (area: AreaId, layers: Layer[], duration = 18): SoundDef => ({
    group: 'ambient',
    variants: 1,
    volume: 0.7,
    positional: false,
    soundlevel: 0,
    loop: true,
    build: (v) => ({
      seed: seedFor(`bed.${area}`, v),
      duration,
      rate: 22050,
      channels: 2,
      peak: 0.5,
      loop: true,
      layers,
    }),
  });
  const full = (d: number): Env => [0, d, 0];
  add(
    'bed.ice_open',
    bed('ice_open', [
      noise(0, full(18), 1, [lp(520, 0.6), hp(50)], 'pink', {
        tremolo: { rate: 0.09, depth: 0.5 },
      }),
      noise(0, full(18), 0.35, [bp(330, 3, 450)], 'pink', { tremolo: { rate: 0.14, depth: 0.7 } }),
      noise(0, full(18), 0.05, [hp(3000)], 'white', { tremolo: { rate: 0.05, depth: 0.9 } }),
    ]),
  );
  add(
    'bed.camp_interior',
    bed('camp_interior', [
      tone(0, full(18), 0.5, 50, { partials: [1, 0.55, 0.3, 0.12], filters: [lp(400)] }),
      tone(0, full(18), 0.12, 100.4, { partials: [1, 0.4] }),
      noise(0, full(18), 0.5, [lp(300, 0.6), hp(40)], 'brown', {
        tremolo: { rate: 0.2, depth: 0.25 },
      }),
      noise(0, full(18), 0.05, [bp(2200, 4)], 'pink', { tremolo: { rate: 0.31, depth: 0.7 } }),
    ]),
  );
  add(
    'bed.ship_1971',
    bed('ship_1971', [
      tone(0, full(18), 0.5, 41.2, {
        partials: [1, 0.6, 0.35],
        tremolo: { rate: 0.07, depth: 0.3 },
      }),
      tone(0, full(18), 0.25, 61.9, { partials: [1, 0.4], tremolo: { rate: 0.11, depth: 0.5 } }),
      noise(0, full(18), 0.6, [lp(240, 0.7), hp(30)], 'brown', {
        tremolo: { rate: 0.13, depth: 0.4 },
      }),
      noise(0, full(18), 0.08, [bp(900, 8, 700)], 'pink', { tremolo: { rate: 0.23, depth: 0.9 } }),
      modal(4.5, 0.12, [
        { freq: 1480, decay: 0.7, gain: 1 },
        { freq: 2210, decay: 0.4, gain: 0.5 },
      ]),
      modal(11.8, 0.1, [
        { freq: 1310, decay: 0.8, gain: 1 },
        { freq: 1980, decay: 0.5, gain: 0.5 },
      ]),
    ]),
  );
  add(
    'bed.ship_2030',
    bed('ship_2030', [
      tone(0, full(18), 0.3, 220, { partials: [1, 0.2], tremolo: { rate: 0.08, depth: 0.4 } }),
      tone(0, full(18), 0.3, 221.6, { partials: [1, 0.2], tremolo: { rate: 0.1, depth: 0.4 } }),
      tone(0, full(18), 0.35, 55, { partials: [1, 0.4, 0.2] }),
      noise(0, full(18), 0.3, [lp(380, 0.7), hp(60)], 'brown'),
      noise(0, full(18), 0.06, [bp(3400, 10, 3000)], 'white', {
        tremolo: { rate: 0.17, depth: 0.9 },
      }),
    ]),
  );

  add('music.drone', {
    group: 'music',
    variants: 1,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    loop: true,
    build: (v) => ({
      seed: seedFor('music.drone', v),
      duration: 24,
      rate: 22050,
      channels: 2,
      peak: 0.5,
      loop: true,
      layers: [
        tone(0, full(24), 0.8, 55, { partials: [1, 0.2], tremolo: { rate: 0.05, depth: 0.35 } }),
        tone(0, full(24), 0.6, 55.3, { partials: [1, 0.15], tremolo: { rate: 0.07, depth: 0.4 } }),
        tone(0, full(24), 0.3, 82.5, { tremolo: { rate: 0.06, depth: 0.6 } }),
        tone(0, full(24), 0.18, 110.2, { tremolo: { rate: 0.09, depth: 0.7 } }),
      ],
    }),
  });
  /** Partial n of 55 Hz; the player transposes by rate per area. */
  add('music.tone', {
    group: 'music',
    variants: MUSIC_PARTIALS.length,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    build: (v) => ({
      seed: seedFor('music.tone', v),
      duration: 9,
      rate: 22050,
      channels: 2,
      peak: 0.5,
      layers: [
        tone(0, [2.6, 0.2, 5.5], 1, 55 * MUSIC_PARTIALS[v], {
          partials: [1, 0.12],
          vibrato: { rate: 0.4, depth: 0.0015 },
        }),
        tone(0.4, [3, 0, 5], 0.3, 55 * MUSIC_PARTIALS[v] * 1.002, {}),
      ],
    }),
  });
  add('music.pulse', {
    group: 'music',
    variants: 1,
    volume: 0.8,
    positional: false,
    soundlevel: 0,
    loop: true,
    build: (v) => {
      const layers: Layer[] = [];
      for (let i = 0; i < 4; i++) {
        layers.push(tone(i, [0.03, 0, 0.55], 1, 46, { freqEnd: 38 }));
        layers.push(tone(i + 0.3, [0.03, 0, 0.35], 0.4, 46, { freqEnd: 38 }));
      }
      return {
        seed: seedFor('music.pulse', v),
        duration: 4,
        rate: 22050,
        channels: 1,
        peak: 0.6,
        loop: true,
        layers,
      };
    },
  });

  return bank;
})();

/** Every sound's name. */
export const SOUND_NAMES = Object.keys(SOUND_BANK) as HarmonicSoundName[];

export function isSoundName(name: string): name is HarmonicSoundName {
  return Object.prototype.hasOwnProperty.call(SOUND_BANK, name);
}

/** The recipe for (name, variant); variant wraps. */
export function recipeFor(name: HarmonicSoundName, variant = 0): Recipe {
  const def = SOUND_BANK[name];
  const v = ((Math.floor(variant) % def.variants) + def.variants) % def.variants;
  return def.build(v);
}
