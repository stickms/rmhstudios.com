/**
 * WebGL2 backend (§16.1.4) — the GLSL port of the same visuals the WGSL backend
 * renders. It owns the aurora scene (procedural, so refraction can sample it
 * directly — the §3.6 insight, shader-executed) and draws the registered liquid
 * bodies as SDF rounded-rects/discs with smooth-min merging, edge-band lens
 * refraction, per-channel chromatic dispersion, and fresnel specular from the
 * scene light.
 *
 * Technique credits (adapted, not copied — both MIT):
 *  - SDF rounded-rect, smooth-min, Snell-style bezel refraction & rim specular:
 *    jeantimex/glass-effect-webgpu (glass.wgsl).
 *  - Edge-contour refraction weighting, edge-glow & the dome/curvature blend:
 *    bergice/liquidglass (index.html fragment shader).
 *
 * Zero per-frame allocation: uniform staging arrays are allocated once; `render`
 * only fills + uploads them.
 */

import type { LiquidBody, LiquidRenderer, SceneState } from './types';
import { BODY_CAP } from './registry';
import { MAX_GLOWS } from './scene';

const VERT = `#version 300 es
// Fullscreen triangle — position via gl_VertexID, no attributes/buffers.
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2 uResolution;   // device px
uniform float uDpr;
uniform float uTime;
uniform vec2 uParallax;     // --aurora-mx/my in CSS px
uniform vec2 uLight;        // scene light, viewport-normalized 0..1
uniform vec3 uBaseTop;
uniform vec3 uBaseMid;
uniform vec3 uBaseBot;
uniform vec4 uGlowColor[${MAX_GLOWS}];  // rgb, a
uniform vec4 uGlowGeo[${MAX_GLOWS}];    // cx, cy, sx, sy (viewport-normalized)
uniform float uGlowStop[${MAX_GLOWS}];
uniform int uGlowCount;
uniform vec3 uAccent;
uniform vec3 uRim;
uniform vec4 uBodyRect[${BODY_CAP}];    // cx, cy, hw, hh (device px, top-left origin)
uniform vec4 uBodyParam[${BODY_CAP}];   // radius, press, group, kind
uniform int uBodyCount;

// ── Aurora scene ──────────────────────────────────────────────────────────
vec2 sceneUV(vec2 uv) {
  // Mirror the CSS aurora: a slow drift + the pointer/tilt parallax translate.
  vec2 par = uParallax * uDpr / uResolution;
  vec2 drift = vec2(sin(uTime * 0.05) * 0.010, cos(uTime * 0.04) * 0.008);
  return uv - par * 0.5 + drift;
}

vec3 auroraAt(vec2 uv) {
  float y = clamp(uv.y, 0.0, 1.0);
  vec3 base = y < 0.5 ? mix(uBaseTop, uBaseMid, y * 2.0)
                      : mix(uBaseMid, uBaseBot, (y - 0.5) * 2.0);
  vec3 col = base;
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (i >= uGlowCount) break;
    vec4 gc = uGlowColor[i];
    vec4 gg = uGlowGeo[i];
    vec2 d = (uv - gg.xy) / vec2(max(gg.z, 0.02), max(gg.w, 0.02));
    float dist = length(d);
    float a = gc.a * (1.0 - smoothstep(0.0, uGlowStop[i], dist));
    col = mix(col, gc.rgb, clamp(a, 0.0, 1.0));
  }
  return col;
}

// ── SDF ───────────────────────────────────────────────────────────────────
float roundedRectSDF(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float bodySDF(int i, vec2 p) {
  vec4 rect = uBodyRect[i];
  vec4 prm = uBodyParam[i];
  return roundedRectSDF(p - rect.xy, rect.zw, prm.x);
}

const float SMIN_K = 26.0; // metaball fusion radius (device px, tuned w/ dpr below)

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Merged SDF: smooth-min the members of the pixel's NEAREST non-zero group
// (capsule+droplet, bud+disc — order-independent, so pool compaction can't break
// the merge), plain min for everything else.
float mergedSDF(vec2 p) {
  float best = 1e9;
  float bestGroup = 0.0;
  for (int i = 0; i < ${BODY_CAP}; i++) {
    if (i >= uBodyCount) break;
    float di = bodySDF(i, p);
    if (di < best) { best = di; bestGroup = uBodyParam[i].z; }
  }
  float d = 1e9;
  float k = SMIN_K * uDpr;
  for (int i = 0; i < ${BODY_CAP}; i++) {
    if (i >= uBodyCount) break;
    float di = bodySDF(i, p);
    float g = uBodyParam[i].z;
    if (g != 0.0 && g == bestGroup) { d = smin(d, di, k); }
    else { d = min(d, di); }
  }
  return d;
}

vec2 mergedNormal(vec2 p) {
  float e = 1.0 * uDpr;
  float dx = mergedSDF(p + vec2(e, 0.0)) - mergedSDF(p - vec2(e, 0.0));
  float dy = mergedSDF(p + vec2(0.0, e)) - mergedSDF(p - vec2(0.0, e));
  vec2 n = vec2(dx, dy);
  float len = length(n);
  return len < 0.0001 ? vec2(0.0, -1.0) : n / len;
}

// Nearest body's kind + press (for tint), by |sdf|.
void nearestBody(vec2 p, out float kind, out float press) {
  float best = 1e9;
  kind = 3.0; press = 0.0;
  for (int i = 0; i < ${BODY_CAP}; i++) {
    if (i >= uBodyCount) break;
    float di = abs(bodySDF(i, p));
    if (di < best) { best = di; kind = uBodyParam[i].w; press = uBodyParam[i].y; }
  }
}

void main() {
  // CSS-oriented device px (origin top-left) so body rects (top-left) line up.
  vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 uv = p / uResolution;
  vec3 scene = auroraAt(sceneUV(uv));

  if (uBodyCount == 0) { fragColor = vec4(scene, 1.0); return; }

  float aa = 1.5 * uDpr;
  float d = mergedSDF(p);
  if (d > aa + 1.0) { fragColor = vec4(scene, 1.0); return; }

  vec2 n = mergedNormal(p);
  float kind, press;
  nearestBody(p, kind, press);

  // Bezel band: distance inward from the rim (positive inside).
  float bezel = (16.0 + 10.0 * press) * uDpr;
  float inward = clamp(-d, 0.0, bezel);
  float t = inward / bezel;                    // 0 at rim → 1 at flat interior
  float rimW = 1.0 - t;                         // strongest at the rim

  // Lens displacement: convex edge profile, edge-weighted (bergice contour idea).
  float maxDisp = bezel * (0.95 + 0.6 * press);
  float disp = maxDisp * pow(rimW, 1.3);

  // Cursor bulge: bodies refract subtly toward the pointer (owner mandate §16.1.6).
  vec2 lightPx = uLight * uResolution;
  vec2 toLight = lightPx - p;
  float ldist = length(toLight);
  vec2 lightDir = ldist > 0.001 ? toLight / ldist : vec2(0.0, -1.0);
  float bulge = 6.0 * uDpr * (1.0 - t) * exp(-ldist / (420.0 * uDpr));
  vec2 sampleP = p - n * disp - lightDir * bulge;

  // Chromatic dispersion: per-channel refraction offsets (WGSL ref chain).
  float ca = disp * 0.16;
  vec3 refr;
  refr.r = auroraAt(sceneUV((sampleP - n * (-ca)) / uResolution)).r;
  refr.g = auroraAt(sceneUV(sampleP / uResolution)).g;
  refr.b = auroraAt(sceneUV((sampleP - n * (ca)) / uResolution)).b;

  // Fill tint (capsule/droplet/bud tint toward accent; pane-rim stays clear).
  float tintAmt = kind < 0.5 ? 0.55       // capsule
                 : kind < 1.5 ? 0.55      // droplet
                 : kind < 2.5 ? 0.46      // bud
                 : 0.0;                    // pane-rim
  tintAmt = clamp(tintAmt + press * 0.12, 0.0, 0.85);
  vec3 body = mix(refr, uAccent, tintAmt);

  // Fresnel specular from the scene light — the rim answers the one light.
  float fres = pow(rimW, 2.2);
  float facing = clamp(dot(n, -lightDir), 0.0, 1.0);
  float spec = fres * mix(0.12, 1.0, facing) * (0.7 + 0.6 * press);
  body = mix(body, uRim, clamp(spec, 0.0, 1.0) * 0.9);

  // Inner edge glow (bergice) — a faint bright lip just inside the silhouette.
  float lip = smoothstep(0.0, 2.0 * uDpr, -d) * (1.0 - smoothstep(2.0 * uDpr, 5.0 * uDpr, -d));
  body = mix(body, uRim, lip * 0.18);

  // Antialiased coverage over the scene.
  float cov = 1.0 - smoothstep(-aa, aa, d);
  fragColor = vec4(mix(scene, body, cov), 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[liquid-gl] shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createWebGL2Renderer(canvas: HTMLCanvasElement): LiquidRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[liquid-gl] program link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const loc = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    resolution: loc('uResolution'),
    dpr: loc('uDpr'),
    time: loc('uTime'),
    parallax: loc('uParallax'),
    light: loc('uLight'),
    baseTop: loc('uBaseTop'),
    baseMid: loc('uBaseMid'),
    baseBot: loc('uBaseBot'),
    glowColor: loc('uGlowColor'),
    glowGeo: loc('uGlowGeo'),
    glowStop: loc('uGlowStop'),
    glowCount: loc('uGlowCount'),
    accent: loc('uAccent'),
    rim: loc('uRim'),
    bodyRect: loc('uBodyRect'),
    bodyParam: loc('uBodyParam'),
    bodyCount: loc('uBodyCount'),
  };

  // Preallocated staging (zero per-frame allocation).
  const glowColorArr = new Float32Array(MAX_GLOWS * 4);
  const glowGeoArr = new Float32Array(MAX_GLOWS * 4);
  const glowStopArr = new Float32Array(MAX_GLOWS);
  const bodyRectArr = new Float32Array(BODY_CAP * 4);
  const bodyParamArr = new Float32Array(BODY_CAP * 4);

  let width = 0;
  let height = 0;
  let dprCache = 1;

  const kindToIndex = (k: LiquidBody['kind']): number =>
    k === 'capsule' ? 0 : k === 'droplet' ? 1 : k === 'bud' ? 2 : 3;

  return {
    tier: 'webgl2',
    resize(w: number, h: number, dpr: number) {
      width = w;
      height = h;
      dprCache = dpr;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    render(scene: SceneState, bodies: readonly LiquidBody[], count: number) {
      gl.useProgram(program);
      gl.bindVertexArray(vao);

      gl.uniform2f(u.resolution, width, height);
      gl.uniform1f(u.dpr, dprCache);
      gl.uniform1f(u.time, scene.time);
      gl.uniform2f(u.parallax, scene.mx, scene.my);
      gl.uniform2f(u.light, scene.lightX, scene.lightY);
      gl.uniform3fv(u.baseTop, scene.baseTop);
      gl.uniform3fv(u.baseMid, scene.baseMid);
      gl.uniform3fv(u.baseBot, scene.baseBot);
      gl.uniform3fv(u.accent, scene.accent);
      gl.uniform3fv(u.rim, scene.rim);

      const gcount = Math.min(scene.glows.length, MAX_GLOWS);
      for (let i = 0; i < gcount; i++) {
        const g = scene.glows[i];
        glowColorArr[i * 4] = g.r;
        glowColorArr[i * 4 + 1] = g.g;
        glowColorArr[i * 4 + 2] = g.b;
        glowColorArr[i * 4 + 3] = g.a;
        glowGeoArr[i * 4] = g.cx;
        glowGeoArr[i * 4 + 1] = g.cy;
        glowGeoArr[i * 4 + 2] = g.sx;
        glowGeoArr[i * 4 + 3] = g.sy;
        glowStopArr[i] = g.stop;
      }
      gl.uniform4fv(u.glowColor, glowColorArr);
      gl.uniform4fv(u.glowGeo, glowGeoArr);
      gl.uniform1fv(u.glowStop, glowStopArr);
      gl.uniform1i(u.glowCount, gcount);

      const bcount = Math.min(count, BODY_CAP);
      for (let i = 0; i < bcount; i++) {
        const b = bodies[i];
        bodyRectArr[i * 4] = b.cx * dprCache;
        bodyRectArr[i * 4 + 1] = b.cy * dprCache;
        bodyRectArr[i * 4 + 2] = b.hw * dprCache;
        bodyRectArr[i * 4 + 3] = b.hh * dprCache;
        bodyParamArr[i * 4] = b.radius * dprCache;
        bodyParamArr[i * 4 + 1] = b.press;
        bodyParamArr[i * 4 + 2] = b.group;
        bodyParamArr[i * 4 + 3] = kindToIndex(b.kind);
      }
      gl.uniform4fv(u.bodyRect, bodyRectArr);
      gl.uniform4fv(u.bodyParam, bodyParamArr);
      gl.uniform1i(u.bodyCount, bcount);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (vao) gl.deleteVertexArray(vao);
    },
  };
}
