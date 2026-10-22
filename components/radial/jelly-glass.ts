/**
 * The liquid globe's **material**: a thick, gelatinous glass ball, drawn as one
 * fragment shader over the disc (owner, 2026-10-21: "make the liquid globe more
 * jelly refractive reflective like a gelatinous glass surface").
 *
 * The wireframe, the pins and every gesture stay where they were — on the 2D
 * cage canvas and in the DOM — and this is a single layer laid between them and
 * the veil. It owns only what a glass ball does to LIGHT:
 *
 * - **Reflection.** A studio environment (a softbox window up-left, a bright sky
 *   above, a dark floor) mirrored in the surface, weighted by Fresnel, so the
 *   rim brightens at grazing angles and the face stays clear.
 * - **Specular.** A sharp key glint and a broad bloom from the same light, plus a
 *   small kicker opposite it.
 * - **Transmission.** What a ball lens does to the room behind it: the sky is
 *   seen upside-down, as a bright band at the bottom of the ball, and the key
 *   light focuses into a soft caustic on the far side — tinted by the theme
 *   accent, which is the jelly's faint subsurface colour.
 * - **Absorption.** Thickness-weighted body tint, densest where the ball is
 *   thickest, plus a darker edge where light travels furthest through it.
 *
 * Refraction of the STRUCTURE inside the ball (the back of the cage, the far
 * pins) is not done here: it is geometry, applied in `LiquidGlobe`'s projection
 * (`lensScale`), so those lines stay vector-crisp and cost nothing extra. The
 * shader would have to sample the cage as a texture every frame to do the same
 * thing worse.
 *
 * ## Why this costs nothing at rest
 *
 * A uniform glass sphere looks the same however it is turned, so the material
 * does not depend on the globe's rotation at all. It is redrawn only when the
 * SURFACE changes — a ripple is travelling, or the soft body is deformed — and
 * at rest, or while the globe merely spins, the canvas keeps its last frame and
 * no GL work is issued. One context is created per page and reused by every
 * mount of the globe, so opening the menu never compiles a shader twice.
 */

import { CONTACT, DOUGH_EXTENT, DOUGH_N } from '@/lib/dough';
import type { SharedScene } from '@/lib/liquid/glass/scene-store';

/** Everything the material needs for one frame. All coordinates are in radii of the sphere, y DOWN. */
export interface JellyFrame {
  /**
   * Up to three live ripples: screen-space unit vector to the impact (after the
   * globe's rotation, z toward the viewer) and the ripple's age in seconds. A
   * negative age is an empty slot.
   */
  ripples: Float32Array;
  /** The dough body's grab point and press pressure (see `lib/dough.ts`); the field itself goes up with `setField`. */
  gx: number;
  gy: number;
  pinch: number;
}

/** Colours resolved from the theme, 0–1 sRGB. */
export interface JellyPalette {
  ink: [number, number, number];
  accent: [number, number, number];
  /** 1 on a light ground, 0 on a dark one. */
  light: number;
  /** The page ground, so the image refracted through the ball is washed toward what actually surrounds it. */
  bg: [number, number, number];
}

/**
 * Mip level the refracted page is read at. The hub blurs the page behind the globe by `--hub-page-blur` (20px), and a ball
 * showing a SHARPER picture of the thing behind it than the thing itself would read as a sticker, not a lens.
 */
export const JELLY_SCENE_LOD = 5;

/** The ripple's shape — kept in step with `lib/fluid` §RIPPLE by the caller. */
export interface JellyRippleShape {
  speed: number;
  width: number;
  amplitude: number;
  life: number;
}

/**
 * Device-pixel ceiling. The material is gradients and soft glints — nothing in
 * it has a hard edge but the limb, which is antialiased in the shader — so a
 * 1.5x buffer is indistinguishable from 2x at 56% of the fill.
 */
export const JELLY_MAX_DPR = 1.5;

/**
 * The canvas hangs outside the disc on every side by this fraction of the disc's DIAMETER (the same 11% as the cage),
 * because the dough can push the silhouette past its rest position. `radial.css` sizes the canvas from the same number.
 */
export const JELLY_BLEED = 0.11;
/** Half the canvas, in radii of the sphere. */
export const JELLY_EXTENT = 1 + 2 * JELLY_BLEED;

/** Max live ripples the shader takes; matches `MAX_RIPPLES` in LiquidGlobe. */
export const JELLY_RIPPLES = 3;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vP;
uniform float uE;
void main() {
  // Screen-handed: x right, y DOWN, in radii of the sphere. The canvas spans ±uE radii.
  vP = vec2(aPos.x, -aPos.y) * uE;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vP;
out vec4 outColor;
uniform float uPx;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uLight;
uniform vec4 uRip[${JELLY_RIPPLES}];
uniform vec4 uShape;
// The dough field: R,G = in-plane displacement of the material that rests at that point, B = height. Half float, linear.
uniform sampler2D uField;
uniform vec2 uContact;
uniform float uPress;
// The page, refracted. uPlace = (centre x, centre y, radius) in viewport CSS px, already shifted by the scroll since the
// snapshot was taken; uSceneInv = 1 / snapshot size.
uniform sampler2D uScene;
uniform vec4 uPlace;
uniform vec2 uSceneInv;
uniform float uSceneOn;
uniform float uLod;
uniform vec3 uBg;

const float EXTENT = ${DOUGH_EXTENT.toFixed(4)};
const float CONTACT_R = ${CONTACT.toFixed(4)};
const float CELL = ${((2 * DOUGH_EXTENT) / (DOUGH_N - 1)).toFixed(5)};

vec3 field(vec2 q) {
  return texture(uField, q / (2.0 * EXTENT) + 0.5).xyz;
}

float wave(float age, float dist) {
  if (age < 0.0 || age >= uShape.w) return 0.0;
  float q = (dist - uShape.x * age) / uShape.y;
  if (abs(q) > 4.0) return 0.0;
  float d = 1.0 - age / uShape.w;
  return uShape.z * (1.0 - q * q) * exp(-0.5 * q * q) * d * d;
}

// A rounded, feathered rectangle in direction space — the studio's softbox.
float box(vec2 q, vec2 c, vec2 halfSize, float feather) {
  vec2 e = abs(q - c) - halfSize;
  float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
  return 1.0 - smoothstep(-feather, feather, sd);
}

void main() {
  vec2 p = vP;

  // Which material is at this pixel? The field says where each piece of material went (p = X + u(X)), so invert it:
  // two fixed-point passes are exact for the small, smooth displacements the dough allows. Where the field pushed the
  // limb outward, X falls inside the disc and the silhouette bulges.
  vec2 X = p - field(p).xy;
  X = p - field(X).xy;
  float h = field(p).z;

  float r2 = dot(X, X);
  float r = sqrt(r2);
  float aa = max(fwidth(r), uPx * 0.75);
  float inside = 1.0 - smoothstep(1.0 - aa * 1.5, 1.0, r);
  if (inside <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec3 n = vec3(X, sqrt(max(0.0, 1.0 - min(r2, 1.0))));

  // Ripples bend the surface normal, so the light itself runs over the wave.
  float crest = 0.0;
  for (int i = 0; i < ${JELLY_RIPPLES}; i++) {
    vec4 rip = uRip[i];
    if (rip.w < 0.0) continue;
    float c = clamp(dot(n, rip.xyz), -1.0, 1.0);
    float dist = acos(c);
    float hh = wave(rip.w, dist);
    float slope = (wave(rip.w, dist + 0.03) - wave(rip.w, dist - 0.03)) / 0.06;
    vec3 t = rip.xyz - n * c;
    float tl = length(t);
    if (tl > 1e-4) n = normalize(n + (t / tl) * slope * 2.2);
    crest += max(hh, 0.0);
  }

  // The dough's own surface. The height field tilts the normal wherever the dough has been pushed: a wall of the dent
  // leans toward its centre, the shoulder leans away, so the studio's window and glints bend around every dent and
  // ridge, wherever the finger has been, instead of at one fixed point.
  float e = CELL * 1.25;
  vec2 gh = vec2(
    field(p + vec2(e, 0.0)).z - field(p - vec2(e, 0.0)).z,
    field(p + vec2(0.0, e)).z - field(p - vec2(0.0, e)).z
  ) / (2.0 * e);
  n = normalize(vec3(n.xy - gh * 1.7, n.z));

  float nz = max(n.z, 0.0);
  float rim = 1.0 - nz;
  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 rf = reflect(-v, n);

  // ── Reflection: the studio, mirrored, weighted by Fresnel ──
  float fres = 0.033736 + 0.966264 * pow(rim, 5.0); // IOR 1.45
  float sky = 1.0 - smoothstep(-0.9, 0.3, rf.y);
  float win = box(rf.xy, vec2(-0.56, -0.66), vec2(0.13, 0.055), 0.035);
  float floorDark = smoothstep(-0.1, 0.8, rf.y);
  float refl = win * (0.34 + 0.5 * fres) + sky * 0.3 * fres;

  // ── Specular: a small hard glint at the window's hot spot, and a kicker ──
  vec3 L1 = normalize(vec3(-0.5, -0.62, 0.6));
  float k1 = max(dot(n, normalize(L1 + v)), 0.0);
  float spec = pow(k1, 1400.0) * 1.1 + pow(k1, 90.0) * 0.08;
  vec3 L2 = normalize(vec3(0.62, 0.5, 0.6));
  float spec2 = pow(max(dot(n, normalize(L2 + v)), 0.0), 220.0) * 0.28;

  // ── The rim: thick glass is brightest in a hairline right at the limb, and darkest just inside it ──
  float rimLine = smoothstep(0.935, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
  float band = smoothstep(0.7, 0.93, r) * (1.0 - smoothstep(0.93, 0.99, r));
  float hair = 1.0 - smoothstep(0.0, aa * 1.6, abs(r - (1.0 - aa * 0.8)));

  // ── Transmission: the room behind, upside-down, and the key light focused into a crescent ──
  float thick = nz;
  vec3 entryRay = refract(-v, n, 1.0 / 1.45);
  vec3 exitNormal = normalize(vec3(X + entryRay.xy * 2.0 * nz, -nz));
  vec3 throughRay = refract(entryRay, -exitNormal, 1.45);
  float tband = smoothstep(0.15, 0.85, throughRay.y) * (1.0 - smoothstep(0.8, 0.97, r)) * 0.16;
  vec2 cdir = normalize(vec2(0.62, 0.78));
  float along = max(dot(r > 1e-4 ? X / r : vec2(0.0), cdir), 0.0);
  float crescent = exp(-pow((r - 0.8) / 0.085, 2.0)) * pow(along, 7.0);
  vec2 dc = X - cdir * 0.55;
  float caustic = crescent * 0.5 + exp(-dot(dc, dc) / 0.09) * 0.07;

  // ── Dough: thinner and brighter under the finger, a soft occlusion in the dent, a faint stress glow ──
  vec2 cg = X - uContact;
  float stress = uPress * exp(-dot(cg, cg) / (2.0 * CONTACT_R * CONTACT_R));
  float dent = smoothstep(0.0, 0.14, -h);
  // A dent in clear gel is read from broad shading on its walls, not from a pin-prick glint: the wall facing the key
  // light is lit, the far wall falls into shadow, and a soft sheen rolls over the shoulder. All of it scales with the
  // dough's own tilt, so an undisturbed ball is exactly as lit as before.
  vec2 tilt = gh * 1.7;
  float bent = smoothstep(0.02, 0.35, length(tilt));
  float emboss = dot(tilt, normalize(vec2(-0.5, -0.62)));
  float litWall = max(-emboss, 0.0) * bent;
  float darkWall = max(emboss, 0.0) * bent;
  float sheen = pow(k1, 14.0) * 0.5 * bent;
  // The shoulder is where the pushed-out material banks up: it catches the light as a thin bright lip.
  float lip = smoothstep(0.004, 0.05, h) * bent;

  // ── Absorption ──
  float body = mix(0.035, 0.085, thick) + uLight * 0.015;
  body = body * (1.0 - 0.45 * dent) + dent * 0.05;
  float edge = band * mix(0.12, 0.2, uLight) + smoothstep(0.86, 1.0, r) * mix(0.03, 0.1, uLight) + hair * 0.42;
  edge += darkWall * 0.15;

  // Composite, premultiplied. Body and edge are a tinted medium (over); the light is added on top of it.
  vec3 hi = mix(vec3(1.0), uAccent, 0.08);
  vec3 col = uAccent * body + mix(uInk, uAccent, step(0.0001, darkWall) * 0.55) * edge * (1.0 - body);
  float a = body + edge * (1.0 - body);
  col *= 1.0 - floorDark * 0.25 * fres;

  // ── The page, seen through the ball ──
  // A ball lens inverts and magnifies what is behind it: each pixel's ray, after the two surfaces, lands on the page on
  // the OPPOSITE side of the centre, further out the closer it is to the limb. The red and blue channels land a hair
  // apart (dispersion), more so toward the rim where the glass is steepest.
  if (uSceneOn > 0.001) {
    // From the surface normal, not from the two-surface refraction above: that one has a total-internal-reflection cutoff
    // (refract() returns zero past a critical angle), and a sampling point that jumps there draws a visible ring on the
    // ball. The normal is smooth everywhere, and it carries every dent and ripple, so the image warps with the surface.
    vec2 q = -n.xy * 0.95 - X * 0.3;
    vec2 spread = normalize(q + vec2(1e-4)) * (0.008 + 0.03 * rim) * uPlace.z * uSceneInv;
    vec2 uv = (uPlace.xy + q * uPlace.z) * uSceneInv;
    vec3 page = vec3(
      textureLod(uScene, uv + spread, uLod).r,
      textureLod(uScene, uv, uLod).g,
      textureLod(uScene, uv - spread, uLod).b
    );
    page = mix(page, uBg, 0.28);
    float la = uSceneOn * (1.0 - smoothstep(0.9, 1.0, r)) * 0.94;
    col = col * (1.0 - la) + page * la;
    a = a * (1.0 - la) + la;
  }

  vec3 glow = mix(hi, uAccent, 0.55);
  float lightA = refl * 0.7 + spec + spec2 + rimLine * 0.38 + crest * 3.2 * (0.4 + fres) + stress * 0.06;
  lightA += litWall * 0.42 + sheen + lip * 0.22;
  float transA = (tband + caustic) * (1.0 - fres * 0.5);
  col += hi * lightA + glow * transA;
  a += lightA * 0.85 + transA * 0.7;

  a = clamp(a, 0.0, 1.0) * inside;
  col = min(col, vec3(a)) * inside;
  outColor = vec4(col, a);
}`;

type GL = WebGL2RenderingContext;

interface Uniforms {
  e: WebGLUniformLocation | null;
  px: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  accent: WebGLUniformLocation | null;
  light: WebGLUniformLocation | null;
  rip: WebGLUniformLocation | null;
  shape: WebGLUniformLocation | null;
  field: WebGLUniformLocation | null;
  contact: WebGLUniformLocation | null;
  press: WebGLUniformLocation | null;
  scene: WebGLUniformLocation | null;
  place: WebGLUniformLocation | null;
  sceneInv: WebGLUniformLocation | null;
  sceneOn: WebGLUniformLocation | null;
  lod: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
}

/** The driver's last compile/link message, kept for diagnostics: a silent fallback is how an engine-specific shader bug hides. */
export let lastShaderError = '';

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    lastShaderError = gl.getShaderInfoLog(s) ?? 'shader compile failed';
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * One GL context, one program, one full-screen triangle. WebGL 2 because the dough field is a half-float texture that
 * must filter linearly, which WebGL 1 only offers behind extensions that are missing on parts of the mobile fleet.
 * Without WebGL 2 `create()` returns null and the globe keeps its CSS material (the cage and pins still deform).
 */
export class JellyGlass {
  readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private u: Uniforms | null = null;
  private tex: WebGLTexture | null = null;
  private sceneTex: WebGLTexture | null = null;
  private sceneVersion = -1;
  private px = 0;
  private lost = false;
  private uploaded = -1;
  /** Called when the context is lost or restored, so the owner can swap to or from the CSS material. */
  onChange: (() => void) | null = null;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.className = 'radial-globe__jelly';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.gl = null;
      this.u = null;
      this.tex = null;
      this.sceneTex = null;
      this.sceneVersion = -1;
      this.onChange?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.px = 0;
      this.uploaded = -1;
      this.sceneVersion = -1;
      this.init();
      this.onChange?.();
    });
  }

  static create(): JellyGlass | null {
    const g = new JellyGlass(document.createElement('canvas'));
    return g.init() ? g : null;
  }

  /** Whether frames drawn now will show. */
  get ready(): boolean {
    return !this.lost && this.gl !== null;
  }

  private init(): boolean {
    const opts: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    };
    const gl = this.canvas.getContext('webgl2', opts) as GL | null;
    if (!gl) return false;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      lastShaderError = gl.getProgramInfoLog(prog) ?? 'program link failed';
      return false;
    }
    gl.useProgram(prog);
    // One oversized triangle covers the viewport with no diagonal seam.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    // The dough field: DOUGH_N² RGBA half floats, linear, clamped. Starts at rest (all zero).
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      DOUGH_N,
      DOUGH_N,
      0,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array(DOUGH_N * DOUGH_N * 4),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const loc = (name: string) => gl.getUniformLocation(prog, name);
    this.u = {
      e: loc('uE'),
      px: loc('uPx'),
      ink: loc('uInk'),
      accent: loc('uAccent'),
      light: loc('uLight'),
      rip: loc('uRip'),
      shape: loc('uShape'),
      field: loc('uField'),
      contact: loc('uContact'),
      press: loc('uPress'),
      scene: loc('uScene'),
      place: loc('uPlace'),
      sceneInv: loc('uSceneInv'),
      sceneOn: loc('uSceneOn'),
      lod: loc('uLod'),
      bg: loc('uBg'),
    };
    gl.uniform1i(this.u.field, 0);
    gl.uniform1i(this.u.scene, 1);
    gl.uniform1f(this.u.lod, JELLY_SCENE_LOD);
    gl.uniform1f(this.u.sceneOn, 0);
    gl.uniform1f(this.u.e, JELLY_EXTENT);
    this.tex = tex;
    this.gl = gl;
    this.px = 0;
    return true;
  }

  /**
   * Size the backing store for a disc `cssPx` across. The canvas is larger than the disc by `JELLY_BLEED` on each
   * side so the silhouette has somewhere to go. Only on mount and on a real resize — never per frame.
   */
  resize(cssPx: number, dpr: number): void {
    const px = Math.max(
      1,
      Math.round(cssPx * (1 + 2 * JELLY_BLEED) * Math.min(dpr, JELLY_MAX_DPR)),
    );
    if (px === this.px) return;
    this.px = px;
    this.canvas.width = px;
    this.canvas.height = px;
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.viewport(0, 0, px, px);
    // One pixel, in radii of the sphere (the canvas spans 2·JELLY_EXTENT radii).
    gl.uniform1f(u.px, (2 * JELLY_EXTENT) / px);
  }

  palette(p: JellyPalette, shape: JellyRippleShape): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.uniform3f(u.ink, p.ink[0], p.ink[1], p.ink[2]);
    gl.uniform3f(u.accent, p.accent[0], p.accent[1], p.accent[2]);
    gl.uniform3f(u.bg, p.bg[0], p.bg[1], p.bg[2]);
    gl.uniform1f(u.light, p.light);
    gl.uniform4f(u.shape, shape.speed, shape.width, shape.amplitude, shape.life);
  }

  /** Send the dough body's field to the GPU. A no-op when `version` is what it already holds. */
  setField(data: Float32Array, version: number): void {
    const gl = this.gl;
    if (!gl || !this.tex || this.lost || version === this.uploaded) return;
    this.uploaded = version;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DOUGH_N, DOUGH_N, gl.RGBA, gl.FLOAT, data);
  }

  /**
   * Hand the shader the page snapshot to refract (or `null` to stop). Uploaded once per new picture and mip-mapped, so
   * the globe can read it at the hub's blur radius. Returns whether a picture is now in use.
   */
  setScene(scene: SharedScene | null): boolean {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return false;
    if (!scene) {
      gl.uniform1f(u.sceneOn, 0);
      this.sceneVersion = -1;
      return false;
    }
    if (scene.version !== this.sceneVersion) {
      if (!this.sceneTex) this.sceneTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene.bitmap);
      } catch {
        gl.uniform1f(u.sceneOn, 0);
        return false;
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      this.sceneVersion = scene.version;
    }
    gl.uniform2f(u.sceneInv, 1 / Math.max(1, scene.width), 1 / Math.max(1, scene.height));
    gl.uniform1f(u.sceneOn, 1);
    return true;
  }

  /**
   * Where the disc is, in viewport CSS px, for mapping a pixel to a place on the snapshot: the centre, the radius, and how
   * far the page has scrolled since the snapshot was taken. Called when the globe has settled and on resize — never per
   * frame, because it is measured from layout.
   */
  place(cx: number, cy: number, radiusCss: number, scrollDx: number, scrollDy: number): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return;
    gl.uniform4f(u.place, cx + scrollDx, cy + scrollDy, radiusCss, 0);
  }

  render(f: JellyFrame): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return;
    gl.uniform4fv(u.rip, f.ripples);
    gl.uniform2f(u.contact, f.gx, f.gy);
    gl.uniform1f(u.press, f.pinch);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

let shared: JellyGlass | null | undefined;

/**
 * The page's one material instance, created on first use. `null` when WebGL is
 * unavailable or the program will not compile — the globe keeps its CSS glass.
 */
export function acquireJellyGlass(): JellyGlass | null {
  if (shared === undefined) shared = JellyGlass.create();
  return shared;
}

/**
 * Resolve any CSS colour (`rgb()`, `color(srgb …)`, `oklch()`, `color-mix()` as
 * computed) to 0–1 sRGB by letting the canvas parse it. One 1×1 2D context, used
 * once per mount.
 */
export function resolveColor(
  css: string,
  fallback: [number, number, number],
): [number, number, number] {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]! / 255, d[1]! / 255, d[2]! / 255];
  } catch {
    return fallback;
  }
}
