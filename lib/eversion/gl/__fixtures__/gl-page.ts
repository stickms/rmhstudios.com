/**
 * The test page's script for `testing/e2e/eversion-gl.mjs` (T23). Bundled by
 * esbuild for that script only — it is not imported by the app.
 *
 * Unlike `renderer-page.ts` (T24, which pins the STUB shaders and a local mesh),
 * this page runs the REAL shaders on the REAL mesh and the REAL baked LUTs of all
 * five projections. The oracle is the real `thurston.ts` (T08).
 *
 * It exposes `window.__g`, scenario functions the Playwright script calls.
 */

import { GLSL_HEADER, EVERSION_GLSL, getShaderSet } from '../shaders';
import { createSnapshot } from '../../snapshot';
import { getBakedLut } from '../../projection-lut';
import { meshForTier } from '../../mesh';
import { PROJECTION_IDS } from '../../types';
import type { ProjectionId, Rgba, ThemeColours, Tier, TimelineSnapshot } from '../../types';
import { createRenderer } from '../renderer';
import { evert, normal, stageParams } from '../../thurston';

const o3 = new Float64Array(3);
function evertOracle(theta: number, phi: number, e: number): [number, number, number] {
  evert(theta, phi, e, o3, 0);
  return [o3[0]!, o3[1]!, o3[2]!];
}
function normalOracle(theta: number, phi: number, e: number): [number, number, number] {
  normal(theta, phi, e, o3, 0);
  return [o3[0]!, o3[1]!, o3[2]!];
}

const VIEW = { w: 640, h: 400, dpr: 1 } as const;

/** Theme colours that look like the dark theme: used for the screenshots. */
const THEMED: ThemeColours = {
  bg: [0.04, 0.05, 0.08, 1],
  veil: [0.07, 0.08, 0.12, 1],
  accent: [0.38, 0.55, 1, 1],
  cageMinor: [0.7, 0.8, 1, 0.2],
  cageParallel: [0.7, 0.8, 1, 0.13],
  cageMajor: [0.8, 0.9, 1, 0.34],
  cageRipple: [0.6, 0.85, 1, 0.8],
  cageWidth: 1.2,
};

/** Test colours: no cage, no rim, no accent, so a red page can only ever be red. */
const CLEAR: Rgba = [0, 0, 0, 0];
const PLAIN: ThemeColours = {
  bg: [1, 1, 1, 1],
  veil: [0.2, 0.2, 0.2, 1],
  accent: [0.2, 0.2, 0.2, 1],
  cageMinor: CLEAR,
  cageParallel: CLEAR,
  cageMajor: CLEAR,
  cageRipple: CLEAR,
  cageWidth: 1,
};

/** `M_after`: the end map is `R = −I`; with no alignment spin, `M_after = −I`. Column-major. */
const M_AFTER = new Float64Array([-1, 0, 0, 0, -1, 0, 0, 0, -1]);

let canvas: HTMLCanvasElement | null = null;
let renderer: ReturnType<typeof createRenderer> | null = null;
let lastTier: Tier = 'mid';

function gl(): WebGL2RenderingContext {
  return canvas!.getContext('webgl2') as WebGL2RenderingContext;
}

function snapshot(patch: Partial<TimelineSnapshot> = {}): TimelineSnapshot {
  return {
    ...createSnapshot(),
    radius: 0.44 * Math.min(VIEW.w, VIEW.h),
    centreX: VIEW.w / 2,
    centreY: VIEW.h / 2,
    ...patch,
  };
}

/** A recognisable page: gradient, 40 px grid, big label, corner marks, a centre cross. */
async function testCard(label: string, hue: number): Promise<ImageBitmap> {
  const c = document.createElement('canvas');
  c.width = VIEW.w;
  c.height = VIEW.h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, VIEW.w, VIEW.h);
  grad.addColorStop(0, `hsl(${hue}, 70%, 55%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 30%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, VIEW.w, VIEW.h);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1;
  for (let x = 0; x <= VIEW.w; x += 40) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, VIEW.h);
    g.stroke();
  }
  for (let y = 0; y <= VIEW.h; y += 40) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(VIEW.w, y + 0.5);
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 120px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, VIEW.w / 2, VIEW.h / 2);
  const marks: [number, number, string][] = [
    [0, 0, '#f00'],
    [VIEW.w - 40, 0, '#0f0'],
    [0, VIEW.h - 40, '#00f'],
    [VIEW.w - 40, VIEW.h - 40, '#ff0'],
  ];
  for (const [x, y, col] of marks) {
    g.fillStyle = col;
    g.fillRect(x, y, 40, 40);
  }
  return createImageBitmap(c);
}

/** Classify the drawing buffer: red / blue / veil-grey / anything else. */
function classify() {
  const ctx = gl();
  const w = canvas!.width;
  const h = canvas!.height;
  const px = new Uint8Array(w * h * 4);
  ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
  let red = 0;
  let blue = 0;
  let grey = 0;
  let other = 0;
  const blueAt: number[] = [];
  const redAt: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    // A SOLID pixel: MSAA edge pixels (a sample of the other sheet, or of the veil) are partial mixes and
    // land in `other`; "no blue at e = 0" is about pixels that are blue, not about antialiased rims.
    if (r > 120 && g < 40 && b < 40) {
      red++;
      if (redAt.length < 20) redAt.push((i / 4) % w, h - 1 - Math.floor(i / 4 / w));
    } else if (b > 120 && r < 40 && g < 40) {
      if (blueAt.length < 20) blueAt.push((i / 4) % w, h - 1 - Math.floor(i / 4 / w));
      blue++;
      if (blueAt.length < 20) blueAt.push((i / 4) % w, h - 1 - Math.floor(i / 4 / w));
    }
    else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 14) grey++;
    else other++;
  }
  const n = w * h;
  return { red: red / n, blue: blue / n, grey: grey / n, other: other / n, pixels: n, blueAt, redAt };
}

const api = {
  projections: [...PROJECTION_IDS] as ProjectionId[],

  /** (Re)create the renderer on a fresh canvas. Throws with the GLSL log if the real shaders fail. */
  init(tier: Tier = 'mid') {
    canvas?.remove();
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    lastTier = tier;
    renderer = createRenderer(canvas, { tier, dprCap: 1 });
    return { live: renderer.counters().live };
  },

  prime(projection: ProjectionId, themed: boolean) {
    const baked = getBakedLut(projection, VIEW);
    renderer!.prime({
      projection,
      viewport: { ...VIEW },
      globe: { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, centre: [VIEW.w / 2, VIEW.h / 2], radius: 60 },
      orb: { cx: 0, cy: 0, radius: 10 },
      colours: themed ? THEMED : PLAIN,
      lut: baked.data,
      mAfter: M_AFTER,
    });
    return { w: canvas!.width, h: canvas!.height };
  },

  async cards() {
    const before = await testCard('BEFORE', 20);
    const after = await testCard('AFTER', 200);
    renderer!.setTexture('before', before);
    renderer!.setTexture('after', after);
    renderer!.setTexture('placeholder', after);
    before.close();
    after.close();
  },

  solid(before: Rgba, after: Rgba) {
    window.__eversion!.renderer!.solidTextures(before, after);
  },

  /** Draw one frame; returns the GL error code (0 = none) and, if asked, a PNG data URL. */
  frame(patch: Partial<TimelineSnapshot>, png = false) {
    renderer!.draw(snapshot(patch));
    const ctx = gl();
    const err = ctx.getError();
    return { err, png: png ? canvas!.toDataURL('image/png') : null };
  },

  /** Draw then classify the pixels (the S#28 histogram). */
  histogram(patch: Partial<TimelineSnapshot>) {
    renderer!.draw(snapshot(patch));
    const err = gl().getError();
    return { err, ...classify(), png: canvas!.toDataURL('image/png') };
  },

  /** S#27: `F` from transform feedback against the TS port at 64 values of `e`. */
  parity() {
    const es = new Float32Array(64);
    for (let k = 0; k < 64; k++) es[k] = k / 63;
    const t0 = performance.now();
    const out = renderer!.debugEvaluate(es);
    const ms = performance.now() - t0;
    const mesh = meshForTier(lastTier);
    const vc = mesh.vertexCount;
    let worst = 0;
    let worstAt = { e: 0, theta: 0, phi: 0, vertex: 0 };
    let over1e4 = 0;
    let over1e3 = 0;
    let nan = 0;
    let sumSq = 0;
    let count = 0;
    const perE = new Float64Array(64);
    for (let k = 0; k < 64; k++) {
      for (let v = 0; v < vc; v++) {
        const theta = mesh.domain[v * 2]!;
        const phi = mesh.domain[v * 2 + 1]!;
        const want = evertOracle(theta, phi, es[k]!);
        let d = 0;
        for (let c = 0; c < 3; c++) {
          const got = out[(k * vc + v) * 3 + c]!;
          if (!Number.isFinite(got)) nan++;
          d = Math.max(d, Math.abs(got - want[c]!));
          sumSq += (got - want[c]!) ** 2;
          count++;
        }
        if (d > 1e-4) over1e4++;
        if (d > 1e-3) over1e3++;
        perE[k] = Math.max(perE[k]!, d);
        if (d > worst) {
          worst = d;
          worstAt = { e: es[k]!, theta, phi, vertex: v };
        }
      }
    }
    return {
      vertices: vc,
      es: es.length,
      worst,
      worstAt,
      rms: Math.sqrt(sumSq / count),
      over1e4,
      over1e3,
      nan,
      ms,
      perE: Array.from(perE),
    };
  },

  /**
   * The normal, against the oracle's. Uses its own transform-feedback program
   * built from the shipped GLSL chunk (the renderer only exposes `F`), on a
   * separate context, over a sample of the mesh and 9 values of `e`.
   */
  normals() {
    const c2 = document.createElement('canvas');
    const g = c2.getContext('webgl2')!;
    const vs = `${GLSL_HEADER}
layout(location = 0) in vec2 a_domain;
${EVERSION_GLSL}
out vec3 v_N;
void main() {
  v_N = evertNormal(a_domain.x, a_domain.y, evertFrame(latToU(a_domain.y)));
  gl_Position = vec4(0.0);
}`;
    const fs = `${GLSL_HEADER}
out vec4 o;
void main() { o = vec4(0.0); }`;
    const prog = g.createProgram()!;
    for (const [type, src] of [
      [g.VERTEX_SHADER, vs],
      [g.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = g.createShader(type)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'compile');
      g.attachShader(prog, s);
    }
    g.bindAttribLocation(prog, 0, 'a_domain');
    g.transformFeedbackVaryings(prog, ['v_N'], g.INTERLEAVED_ATTRIBS);
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog) ?? 'link');

    const mesh = meshForTier('mid');
    const vc = mesh.vertexCount;
    const vao = g.createVertexArray();
    g.bindVertexArray(vao);
    const vbo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, mesh.domain, g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    const tfb = g.createBuffer();
    g.bindBuffer(g.TRANSFORM_FEEDBACK_BUFFER, tfb);
    g.bufferData(g.TRANSFORM_FEEDBACK_BUFFER, vc * 12, g.DYNAMIC_READ);
    const tf = g.createTransformFeedback();
    g.bindTransformFeedback(g.TRANSFORM_FEEDBACK, tf);
    g.useProgram(prog);
    g.enable(g.RASTERIZER_DISCARD);
    const loc = g.getUniformLocation(prog, 'u_stageParams');
    const sp = new Float64Array(8);
    const sp32 = new Float32Array(8);
    const row = new Float32Array(vc * 3);

    let worstDeg = 0;
    let worstAt = { e: 0, theta: 0, phi: 0 };
    let over1 = 0;
    let n = 0;
    let worstAwayFromSeam = 0;
    const perE: { e: number; worstDeg: number; flipped: number }[] = [];
    for (const e of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      stageParams(e, sp);
      sp32.set(sp);
      g.uniform1fv(loc, sp32);
      g.bindBufferBase(g.TRANSFORM_FEEDBACK_BUFFER, 0, tfb);
      g.beginTransformFeedback(g.POINTS);
      g.drawArrays(g.POINTS, 0, vc);
      g.endTransformFeedback();
      g.bindBufferBase(g.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      g.bindBuffer(g.COPY_READ_BUFFER, tfb);
      g.getBufferSubData(g.COPY_READ_BUFFER, 0, row);
      g.bindBuffer(g.COPY_READ_BUFFER, null);
      let eWorst = 0;
      let eFlipped = 0;
      let eSamples = 0;
      for (let v = 0; v < vc; v += 5) {
        const theta = mesh.domain[v * 2]!;
        const phi = mesh.domain[v * 2 + 1]!;
        const want = normalOracle(theta, phi, e);
        const a = [row[v * 3]!, row[v * 3 + 1]!, row[v * 3 + 2]!];
        const dot = Math.min(1, Math.max(-1, a[0]! * want[0] + a[1]! * want[1] + a[2]! * want[2]));
        const deg = (Math.acos(dot) * 180) / Math.PI;
        n++;
        eSamples++;
        if (dot < 0) eFlipped++;
        eWorst = Math.max(eWorst, deg);
        if (deg > 1) over1++;
        if (deg > worstDeg) {
          worstDeg = deg;
          worstAt = { e, theta, phi };
        }
        if (Math.abs(phi) < Math.PI / 2 - 0.2) worstAwayFromSeam = Math.max(worstAwayFromSeam, deg);
      }
      perE.push({ e, worstDeg: eWorst, flipped: eFlipped / eSamples });
    }
    return { samples: n, worstDeg, worstAt, over1deg: over1, worstMidLatDeg: worstAwayFromSeam, perE };
  },

  /** Worst absolute error of the GL stack's sin/cos over [-2pi, 2pi] (explains the S#27 floor). */
  trigError() {
    const c4 = document.createElement('canvas');
    const g4 = c4.getContext('webgl2')!;
    const vs = `#version 300 es
precision highp float;
in float a_x;
out vec2 v_sc;
void main() { v_sc = vec2(sin(a_x), cos(a_x)); gl_Position = vec4(0.0); }`;
    const fs = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;
    const prog = g4.createProgram()!;
    for (const [type, src] of [
      [g4.VERTEX_SHADER, vs],
      [g4.FRAGMENT_SHADER, fs],
    ] as const) {
      const sh = g4.createShader(type)!;
      g4.shaderSource(sh, src);
      g4.compileShader(sh);
      g4.attachShader(prog, sh);
    }
    g4.bindAttribLocation(prog, 0, 'a_x');
    g4.transformFeedbackVaryings(prog, ['v_sc'], g4.INTERLEAVED_ATTRIBS);
    g4.linkProgram(prog);
    const n = 20000;
    const xs = new Float32Array(n);
    for (let i = 0; i < n; i++) xs[i] = (i / (n - 1)) * 4 * Math.PI - 2 * Math.PI;
    const vao = g4.createVertexArray();
    g4.bindVertexArray(vao);
    const vb = g4.createBuffer();
    g4.bindBuffer(g4.ARRAY_BUFFER, vb);
    g4.bufferData(g4.ARRAY_BUFFER, xs, g4.STATIC_DRAW);
    g4.enableVertexAttribArray(0);
    g4.vertexAttribPointer(0, 1, g4.FLOAT, false, 0, 0);
    const tb = g4.createBuffer();
    g4.bindBuffer(g4.TRANSFORM_FEEDBACK_BUFFER, tb);
    g4.bufferData(g4.TRANSFORM_FEEDBACK_BUFFER, n * 8, g4.DYNAMIC_READ);
    g4.useProgram(prog);
    g4.enable(g4.RASTERIZER_DISCARD);
    g4.bindBufferBase(g4.TRANSFORM_FEEDBACK_BUFFER, 0, tb);
    g4.beginTransformFeedback(g4.POINTS);
    g4.drawArrays(g4.POINTS, 0, n);
    g4.endTransformFeedback();
    g4.bindBufferBase(g4.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    g4.bindBuffer(g4.COPY_READ_BUFFER, tb);
    const out = new Float32Array(n * 2);
    g4.getBufferSubData(g4.COPY_READ_BUFFER, 0, out);
    let worst = 0;
    for (let i = 0; i < n; i++) {
      worst = Math.max(worst, Math.abs(out[i * 2]! - Math.sin(xs[i]!)), Math.abs(out[i * 2 + 1]! - Math.cos(xs[i]!)));
    }
    return worst;
  },

  /** Compile and link every program of the real shader set on this browser; returns the info logs (empty = clean). */
  compileLog() {
    const c3 = document.createElement('canvas');
    const g = c3.getContext('webgl2');
    if (!g) return { webgl2: false, logs: [] as string[] };
    const set = getShaderSet();
    const logs: string[] = [];
    const progs: [string, { vertex: string; fragment: string }][] = [
      ['surface', set.surface],
      ['cage', set.cage],
      ['feedback', set.feedback],
    ];
    for (const [name, src] of progs) {
      const p = g.createProgram()!;
      for (const [type, text, label] of [
        [g.VERTEX_SHADER, src.vertex, 'vertex'],
        [g.FRAGMENT_SHADER, src.fragment, 'fragment'],
      ] as const) {
        const s = g.createShader(type)!;
        g.shaderSource(s, text);
        g.compileShader(s);
        const log = g.getShaderInfoLog(s) ?? '';
        if (!g.getShaderParameter(s, g.COMPILE_STATUS)) logs.push(`${name} ${label}: ${log}`);
        else if (log.trim()) logs.push(`${name} ${label} (warning): ${log}`);
        g.attachShader(p, s);
      }
      if (name === 'feedback') g.transformFeedbackVaryings(p, [...set.feedback.varyings], g.INTERLEAVED_ATTRIBS);
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) logs.push(`${name} link: ${g.getProgramInfoLog(p)}`);
    }
    return { webgl2: true, logs, renderer: String(g.getParameter(g.RENDERER)) };
  },

  dispose: () => renderer?.dispose(),
};

(window as unknown as { __g: typeof api }).__g = api;
