/**
 * The globe cursor's GPU surface: a WebGL 2 sprite the engine composites onto
 * the cursor overlay.
 *
 * Why the GPU: the Canvas 2D path flat-shades one polygon per grid quad, so at
 * cursor size it reads as a low-poly ball however fine the grid. Here the
 * vertex shader evaluates the eversion itself — `EVERSION_GLSL`, the port of
 * `lib/eversion/thurston.ts` that the page-transition effect already ships and
 * tests against the oracle — on a 128×64 grid (medium detail), with the exact
 * surface normal, and the fragment shader lights every pixel from the
 * interpolated normal. The result is smooth shading, MSAA edges, and grid lines
 * and dots drawn analytically (`fwidth`) so the wireframe and point styles stay
 * crisp at any size.
 *
 * Owns no loop: the engine calls `render` from its own frame.
 */

import { EVERSION_GLSL, GLSL_HEADER } from '@/lib/eversion/gl/shaders';
import { probeGpu } from '@/lib/render/probe';
import type { CursorDetail } from './settings';

/**
 * Vertex grid per detail level. Smoothness comes from the per-pixel normal, so
 * the grid only has to keep the silhouette and the corrugation folds round: at
 * the default 34 px a medium quad is already well under a pixel.
 */
const GRID: Record<CursorDetail, [number, number]> = {
  low: [48, 24],
  medium: [96, 48],
  high: [160, 80],
};

const PALETTE_ID = { duo: 0, rainbow: 1, checker: 2, aurora: 3 } as const;
const STYLE_ID = { solid: 0, glass: 1, wire: 2, dots: 3 } as const;

export interface GlFrame {
  /** Sprite side, device px. */
  px: number;
  detail: CursorDetail;
  /** Eversion stage parameters (`stageParams(e)`). */
  stage: Float64Array;
  /** Tilt · orientation, row-major. */
  model: Float64Array;
  /** Screen-plane squash/stretch/squish, row-major. */
  deform: Float64Array;
  /** Inverse-transpose of `deform`, row-major. */
  deformIT: Float64Array;
  /** Clip units per unit radius. */
  scale: number;
  wobble: number;
  time: number;
  /** Dot diameter for the point-cloud style, device px. */
  pointPx: number;
  palette: keyof typeof PALETTE_ID;
  style: keyof typeof STYLE_ID;
  /** (hue deg, saturation 0–1, lightness 0–1), already vibrance- and hue-adjusted and swapped for the cycle. */
  outside: [number, number, number];
  inside: [number, number, number];
  /** Linear 0–1 RGB. */
  glowRgb: [number, number, number];
  hueShift: number;
  vibrance: number;
  shine: number;
  glow: number;
}

const VERT = `${GLSL_HEADER}
${EVERSION_GLSL}
in vec2 a_tp;
uniform mat3 u_model;
uniform mat3 u_deform;
uniform mat3 u_normalMat;
uniform float u_scale;
uniform float u_wobble;
uniform float u_time;
uniform float u_pointPx;
out vec3 v_n;
out vec2 v_tp;
void main() {
  float theta = a_tp.x;
  float phi = a_tp.y;
  Frame fr = evertFrame(latToU(phi));
  vec3 p = evertPoint(fr, theta);
  vec3 n = evertNormal(theta, phi, fr);
  p *= 1.0 + u_wobble * sin(3.0 * theta + 2.0 * phi + u_time * 7.0);
  vec3 q = u_deform * (u_model * p);
  v_n = u_normalMat * n;
  v_tp = a_tp;
  /* body space is y-down, z toward the viewer; clip space is y-up, smaller z nearer */
  gl_Position = vec4(q.x * u_scale, -q.y * u_scale, -q.z * u_scale * 0.25, 1.0);
  gl_PointSize = u_pointPx;
}
`;

const FRAG = `${GLSL_HEADER}
in vec3 v_n;
in vec2 v_tp;
uniform int u_palette;
uniform int u_style;
uniform vec3 u_out;
uniform vec3 u_in;
uniform vec3 u_glowRgb;
uniform float u_hue;
uniform float u_vib;
uniform float u_shine;
uniform float u_glow;
out vec4 o_color;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + h / 30.0, 12.0);
  float a = s * min(l, 1.0 - l);
  return vec3(l) - a * max(min(min(k - 3.0, 9.0 - k), vec3(1.0)), vec3(-1.0));
}

void main() {
  vec3 n = normalize(v_n);
  bool outside = n.z >= 0.0;
  if (!outside) n = -n;

  float t01 = (v_tp.x + PI) / TAU;
  float p01 = (v_tp.y + HALF_PI) / PI;
  float strip = floor(t01 * STRIPS);

  /* base colour as (hue deg, saturation, lightness): shading moves lightness and keeps
     saturation, so a lit blue stays blue instead of greying out as plain RGB scaling does */
  vec3 base;
  if (u_palette == 1) {
    base = vec3(mod(strip * 45.0 + p01 * 30.0 + u_hue, 360.0), clamp(0.85 * u_vib, 0.0, 1.0), outside ? 0.58 : 0.36);
  } else if (u_palette == 2) {
    float band = floor(p01 * 6.0);
    bool odd = mod(strip + band, 2.0) > 0.5;
    base = (odd != outside) ? u_out : u_in;
  } else if (u_palette == 3) {
    vec3 from = outside ? u_out : u_in;
    vec3 to = outside ? u_in : u_out;
    float dh = mod(to.x - from.x + 540.0, 360.0) - 180.0;
    base = vec3(mod(from.x + dh * p01, 360.0), mix(from.yz, to.yz, p01));
  } else {
    base = outside ? u_out : u_in;
  }

  vec3 L = normalize(vec3(-0.45, -0.65, 0.62));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diffuse = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 48.0) * u_shine;
  float rim = pow(1.0 - n.z, 2.0);
  float light = clamp(base.z * (0.32 + 0.78 * diffuse) + spec * 0.45 + rim * u_glow * 0.14, 0.04, 0.97);
  vec3 col = hsl2rgb(base.x, base.y, light) + vec3(spec) * 0.2 + u_glowRgb * rim * u_glow * 0.12;
  col = clamp(col, 0.0, 1.0);

  float alpha = 1.0;
  if (u_style == 1) {
    alpha = clamp(0.32 + rim * 0.55 + spec * 0.4, 0.0, 1.0);
  } else if (u_style >= 2) {
    vec2 g = vec2(t01 * 32.0, p01 * 16.0);
    vec2 w = max(fwidth(g), vec2(1e-4));
    if (u_style == 2) {
      vec2 d = abs(fract(g - 0.5) - 0.5) / w;
      alpha = 1.0 - min(min(d.x, d.y) / 0.9, 1.0);
    } else {
      /* a point sprite: a round, antialiased dot that stays round however the surface stretches */
      float r = length(gl_PointCoord - 0.5) * 2.0;
      float aa = max(fwidth(r), 1e-3);
      alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
    }
    alpha *= 0.45 + 0.55 * n.z;
    col = clamp(col * 1.15 + 0.05, 0.0, 1.0);
  }
  if (alpha < 0.004) discard;
  o_color = vec4(col * alpha, alpha);
}
`;

/**
 * (θ, φ) pairs. The triangle mesh needs every row complete (duplicated seam and
 * pole vertices are what make it a closed grid); the point cloud wants each
 * pole and the seam column exactly once, or they draw as brighter dots.
 */
function grid(nT: number, nP: number, closed: boolean): Float32Array {
  const out: number[] = [];
  for (let j = 0; j <= nP; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / nP;
    const pole = j === 0 || j === nP;
    const cols = closed ? nT : pole ? 0 : nT - 1;
    for (let i = 0; i <= cols; i++) out.push(-Math.PI + (2 * Math.PI * i) / nT, phi);
  }
  return new Float32Array(out);
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`globe cursor shader: ${log ?? 'compile failed'}`);
  }
  return sh;
}

/** Row-major 3×3 → the column-major Float32Array GL wants. */
function colMajor(m: Float64Array, out: Float32Array): Float32Array {
  out[0] = m[0]!;
  out[1] = m[3]!;
  out[2] = m[6]!;
  out[3] = m[1]!;
  out[4] = m[4]!;
  out[5] = m[7]!;
  out[6] = m[2]!;
  out[7] = m[5]!;
  out[8] = m[8]!;
  return out;
}

export class GlobeGl {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject | null = null;
  private pointVao: WebGLVertexArrayObject | null = null;
  private pointCount = 0;
  private buffers: WebGLBuffer[] = [];
  private indexCount = 0;
  private detail: CursorDetail | null = null;
  private lost = false;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private m1 = new Float32Array(9);
  private m2 = new Float32Array(9);
  private m3 = new Float32Array(9);
  private stage = new Float32Array(8);
  private nm = new Float64Array(9);

  /**
   * Returns null where WebGL 2 is unavailable or the shader will not build; the
   * engine then draws on the CPU (faceted). On a software rasteriser
   * (SwiftShader, llvmpipe — what a blocklisted driver falls back to) the
   * eversion per vertex is the expensive part, so the mesh is capped at the
   * coarsest grid there; the per-pixel normal keeps it smooth regardless.
   */
  static create(): GlobeGl | null {
    try {
      return new GlobeGl(probeGpu().gpuTier === 0);
    } catch {
      return null;
    }
  }

  private constructor(private readonly software: boolean) {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      depth: true,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('webgl2 unavailable');
    this.gl = gl;
    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(program, 0, 'a_tp');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`globe cursor program: ${gl.getProgramInfoLog(program) ?? 'link failed'}`);
    }
    this.program = program;
    for (const name of [
      'u_stageParams',
      'u_model',
      'u_deform',
      'u_normalMat',
      'u_scale',
      'u_wobble',
      'u_time',
      'u_pointPx',
      'u_palette',
      'u_style',
      'u_out',
      'u_in',
      'u_glowRgb',
      'u_hue',
      'u_vib',
      'u_shine',
      'u_glow',
    ]) {
      this.loc[name] = gl.getUniformLocation(program, name);
    }
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  /** False once the context is lost; the engine falls back to the CPU path for good. */
  get ok(): boolean {
    return !this.lost && !this.gl.isContextLost();
  }

  private buildMesh(detail: CursorDetail): void {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.pointVao) gl.deleteVertexArray(this.pointVao);
    const [nT, nP] = GRID[detail];
    const verts = grid(nT, nP, true);
    const idx = new Uint32Array(nT * nP * 6);
    let k = 0;
    for (let j = 0; j < nP; j++) {
      for (let i = 0; i < nT; i++) {
        const a = j * (nT + 1) + i;
        const b = a + 1;
        const c = a + nT + 2;
        const d = a + nT + 1;
        idx[k++] = a;
        idx[k++] = b;
        idx[k++] = c;
        idx[k++] = a;
        idx[k++] = c;
        idx[k++] = d;
      }
    }
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    const ib = gl.createBuffer();
    if (!vb || !ib) throw new Error('createBuffer failed');
    this.buffers = [vb, ib];
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.indexCount = idx.length;

    // The point cloud: a coarser grid, poles and seam once each.
    const points = grid(nT / 4, nP / 4, false);
    this.pointVao = gl.createVertexArray();
    gl.bindVertexArray(this.pointVao);
    const pb = gl.createBuffer();
    if (!pb) throw new Error('createBuffer failed');
    this.buffers.push(pb);
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.pointCount = points.length / 2;
    this.detail = detail;
  }

  render(f: GlFrame): HTMLCanvasElement {
    const gl = this.gl;
    if (this.canvas.width !== f.px) {
      this.canvas.width = f.px;
      this.canvas.height = f.px;
    }
    const detail = this.software ? 'low' : f.detail;
    if (this.detail !== detail) this.buildMesh(detail);

    gl.viewport(0, 0, f.px, f.px);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const L = this.loc;
    for (let i = 0; i < 8; i++) this.stage[i] = f.stage[i] ?? 0;
    gl.uniform1fv(L.u_stageParams!, this.stage);
    gl.uniformMatrix3fv(L.u_model!, false, colMajor(f.model, this.m1));
    gl.uniformMatrix3fv(L.u_deform!, false, colMajor(f.deform, this.m2));
    // Normals: inverse-transpose of (deform · model) = deformIT · model, since the model is a rotation.
    const nm = this.nm;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        nm[r * 3 + c] =
          f.deformIT[r * 3]! * f.model[c]! +
          f.deformIT[r * 3 + 1]! * f.model[3 + c]! +
          f.deformIT[r * 3 + 2]! * f.model[6 + c]!;
      }
    }
    gl.uniformMatrix3fv(L.u_normalMat!, false, colMajor(nm, this.m3));
    gl.uniform1f(L.u_scale!, f.scale);
    gl.uniform1f(L.u_wobble!, f.wobble);
    gl.uniform1f(L.u_time!, f.time);
    gl.uniform1f(L.u_pointPx!, f.pointPx);
    gl.uniform1i(L.u_palette!, PALETTE_ID[f.palette]);
    gl.uniform1i(L.u_style!, STYLE_ID[f.style]);
    gl.uniform3fv(L.u_out!, f.outside);
    gl.uniform3fv(L.u_in!, f.inside);
    gl.uniform3fv(L.u_glowRgb!, f.glowRgb);
    gl.uniform1f(L.u_hue!, f.hueShift);
    gl.uniform1f(L.u_vib!, f.vibrance);
    gl.uniform1f(L.u_shine!, f.shine);
    gl.uniform1f(L.u_glow!, f.glow);

    const opaque = f.style === 'solid';
    gl.disable(gl.CULL_FACE);
    if (opaque) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    } else {
      // Translucent styles: every layer of the self-intersecting surface shows through.
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    if (f.style === 'dots') {
      gl.bindVertexArray(this.pointVao);
      gl.drawArrays(gl.POINTS, 0, this.pointCount);
    } else {
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    return this.canvas;
  }

  dispose(): void {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    if (this.vao) gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
