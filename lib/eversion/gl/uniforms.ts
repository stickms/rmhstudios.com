/**
 * The shader interface — attribute, sampler units and the uniform table — as DATA
 * (spec §8.4, §10.2; tasks T23/T24). OWNER: T01 (contract); T23/T24 consume.
 *
 * ## Why this is a contract and not part of either task
 *
 * The renderer (T24) writes uniforms and the shaders (T23) read them, and the
 * two were built in parallel — T24 against a stand-in, T23 against the TS
 * oracle. If each chose its own names and types, the integration would be a day
 * of reconciling spellings. Instead the names, GLSL types, update cadence and
 * the snapshot field each is fed from are written down here once. The shaders
 * (`shaders.ts`) declare them with these exact names. A uniform a program does
 * not use is simply optimised away, and the renderer tolerates a missing location.
 *
 * Constants (`WRAP_WAVE`, `RIM_*`, `LAMBERT_*`, `STAGE_PARAM_COUNT`, …) are NOT
 * uniforms: they are injected into the GLSL source as `#define`s generated from
 * `constants.ts`, so a tuned value changes in one place and the oracle, the
 * shader and the tests cannot disagree.
 *
 * **No raw colour appears in GLSL.** Every colour is a `u_col*` uniform fed from
 * `ThemeColours` (spec §10.2).
 */

import { STAGE_PARAM_COUNT } from '../constants';

/** GLSL type of a uniform. `float[N]` is a float array of `length` elements. */
export type UniformType = 'float' | 'vec2' | 'vec4' | 'mat3' | 'float[]' | 'sampler2D';

/** When the renderer (re)writes a uniform. */
export type UniformCadence =
  /** Every `draw`, from the timeline snapshot. */
  | 'frame'
  /** On `prime` (and `resize`): per-navigation values. */
  | 'prime'
  /** Whenever the drawing buffer is resized or the governor steps the DPR. */
  | 'resize'
  /** Bound once: a texture unit. */
  | 'bind';

export interface UniformSpec {
  readonly name: string;
  readonly type: UniformType;
  /** Element count for `float[]`. */
  readonly length?: number;
  readonly cadence: UniformCadence;
  /** Where the value comes from. */
  readonly from: string;
}

/** The vertex attribute: the mesh's `(θ, φ)` domain coordinate (spec §3.1 `mesh.ts`). */
export const ATTRIBUTE_DOMAIN = { name: 'a_domain', location: 0, size: 2 } as const;

/** Texture units. The renderer binds these once; shaders declare the samplers below. */
export const SAMPLER_UNITS = { lut: 0, before: 1, after: 2, placeholder: 3 } as const;

/**
 * Every uniform of the eversion program. Frame uniforms are the "about 8
 * uniforms" of spec §8.4 (the rest are written once per navigation).
 */
export const UNIFORMS = [
  // ── per frame, from TimelineSnapshot ──
  { name: 'u_wrap', type: 'float', cadence: 'frame', from: 'snapshot.wrap' },
  { name: 'u_unwrap', type: 'float', cadence: 'frame', from: 'snapshot.unwrap' },
  { name: 'u_evert', type: 'float', cadence: 'frame', from: 'snapshot.evert' },
  {
    name: 'u_stageParams',
    type: 'float[]',
    length: STAGE_PARAM_COUNT,
    cadence: 'frame',
    from: 'thurston.stageParams(snapshot.evert)',
  },
  { name: 'u_spin', type: 'float', cadence: 'frame', from: 'snapshot.spin (radians)' },
  { name: 'u_tilt', type: 'float', cadence: 'frame', from: 'snapshot.tilt (radians)' },
  { name: 'u_radius', type: 'float', cadence: 'frame', from: 'snapshot.radius (CSS px)' },
  {
    name: 'u_centre',
    type: 'vec2',
    cadence: 'frame',
    from: '(snapshot.centreX, snapshot.centreY) (CSS px, viewport coordinates)',
  },
  { name: 'u_afterMix', type: 'float', cadence: 'frame', from: 'snapshot.afterMix' },
  { name: 'u_pageAlpha', type: 'float', cadence: 'frame', from: 'snapshot.pageAlpha' },
  {
    name: 'u_ripple',
    type: 'float',
    cadence: 'frame',
    from: 'snapshot.rippleAge (seconds; -1 = not emitted)',
  },
  {
    name: 'u_cageAlpha',
    type: 'float',
    cadence: 'frame',
    from: 'mix(CAGE_ALPHA_START, CAGE_ALPHA_END, snapshot.evert), computed by the renderer',
  },

  // ── per navigation ──
  {
    name: 'u_azimuthal',
    type: 'float',
    cadence: 'prime',
    from: '1 for lambert / stereographic (their stretched wedges become glass), else 0',
  },
  {
    name: 'u_meshCell',
    type: 'float',
    cadence: 'prime',
    from: "the tier mesh's cell, max(π / meshPhi, 2π / meshTheta) radians: the scale of the azimuthal wedge mask",
  },
  { name: 'u_viewport', type: 'vec2', cadence: 'prime', from: 'plan.viewport (w, h) in CSS px' },
  { name: 'u_mAfter', type: 'mat3', cadence: 'prime', from: 'RendererPrime.mAfter (column-major)' },
  { name: 'u_colBg', type: 'vec4', cadence: 'prime', from: 'ThemeColours.bg' },
  { name: 'u_colVeil', type: 'vec4', cadence: 'prime', from: 'ThemeColours.veil' },
  { name: 'u_colAccent', type: 'vec4', cadence: 'prime', from: 'ThemeColours.accent' },
  { name: 'u_colCageMinor', type: 'vec4', cadence: 'prime', from: 'ThemeColours.cageMinor' },
  { name: 'u_colCageParallel', type: 'vec4', cadence: 'prime', from: 'ThemeColours.cageParallel' },
  { name: 'u_colCageMajor', type: 'vec4', cadence: 'prime', from: 'ThemeColours.cageMajor' },
  { name: 'u_colCageRipple', type: 'vec4', cadence: 'prime', from: 'ThemeColours.cageRipple' },
  { name: 'u_cageWidth', type: 'float', cadence: 'prime', from: 'ThemeColours.cageWidth (CSS px)' },

  // ── when the buffer changes ──
  {
    name: 'u_pixelRatio',
    type: 'float',
    cadence: 'resize',
    from: 'drawing-buffer px per CSS px (viewport.dpr × tier cap × governor scale)',
  },

  // ── texture units ──
  {
    name: 'u_lut',
    type: 'sampler2D',
    cadence: 'bind',
    from: 'SAMPLER_UNITS.lut — RG32F extended-UV LUT, NEAREST + clamp, bilinear in the shader (T24)',
  },
  { name: 'u_before', type: 'sampler2D', cadence: 'bind', from: 'SAMPLER_UNITS.before' },
  { name: 'u_after', type: 'sampler2D', cadence: 'bind', from: 'SAMPLER_UNITS.after' },
  { name: 'u_placeholder', type: 'sampler2D', cadence: 'bind', from: 'SAMPLER_UNITS.placeholder' },
] as const satisfies readonly UniformSpec[];

export type UniformName = (typeof UNIFORMS)[number]['name'];
