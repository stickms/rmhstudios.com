/**
 * The docked globe's self-eversion, as a SURFACE.
 *
 * The cage alone made the run read as wires swimming in front of an unchanging disc: the glass body (CSS disc and the
 * jelly coat) is a circle by construction and stayed one while the wireframe turned inside out. This draws Thurston's
 * everting sphere itself (`lib/eversion/thurston.ts`, the surface the full-screen run renders and the cage is stroked
 * through) as lit glass, so the body is what turns inside out and the cage is the structure inside it.
 *
 * - **Geometry.** The run's own `(θ, φ)` mesh (`lib/eversion/mesh.ts`) at a dock-sized resolution, evaluated on the
 *   CPU each frame (under a millisecond at 96 × 48) and projected in the vertex shader through EXACTLY the cage's
 *   projection: the drawn rotation matrix, the bulge fit, and `PERSP / (PERSP − z/2)`. So the wires lie on the skin.
 * - **Material.** Thin glass: transparent where it faces you, Fresnel-bright where it turns away, with the shared
 *   studio reflection and specular (`lib/liquid/globe-material.ts`). The two sides differ: the original OUTSIDE is the
 *   theme's ink, the inside is its accent, so the moment the inside comes out is visible as colour, not only shape.
 *   Overlapping sheets (the eversion passes through itself) accumulate, as layered glass does; there is no depth
 *   buffer, so nothing pops where sheets cross.
 * - **Ends.** At `e = 0` and `e = 1` the surface is the round sphere, so radial.css can cross-fade it with the resting
 *   glass without a jump.
 *
 * One WebGL2 context, created on the first self-eversion and kept. `null` from {@link SelfEvertSkin.create} (no
 * WebGL2, or the program will not build) leaves the run as it was: the wireframe over the resting glass.
 */

import { buildMesh } from '@/lib/eversion/mesh';
import { evert } from '@/lib/eversion/thurston';
import type { Mesh } from '@/lib/eversion/types';
import { LIQUID_GLOBE_MATERIAL_GLSL } from '@/lib/liquid/globe-material';

/** Mesh resolution. Enough for the corrugations at a few hundred CSS px; the full run uses 128–256 columns. */
const N_THETA = 96;
const N_PHI = 48;
/** Backing-store ceiling: the skin is soft-edged glass, and the cage carries the hairlines. */
const SKIN_MAX_DPR = 2;

const VERT = `#version 300 es
in vec3 aPos;
in vec3 aNrm;
uniform mat3 uM;      // the drawn rotation, row-major as LiquidGlobe builds it (uploaded transposed)
uniform float uFit;   // the bulge fit (selfRun.fit)
uniform float uPersp; // PERSP
uniform float uScale; // sphere radius / half the canvas span
uniform float uLens;  // LENS: what is seen through the ball is magnified toward the back pole, as the cage's is
out vec3 vView;
out vec3 vNrm;
void main() {
  vec3 p = uM * aPos * uFit;
  vNrm = uM * aNrm;
  float k = uPersp / (uPersp - p.z * 0.5);
  vec2 s = p.xy * k;
  if (p.z < 0.0) {
    float a = uLens * -p.z;
    s *= (1.0 + a) / (1.0 + a * dot(s, s));
  }
  vView = p;
  // View space is y DOWN (as the cage's is); clip space is y up.
  gl_Position = vec4(s.x * uScale, -s.y * uScale, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vView;
in vec3 vNrm;
out vec4 outColor;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uLight;  // 1 on a light ground
uniform float uAlpha;  // cross-fade with the resting glass

${LIQUID_GLOBE_MATERIAL_GLSL}

void main() {
  // The smooth normal points out of the ORIGINAL outside (the winding's side); which way it faces says which side of
  // the sheet you are looking at. Then it is turned to face the eye for the lighting.
  vec3 n = normalize(vNrm);
  float outside = step(0.0, n.z);
  if (n.z < 0.0) n = -n;
  vec3 eye = vec3(0.0, 0.0, 1.0);
  float facing = clamp(n.z, 0.0, 1.0);
  float fres = pow(1.0 - facing, 3.0);

  // The outside is clear glass in the theme's ink; the inside, as it comes out, carries the accent.
  vec3 tint = mix(uAccent, uInk, outside);

  vec3 rf = reflect(-eye, n);
  vec3 env = globeEnvironment(rf, vec3(0.0), vec3(1.0));
  float spec = globeSpecular(n, eye);

  // Body: a thin coat, deeper at grazing angles where the light path through the sheet is longest.
  float body = (mix(0.16, 0.05, outside) + 0.34 * fres) * mix(0.8, 1.0, uLight);
  // Light added over it: the studio reflection weighted by Fresnel, and the glints.
  float lit = env.g * (0.12 + 0.5 * fres) + spec;
  vec3 glint = vec3(mix(1.0, 0.92, uLight));
  vec3 col = tint * body + glint * lit * 0.55;
  float a = clamp(body + lit * 0.35, 0.0, 0.85);
  outColor = vec4(col, a) * uAlpha;
}`;

type GL = WebGL2RenderingContext;

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

export interface SkinPalette {
  ink: readonly [number, number, number];
  accent: readonly [number, number, number];
  /** 1 on a light ground, 0 on a dark one. */
  light: number;
}

export class SelfEvertSkin {
  readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private lost = false;
  private px = 0;
  private positions: Float32Array;
  /** `evert` writes doubles; the GPU takes floats. */
  private positions64: Float64Array;
  private posBuf: WebGLBuffer | null = null;
  private nrmBuf: WebGLBuffer | null = null;
  /** Smooth per-vertex normals, summed from the faces each frame. */
  private normals: Float32Array;
  private readonly mesh: Mesh;
  private u: {
    m: WebGLUniformLocation | null;
    fit: WebGLUniformLocation | null;
    persp: WebGLUniformLocation | null;
    lens: WebGLUniformLocation | null;
    scale: WebGLUniformLocation | null;
    ink: WebGLUniformLocation | null;
    accent: WebGLUniformLocation | null;
    light: WebGLUniformLocation | null;
    alpha: WebGLUniformLocation | null;
  } | null = null;
  private readonly m3 = new Float32Array(9);

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.mesh = buildMesh(N_THETA, N_PHI);
    this.positions = new Float32Array(this.mesh.vertexCount * 3);
    this.positions64 = new Float64Array(this.mesh.vertexCount * 3);
    this.normals = new Float32Array(this.mesh.vertexCount * 3);
    canvas.className = 'radial-globe__skin';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.gl = null;
      this.u = null;
      this.posBuf = null;
      this.nrmBuf = null;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.px = 0;
      this.init();
    });
  }

  static create(): SelfEvertSkin | null {
    const s = new SelfEvertSkin(document.createElement('canvas'));
    return s.init() ? s : null;
  }

  /** Whether frames drawn now will show. */
  get ready(): boolean {
    return !this.lost && this.gl !== null;
  }

  private init(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    }) as GL | null;
    if (!gl) return false;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aNrm');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);

    // Both sides are drawn (the eversion shows each in turn), blended as layered glass, no depth test.
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.frontFace(gl.CCW);
    gl.clearColor(0, 0, 0, 0);

    const loc = (name: string) => gl.getUniformLocation(prog, name);
    this.u = {
      m: loc('uM'),
      fit: loc('uFit'),
      persp: loc('uPersp'),
      lens: loc('uLens'),
      scale: loc('uScale'),
      ink: loc('uInk'),
      accent: loc('uAccent'),
      light: loc('uLight'),
      alpha: loc('uAlpha'),
    };
    this.gl = gl;
    this.posBuf = posBuf;
    this.nrmBuf = nrmBuf;
    this.px = 0;
    return true;
  }

  /**
   * Size the backing store for a canvas `spanCss` across, the sphere being `radiusCss` in radius at its centre (the
   * cage's bled box). Only on a real size change — never per frame.
   */
  resize(spanCss: number, radiusCss: number, dpr: number): void {
    const gl = this.gl;
    const u = this.u;
    const px = Math.max(1, Math.round(spanCss * Math.min(dpr, SKIN_MAX_DPR)));
    if (px !== this.px) {
      this.px = px;
      this.canvas.width = px;
      this.canvas.height = px;
    }
    if (!gl || !u) return;
    gl.viewport(0, 0, px, px);
    gl.uniform1f(u.scale, radiusCss / (spanCss / 2));
  }

  palette(p: SkinPalette, persp: number, lens: number): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.uniform3f(u.ink, p.ink[0], p.ink[1], p.ink[2]);
    gl.uniform3f(u.accent, p.accent[0], p.accent[1], p.accent[2]);
    gl.uniform1f(u.light, p.light);
    gl.uniform1f(u.persp, persp);
    gl.uniform1f(u.lens, lens);
  }

  /**
   * Draw the surface at eversion `e ∈ [0, 1]`, turned by `m` (the cage's drawn rotation, row-major 3×3, body → view)
   * and scaled by `fit`.
   */
  render(e: number, m: ArrayLike<number>, fit: number, alpha = 1): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return;
    const { domain, vertexCount, indexCount, indices } = this.mesh;
    const p64 = this.positions64;
    for (let i = 0; i < vertexCount; i++) evert(domain[i * 2]!, domain[i * 2 + 1]!, e, p64, i * 3);
    const pos = this.positions;
    pos.set(p64);
    // Area-weighted face normals, summed per vertex. The mesh winds counter-clockwise seen from the original outside,
    // so (b − a) × (c − a) points out of that side at every e; the shader normalises.
    const nrm = this.normals;
    nrm.fill(0);
    for (let t = 0; t < indexCount; t += 3) {
      const a = indices[t]! * 3;
      const b = indices[t + 1]! * 3;
      const c = indices[t + 2]! * 3;
      const ux = p64[b]! - p64[a]!;
      const uy = p64[b + 1]! - p64[a + 1]!;
      const uz = p64[b + 2]! - p64[a + 2]!;
      const vx = p64[c]! - p64[a]!;
      const vy = p64[c + 1]! - p64[a + 1]!;
      const vz = p64[c + 2]! - p64[a + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      nrm[a] += nx;
      nrm[a + 1] += ny;
      nrm[a + 2] += nz;
      nrm[b] += nx;
      nrm[b + 1] += ny;
      nrm[b + 2] += nz;
      nrm[c] += nx;
      nrm[c + 1] += ny;
      nrm[c + 2] += nz;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, nrm);
    // GLSL matrices are column-major: upload the transpose so `uM * p` is LiquidGlobe's `m · p`.
    const t = this.m3;
    t[0] = m[0]!;
    t[1] = m[3]!;
    t[2] = m[6]!;
    t[3] = m[1]!;
    t[4] = m[4]!;
    t[5] = m[7]!;
    t[6] = m[2]!;
    t[7] = m[5]!;
    t[8] = m[8]!;
    gl.uniformMatrix3fv(u.m, false, t);
    gl.uniform1f(u.fit, fit);
    gl.uniform1f(u.alpha, alpha);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
  }

  /** Clear the canvas (between runs it shows nothing). */
  clear(): void {
    const gl = this.gl;
    if (!gl || this.lost) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
