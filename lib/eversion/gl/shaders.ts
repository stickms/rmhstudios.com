/**
 * The eversion's GLSL ES 3.00 sources (spec §4, §5.4–5.5, §10). OWNER: T23.
 * Client-only; no React, no DOM.
 *
 * ## What the shaders are
 *
 * A PORT. The eversion `F`, its normal and the morph are written first in
 * TypeScript (`thurston.ts`, `morph.ts`) and tested in node; this file mirrors
 * them term for term, and the GL parity test (spec §11.2 test 27) renders `F`
 * through transform feedback at 64 values of `e` and compares with the oracle to
 * 1e-4. If the two disagree the oracle wins and the shader is fixed.
 *
 * - **Vertex:** the eversion `F` with the stage parameters taken as the
 *   `u_stageParams` uniform (the CPU runs `stageParams`, so the GPU does no
 *   window math); the normal (finite differences plus the analytic pole
 *   override); the morph, reading the LUT with `textureLod` for `flat(p)`;
 *   spin/tilt/radius/centre; the ripple displacement from `lib/fluid`'s `RIPPLE`.
 *   The vertex shader evaluates `F` three times per vertex (centre plus two taps
 *   for the normal).
 * - **Fragment:** the side from `gl_FrontFacing` (front → `before`, back →
 *   `after`, the latter through `u_mAfter`); the page UV from the LUT per
 *   fragment (no per-vertex UV seams); glass edges antialiased with `fwidth`;
 *   the `u_placeholder` → `u_after` mix; Lambert + side tint + fresnel rim; the
 *   13-ring procedural cage; `u_pageAlpha` for the reveal. Every colour is a
 *   `u_col*` uniform — **no raw colour in GLSL**.
 *
 * The names, types and cadences of the uniforms are `UNIFORMS` in `uniforms.ts`
 * — the contract between this file and the renderer (T24). Constants
 * (`WRAP_WAVE`, `LAMBERT_*`, `RIM_*`, `STAGE_PARAM_COUNT`, …) are injected as
 * `#define`s generated from `constants.ts`.
 *
 * T24 ships `stub-shaders.ts` exporting a {@link ShaderSet} of the same shape
 * (a textured round sphere that still honours the morph and both sides), so the
 * renderer, host and harness work before this file lands.
 */

import { notImplemented } from '../not-implemented';

/** One linked program's sources. */
export interface ProgramSource {
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Everything the renderer compiles (spec §8.4: two draw calls — the surface,
 * then the cage lines from the same vertex transform).
 */
export interface ShaderSet {
  /** The page/glass surface. */
  readonly surface: ProgramSource;
  /** The cage lines (may share the surface's vertex source with a pass flag). */
  readonly cage: ProgramSource;
  /**
   * The transform-feedback variant of the vertex shader that outputs `F` only
   * (`renderer.debugEvaluate`, spec §11.2 test 27), and the varying it captures.
   */
  readonly feedback: ProgramSource & { readonly varyings: readonly string[] };
}

/**
 * The real shader set. Throws until T23 lands; the renderer's default is the
 * stub set until then.
 */
export function getShaderSet(): ShaderSet {
  return notImplemented('getShaderSet', 'T23');
}
