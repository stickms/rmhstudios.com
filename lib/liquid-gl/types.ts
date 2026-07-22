/**
 * Shared types for the shader-grade liquid layer (§16.1 — Phase M1).
 *
 * The runtime is split so the render loop never allocates and never reads
 * layout: {@link LiquidBody} rects are plain numbers pushed in from the
 * integrating components' own motion-value samplers (registry.ts), the scene
 * uniforms are parsed once per theme change (scene.ts), and the two backends
 * (WebGPU/WebGL2) implement the same {@link LiquidRenderer} contract over the
 * same visuals (renderer-*.ts). index.ts owns the canvas + frame budget.
 */

/** Rendering tier chosen by {@link detectLiquidTier}. `'none'` = CSS/SVG fallback. */
export type LiquidTier = 'webgpu' | 'webgl2' | 'none';

/**
 * Body archetypes. Only the material look differs (fill tint + rim), never the
 * SDF math:
 *  - `capsule`  — a tab/nav active capsule (accent-tinted, strong fill).
 *  - `droplet`  — a trailing blob that smooth-min merges with its capsule.
 *  - `bud`      — the liquid-pop menu bud growing out of its trigger.
 *  - `pane-rim` — a hero pane edge: rim specular + refraction only, no fill.
 */
export type LiquidBodyKind = 'capsule' | 'droplet' | 'bud' | 'pane-rim';

/**
 * A registered liquid body. All geometry is in **CSS pixels, viewport-anchored**
 * (matching the fixed full-viewport canvas). The render loop reads these fields
 * directly — the integrating component is responsible for keeping them fresh via
 * {@link LiquidBodyHandle.set} from within its existing rAF / motion subscription
 * (no new layout reads, none in the render loop).
 */
export interface LiquidBody {
  /** Monotonic id (mutable — the body is a reused pool slot, see registry.ts). */
  id: number;
  kind: LiquidBodyKind;
  /** Center x/y in CSS px (viewport coords). */
  cx: number;
  cy: number;
  /** Half-width / half-height in CSS px. */
  hw: number;
  hh: number;
  /** Corner radius in CSS px (a disc = radius ≥ min(hw,hh)). */
  radius: number;
  /** Press depth 0..1 — deepens refraction + specular (the press pulse). */
  press: number;
  /**
   * Merge group. Bodies sharing a group id smooth-min merge into one metaball
   * surface (capsule+droplet, bud+disc); group 0 never merges. */
  group: number;
  /** Whether the body is currently animating — drives idle damping. */
  active: boolean;
}

/** The mutable fields a consumer may push each frame. */
export type LiquidBodyPatch = Partial<
  Pick<LiquidBody, 'cx' | 'cy' | 'hw' | 'hh' | 'radius' | 'press' | 'active' | 'kind'>
>;

/** Handle returned by the registry / `useLiquidBody`; `null` when GL is inactive. */
export interface LiquidBodyHandle {
  readonly id: number;
  set(patch: LiquidBodyPatch): void;
  remove(): void;
}

/** One aurora glow blob (a radial-gradient in the CSS `--site-canvas` stack). */
export interface SceneGlow {
  /** Premultiplied-ish rgb (0..1) and its source alpha. */
  r: number;
  g: number;
  b: number;
  a: number;
  /** Center in 0..1 viewport-normalized coords. */
  cx: number;
  cy: number;
  /** Ellipse radii as fractions of the viewport (from the gradient size %). */
  sx: number;
  sy: number;
  /** Transparent stop (0..1) — where the glow fades out. */
  stop: number;
}

/**
 * Parsed scene colours (from `--site-canvas`) plus the live drift/parallax/light
 * inputs. Colours + geometry come from {@link parseSceneColors} once per theme
 * change; `mx/my/lightX/lightY/time` are refreshed cheaply per frame from inline
 * `<html>` style (no computed-style / layout reads).
 */
export interface SceneState {
  /** Base linear-gradient stops (top→bottom), rgb 0..1. */
  baseTop: [number, number, number];
  baseMid: [number, number, number];
  baseBot: [number, number, number];
  glows: SceneGlow[];
  /** Accent (rgb 0..1) — tints capsule/droplet/bud fills. */
  accent: [number, number, number];
  /** Rim/glint colour (rgb 0..1) for specular. */
  rim: [number, number, number];
  /** Parallax offset in CSS px (from `--aurora-mx/my`). */
  mx: number;
  my: number;
  /** Scene light in CSS px (from `--light-x/y`); NaN ⇒ use the sun default. */
  lightX: number;
  lightY: number;
  /** Seconds since init — drives the ambient drift. */
  time: number;
}

/** The backend contract. Both renderers implement exactly this. */
export interface LiquidRenderer {
  readonly tier: LiquidTier;
  /** Resize backing store to `w×h` device px (DPR already applied by the caller). */
  resize(w: number, h: number, dpr: number): void;
  /** Draw one frame. `bodies`/`count` and `scene` are borrowed — never retained. */
  render(scene: SceneState, bodies: readonly LiquidBody[], count: number): void;
  /** Release GL/GPU resources. */
  dispose(): void;
}
