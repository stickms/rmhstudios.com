/**
 * WebGPU backend (§16.1.4) — the WGSL rendering of the exact same visuals as the
 * WebGL2 backend (renderer-webgl2.ts): procedural aurora scene, SDF bodies with
 * smooth-min merging, edge-band lens refraction, chromatic dispersion, and
 * fresnel specular from the scene light. Uniform organisation follows the
 * jeantimex/glass-effect-webgpu reference (one shared uniform buffer, vec4-packed
 * so JS staging and WGSL layout agree with no alignment surprises).
 *
 * This container's headless Chromium exposes no WebGPU adapter, so this path is
 * verified by code review + the shared shader math; the live screenshot proves
 * the WebGL2 port (same visuals).
 *
 * Zero per-frame allocation: the staging Float32Array + uniform buffer are
 * created once; `render` fills + `queue.writeBuffer`s them.
 */

import type { LiquidBody, LiquidRenderer, SceneState } from './types';
import { BODY_CAP } from './registry';
import { MAX_GLOWS } from './scene';

// vec4-packed layout: header(8) + glowColor(5) + glowGeo(5) + glowStop(5)
//                     + bodyRect(24) + bodyParam(24) = 71 vec4 = 284 floats.
const HEADER_VEC4 = 8;
const UNIFORM_VEC4 = HEADER_VEC4 + MAX_GLOWS * 3 + BODY_CAP * 2;
const UNIFORM_FLOATS = UNIFORM_VEC4 * 4;
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

const WGSL = /* wgsl */ `
const MAX_GLOWS = ${MAX_GLOWS};
const BODY_CAP = ${BODY_CAP};

struct U {
  res_dpr_time : vec4f,          // resolution.xy, dpr, time
  parallax_light : vec4f,        // parallax.xy, light.xy
  baseTop : vec4f,
  baseMid : vec4f,
  baseBot : vec4f,
  accent : vec4f,
  rim : vec4f,
  counts : vec4f,                // glowCount, bodyCount, 0, 0
  glowColor : array<vec4f, MAX_GLOWS>,
  glowGeo : array<vec4f, MAX_GLOWS>,
  glowStop : array<vec4f, MAX_GLOWS>,   // .x = stop
  bodyRect : array<vec4f, BODY_CAP>,    // cx, cy, hw, hh (device px)
  bodyParam : array<vec4f, BODY_CAP>,   // radius, press, group, kind
};

@group(0) @binding(0) var<uniform> u : U;

fn resolution() -> vec2f { return u.res_dpr_time.xy; }
fn dpr() -> f32 { return u.res_dpr_time.z; }
fn timev() -> f32 { return u.res_dpr_time.w; }
fn parallax() -> vec2f { return u.parallax_light.xy; }
fn light() -> vec2f { return u.parallax_light.zw; }
fn glowCount() -> i32 { return i32(u.counts.x); }
fn bodyCount() -> i32 { return i32(u.counts.y); }

fn sceneUV(uv : vec2f) -> vec2f {
  let par = parallax() * dpr() / resolution();
  let drift = vec2f(sin(timev() * 0.05) * 0.010, cos(timev() * 0.04) * 0.008);
  return uv - par * 0.5 + drift;
}

fn auroraAt(uv : vec2f) -> vec3f {
  let y = clamp(uv.y, 0.0, 1.0);
  var base : vec3f;
  if (y < 0.5) { base = mix(u.baseTop.rgb, u.baseMid.rgb, y * 2.0); }
  else { base = mix(u.baseMid.rgb, u.baseBot.rgb, (y - 0.5) * 2.0); }
  var col = base;
  for (var i = 0; i < MAX_GLOWS; i = i + 1) {
    if (i >= glowCount()) { break; }
    let gc = u.glowColor[i];
    let gg = u.glowGeo[i];
    let d = (uv - gg.xy) / vec2f(max(gg.z, 0.02), max(gg.w, 0.02));
    let dist = length(d);
    let a = gc.a * (1.0 - smoothstep(0.0, u.glowStop[i].x, dist));
    col = mix(col, gc.rgb, clamp(a, 0.0, 1.0));
  }
  return col;
}

fn roundedRectSDF(p : vec2f, b0 : vec2f, r0 : f32) -> f32 {
  let r = min(r0, min(b0.x, b0.y));
  let q = abs(p) - b0 + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn bodySDF(i : i32, p : vec2f) -> f32 {
  let rect = u.bodyRect[i];
  return roundedRectSDF(p - rect.xy, rect.zw, u.bodyParam[i].x);
}

fn smin(a : f32, b : f32, k : f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn mergedSDF(p : vec2f) -> f32 {
  var best = 1e9;
  var bestGroup = 0.0;
  for (var i = 0; i < BODY_CAP; i = i + 1) {
    if (i >= bodyCount()) { break; }
    let di = bodySDF(i, p);
    if (di < best) { best = di; bestGroup = u.bodyParam[i].z; }
  }
  var d = 1e9;
  let k = 26.0 * dpr();
  for (var i = 0; i < BODY_CAP; i = i + 1) {
    if (i >= bodyCount()) { break; }
    let di = bodySDF(i, p);
    let g = u.bodyParam[i].z;
    if (g != 0.0 && g == bestGroup) { d = smin(d, di, k); }
    else { d = min(d, di); }
  }
  return d;
}

fn mergedNormal(p : vec2f) -> vec2f {
  let e = 1.0 * dpr();
  let dx = mergedSDF(p + vec2f(e, 0.0)) - mergedSDF(p - vec2f(e, 0.0));
  let dy = mergedSDF(p + vec2f(0.0, e)) - mergedSDF(p - vec2f(0.0, e));
  let n = vec2f(dx, dy);
  let len = length(n);
  if (len < 0.0001) { return vec2f(0.0, -1.0); }
  return n / len;
}

struct Near { kind : f32, press : f32 };
fn nearestBody(p : vec2f) -> Near {
  var best = 1e9;
  var out : Near = Near(3.0, 0.0);
  for (var i = 0; i < BODY_CAP; i = i + 1) {
    if (i >= bodyCount()) { break; }
    let di = abs(bodySDF(i, p));
    if (di < best) { best = di; out.kind = u.bodyParam[i].w; out.press = u.bodyParam[i].y; }
  }
  return out;
}

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pos[vi], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fragCoord : vec4f) -> @location(0) vec4f {
  let res = resolution();
  // WebGPU frag origin is already top-left — no Y flip needed.
  let p = fragCoord.xy;
  let uv = p / res;
  let scene = auroraAt(sceneUV(uv));

  if (bodyCount() == 0) { return vec4f(scene, 1.0); }

  let aa = 1.5 * dpr();
  let d = mergedSDF(p);
  if (d > aa + 1.0) { return vec4f(scene, 1.0); }

  let n = mergedNormal(p);
  let near = nearestBody(p);
  let press = near.press;
  let kind = near.kind;

  let bezel = (16.0 + 10.0 * press) * dpr();
  let inward = clamp(-d, 0.0, bezel);
  let t = inward / bezel;
  let rimW = 1.0 - t;

  let maxDisp = bezel * (0.95 + 0.6 * press);
  let disp = maxDisp * pow(rimW, 1.3);

  let lightPx = light() * res;
  let toLight = lightPx - p;
  let ldist = length(toLight);
  var lightDir = vec2f(0.0, -1.0);
  if (ldist > 0.001) { lightDir = toLight / ldist; }
  let bulge = 6.0 * dpr() * (1.0 - t) * exp(-ldist / (420.0 * dpr()));
  let sampleP = p - n * disp - lightDir * bulge;

  let ca = disp * 0.16;
  var refr : vec3f;
  refr.r = auroraAt(sceneUV((sampleP - n * (-ca)) / res)).r;
  refr.g = auroraAt(sceneUV(sampleP / res)).g;
  refr.b = auroraAt(sceneUV((sampleP - n * ca) / res)).b;

  var tintAmt = 0.0;
  if (kind < 0.5) { tintAmt = 0.55; }
  else if (kind < 1.5) { tintAmt = 0.55; }
  else if (kind < 2.5) { tintAmt = 0.46; }
  tintAmt = clamp(tintAmt + press * 0.12, 0.0, 0.85);
  var body = mix(refr, u.accent.rgb, tintAmt);

  let fres = pow(rimW, 2.2);
  let facing = clamp(dot(n, -lightDir), 0.0, 1.0);
  let spec = fres * mix(0.12, 1.0, facing) * (0.7 + 0.6 * press);
  body = mix(body, u.rim.rgb, clamp(spec, 0.0, 1.0) * 0.9);

  let lip = smoothstep(0.0, 2.0 * dpr(), -d) * (1.0 - smoothstep(2.0 * dpr(), 5.0 * dpr(), -d));
  body = mix(body, u.rim.rgb, lip * 0.18);

  let cov = 1.0 - smoothstep(-aa, aa, d);
  return vec4f(mix(scene, body, cov), 1.0);
}
`;

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
): Promise<LiquidRenderer | null> {
  const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
  if (!gpu) return null;

  let adapter: GPUAdapter | null = null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: 'low-power' });
  } catch {
    return null;
  }
  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const ctx = canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
  if (!ctx) {
    device.destroy();
    return null;
  }

  // §16.4b: track device loss + uncaptured GPU errors for the verified-frame gate
  // and the runtime watchdog. WebGPU has no synchronous readback in a sync frame
  // path, so the WebGPU health signal is "no uncaptured error + device not lost"
  // (the mandate's minimal bar); WebKit is routed to WebGL2 (deep readback) anyway.
  let lost = false;
  let errored = false;
  device.lost.then(() => {
    lost = true;
  });
  device.addEventListener('uncapturederror', () => {
    errored = true;
  });

  let bindGroupLayout: GPUBindGroupLayout;
  let pipeline: GPURenderPipeline;
  let uniformBuffer: GPUBuffer;
  let bindGroup: GPUBindGroup;
  try {
    const format = gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const module = device.createShaderModule({ code: WGSL });
    bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    });
    const pipelineDescriptor = {
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    };
    // Async creation lets the driver compile/cache this stable pipeline without
    // synchronously stalling the main thread. Older implementations retain the
    // synchronous fallback.
    pipeline = device.createRenderPipelineAsync
      ? await device.createRenderPipelineAsync(pipelineDescriptor)
      : device.createRenderPipeline(pipelineDescriptor);
    uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
  } catch {
    device.destroy();
    return null;
  }

  const staging = new Float32Array(UNIFORM_FLOATS);
  let width = 0;
  let height = 0;
  let dprCache = 1;

  const kindToIndex = (k: LiquidBody['kind']): number =>
    k === 'capsule' ? 0 : k === 'droplet' ? 1 : k === 'bud' ? 2 : 3;

  // vec4 slot offsets into `staging`.
  const OFF_HEADER = 0;
  const OFF_GLOW_COLOR = HEADER_VEC4 * 4;
  const OFF_GLOW_GEO = OFF_GLOW_COLOR + MAX_GLOWS * 4;
  const OFF_GLOW_STOP = OFF_GLOW_GEO + MAX_GLOWS * 4;
  const OFF_BODY_RECT = OFF_GLOW_STOP + MAX_GLOWS * 4;
  const OFF_BODY_PARAM = OFF_BODY_RECT + BODY_CAP * 4;

  return {
    tier: 'webgpu',
    isLost() {
      return lost;
    },
    checkFrame() {
      // No cheap synchronous readback on WebGPU — health is "no uncaptured error
      // and device not lost" (§16.4b minimal bar). `errored` latches until read.
      const ok = !errored && !lost;
      errored = false;
      return { ok, nonBlank: true };
    },
    resize(w: number, h: number, dpr: number) {
      width = w;
      height = h;
      dprCache = dpr;
      canvas.width = w;
      canvas.height = h;
    },
    render(scene: SceneState, bodies: readonly LiquidBody[], count: number) {
      const s = staging;
      // header
      s[OFF_HEADER + 0] = width;
      s[OFF_HEADER + 1] = height;
      s[OFF_HEADER + 2] = dprCache;
      s[OFF_HEADER + 3] = scene.time;
      s[OFF_HEADER + 4] = scene.mx;
      s[OFF_HEADER + 5] = scene.my;
      s[OFF_HEADER + 6] = scene.lightX;
      s[OFF_HEADER + 7] = scene.lightY;
      s[OFF_HEADER + 8] = scene.baseTop[0];
      s[OFF_HEADER + 9] = scene.baseTop[1];
      s[OFF_HEADER + 10] = scene.baseTop[2];
      s[OFF_HEADER + 12] = scene.baseMid[0];
      s[OFF_HEADER + 13] = scene.baseMid[1];
      s[OFF_HEADER + 14] = scene.baseMid[2];
      s[OFF_HEADER + 16] = scene.baseBot[0];
      s[OFF_HEADER + 17] = scene.baseBot[1];
      s[OFF_HEADER + 18] = scene.baseBot[2];
      s[OFF_HEADER + 20] = scene.accent[0];
      s[OFF_HEADER + 21] = scene.accent[1];
      s[OFF_HEADER + 22] = scene.accent[2];
      s[OFF_HEADER + 24] = scene.rim[0];
      s[OFF_HEADER + 25] = scene.rim[1];
      s[OFF_HEADER + 26] = scene.rim[2];
      const gcount = Math.min(scene.glows.length, MAX_GLOWS);
      s[OFF_HEADER + 28] = gcount;
      s[OFF_HEADER + 29] = Math.min(count, BODY_CAP);

      for (let i = 0; i < MAX_GLOWS; i++) {
        const base = OFF_GLOW_COLOR + i * 4;
        const gbase = OFF_GLOW_GEO + i * 4;
        const sbase = OFF_GLOW_STOP + i * 4;
        if (i < gcount) {
          const g = scene.glows[i];
          s[base] = g.r;
          s[base + 1] = g.g;
          s[base + 2] = g.b;
          s[base + 3] = g.a;
          s[gbase] = g.cx;
          s[gbase + 1] = g.cy;
          s[gbase + 2] = g.sx;
          s[gbase + 3] = g.sy;
          s[sbase] = g.stop;
        } else {
          s[base] = 0;
          s[base + 1] = 0;
          s[base + 2] = 0;
          s[base + 3] = 0;
        }
      }

      const bcount = Math.min(count, BODY_CAP);
      for (let i = 0; i < bcount; i++) {
        const b = bodies[i];
        const rbase = OFF_BODY_RECT + i * 4;
        const pbase = OFF_BODY_PARAM + i * 4;
        s[rbase] = b.cx * dprCache;
        s[rbase + 1] = b.cy * dprCache;
        s[rbase + 2] = b.hw * dprCache;
        s[rbase + 3] = b.hh * dprCache;
        s[pbase] = b.radius * dprCache;
        s[pbase + 1] = b.press;
        s[pbase + 2] = b.group;
        s[pbase + 3] = kindToIndex(b.kind);
      }

      device.queue.writeBuffer(uniformBuffer, 0, staging.buffer, 0, UNIFORM_BYTES);

      const encoder = device.createCommandEncoder();
      const view = ctx.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    dispose() {
      uniformBuffer.destroy();
      device.destroy();
    },
  };
}
