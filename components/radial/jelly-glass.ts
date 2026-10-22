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

/** Everything the material needs for one frame. All coordinates are in radii of the sphere, y DOWN. */
export interface JellyFrame {
  /**
   * Up to three live ripples: screen-space unit vector to the impact (after the
   * globe's rotation, z toward the viewer) and the ripple's age in seconds. A
   * negative age is an empty slot.
   */
  ripples: Float32Array;
  /** The soft body: grab point, tug, pinch (see `lib/soft-body.ts`). */
  gx: number;
  gy: number;
  dx: number;
  dy: number;
  pinch: number;
}

/** Colours resolved from the theme, 0–1 sRGB. */
export interface JellyPalette {
  ink: [number, number, number];
  accent: [number, number, number];
  /** 1 on a light ground, 0 on a dark one. */
  light: number;
}

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

/** Max live ripples the shader takes; matches `MAX_RIPPLES` in LiquidGlobe. */
export const JELLY_RIPPLES = 3;

const VERT = `
attribute vec2 aPos;
varying vec2 vP;
void main() {
  // Screen-handed: x right, y DOWN, in radii of the sphere.
  vP = vec2(aPos.x, -aPos.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vP;
uniform float uPx;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uLight;
uniform vec4 uRip[${JELLY_RIPPLES}];
uniform vec4 uShape;
uniform vec4 uSoft;
uniform float uPinch;

const float INV2S2 = ${(1 / (2 * 0.62 * 0.62)).toFixed(6)};

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

  // The soft body's local lobe, undone so the lighting rides the jelly: the
  // surface under the finger is dragged along, and a press dimples it.
  vec2 g = p - uSoft.xy;
  float w = exp(-dot(g, g) * INV2S2);
  p = p - uSoft.zw * w + g * uPinch * w;

  float r2 = dot(p, p);
  float r = sqrt(r2);
  float inside = 1.0 - smoothstep(1.0 - uPx * 1.5, 1.0, r);
  if (inside <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 n = vec3(p, sqrt(max(0.0, 1.0 - min(r2, 1.0))));

  // Ripples bend the surface normal, so the light itself runs over the wave.
  float crest = 0.0;
  for (int i = 0; i < ${JELLY_RIPPLES}; i++) {
    vec4 rip = uRip[i];
    if (rip.w < 0.0) continue;
    float c = clamp(dot(n, rip.xyz), -1.0, 1.0);
    float dist = acos(c);
    float h = wave(rip.w, dist);
    float slope = (wave(rip.w, dist + 0.03) - wave(rip.w, dist - 0.03)) / 0.06;
    vec3 t = rip.xyz - n * c;
    float tl = length(t);
    if (tl > 1e-4) n = normalize(n + (t / tl) * slope * 2.2);
    crest += max(h, 0.0);
  }
  // A tug leans the surface toward the pull; the jelly's sheen follows it.
  n = normalize(n + vec3(uSoft.zw * w * 1.4, 0.0));

  float nz = max(n.z, 0.0);
  float rim = 1.0 - nz;
  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 rf = reflect(-v, n);

  // ── Reflection: the studio, mirrored, weighted by Fresnel ──
  // The softbox is placed in REFLECTION space, so on the ball it lands as a
  // curved window up-left that bends with every ripple and squeeze.
  float fres = 0.04 + 0.96 * pow(rim, 3.0);
  float sky = smoothstep(0.3, -0.9, rf.y);
  // Centred just up-left of the key glint (the glint is the window's hot spot),
  // and small: on a sphere a reflection is compressed toward the limb, so a big
  // box smears into a comma.
  float win = box(rf.xy, vec2(-0.56, -0.66), vec2(0.13, 0.055), 0.035);
  float floorDark = smoothstep(-0.1, 0.8, rf.y);
  float refl = win * (0.34 + 0.5 * fres) + sky * 0.3 * fres;

  // ── Specular: a small hard glint at the window's hot spot, and a kicker ──
  vec3 L1 = normalize(vec3(-0.5, -0.62, 0.6));
  float k1 = max(dot(n, normalize(L1 + v)), 0.0);
  float spec = pow(k1, 1400.0) * 1.1 + pow(k1, 90.0) * 0.08;
  vec3 L2 = normalize(vec3(0.62, 0.5, 0.6));
  float spec2 = pow(max(dot(n, normalize(L2 + v)), 0.0), 220.0) * 0.28;

  // ── The rim: thick glass is brightest in a hairline right at the limb, and
  //    darkest just inside it, where light has the longest path through ──
  float rimLine = smoothstep(0.935, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
  float band = smoothstep(0.7, 0.93, r) * (1.0 - smoothstep(0.93, 0.99, r));

  // ── Transmission: the room behind, upside-down, and the key light focused
  //    into a crescent hugging the far inner rim ──
  float thick = nz;
  float tband = smoothstep(0.25, 0.95, p.y) * (1.0 - smoothstep(0.8, 0.97, r)) * 0.16;
  vec2 cdir = normalize(vec2(0.62, 0.78) - uSoft.zw * 1.2);
  float along = max(dot(r > 1e-4 ? p / r : vec2(0.0), cdir), 0.0);
  float crescent = exp(-pow((r - 0.8) / 0.085, 2.0)) * pow(along, 7.0);
  vec2 dc = p - cdir * 0.55;
  float caustic = crescent * 0.5 + exp(-dot(dc, dc) / 0.09) * 0.07;

  // ── Absorption ──
  float body = mix(0.035, 0.085, thick) + uLight * 0.015;
  float edge = band * mix(0.12, 0.2, uLight) + smoothstep(0.86, 1.0, r) * mix(0.03, 0.1, uLight);

  // Composite, premultiplied. Body and edge are a tinted medium (over); the
  // light is added on top of it.
  vec3 hi = mix(vec3(1.0), uAccent, 0.08);
  vec3 col = uAccent * body + uInk * edge * (1.0 - body);
  float a = body + edge * (1.0 - body);
  col *= 1.0 - floorDark * 0.25 * fres;

  vec3 glow = mix(hi, uAccent, 0.55);
  float lightA = refl * 0.7 + spec + spec2 + rimLine * 0.38 + crest * 3.2 * (0.4 + fres);
  float transA = (tband + caustic) * (1.0 - fres * 0.5);
  col += hi * lightA + glow * transA;
  a += lightA * 0.85 + transA * 0.7;

  a = clamp(a, 0.0, 1.0) * inside;
  col = min(col, vec3(a)) * inside;
  gl_FragColor = vec4(col, a);
}`;

type GL = WebGLRenderingContext;

interface Uniforms {
  px: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  accent: WebGLUniformLocation | null;
  light: WebGLUniformLocation | null;
  rip: WebGLUniformLocation | null;
  shape: WebGLUniformLocation | null;
  soft: WebGLUniformLocation | null;
  pinch: WebGLUniformLocation | null;
}

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/** One GL context, one program, one full-screen triangle. */
export class JellyGlass {
  readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private u: Uniforms | null = null;
  private px = 0;
  private lost = false;
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
      this.onChange?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
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
    const gl = (this.canvas.getContext('webgl', opts) ??
      this.canvas.getContext('experimental-webgl', opts)) as GL | null;
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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    // One oversized triangle covers the viewport with no diagonal seam.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    const loc = (name: string) => gl.getUniformLocation(prog, name);
    this.u = {
      px: loc('uPx'),
      ink: loc('uInk'),
      accent: loc('uAccent'),
      light: loc('uLight'),
      rip: loc('uRip'),
      shape: loc('uShape'),
      soft: loc('uSoft'),
      pinch: loc('uPinch'),
    };
    this.gl = gl;
    this.px = 0;
    return true;
  }

  /** Size the backing store. Only on mount and on a real resize — never per frame. */
  resize(cssPx: number, dpr: number): void {
    const px = Math.max(1, Math.round(cssPx * Math.min(dpr, JELLY_MAX_DPR)));
    if (px === this.px) return;
    this.px = px;
    this.canvas.width = px;
    this.canvas.height = px;
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.viewport(0, 0, px, px);
    // One pixel, in radii of the sphere (the canvas spans two radii).
    gl.uniform1f(u.px, 2 / px);
  }

  palette(p: JellyPalette, shape: JellyRippleShape): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.uniform3f(u.ink, p.ink[0], p.ink[1], p.ink[2]);
    gl.uniform3f(u.accent, p.accent[0], p.accent[1], p.accent[2]);
    gl.uniform1f(u.light, p.light);
    gl.uniform4f(u.shape, shape.speed, shape.width, shape.amplitude, shape.life);
  }

  render(f: JellyFrame): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return;
    gl.uniform4fv(u.rip, f.ripples);
    gl.uniform4f(u.soft, f.gx, f.gy, f.dx, f.dy);
    gl.uniform1f(u.pinch, f.pinch);
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
export function resolveColor(css: string, fallback: [number, number, number]): [number, number, number] {
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
