/**
 * The WebGL2 renderer (spec §3.1, §8.4–8.5, §10.1). OWNER: T24 (T23 wires the
 * real shaders' uniforms). Client-only, no React.
 *
 * ## What it is, and what it deliberately is not
 *
 * A thin object around one `WebGL2RenderingContext` that works identically on an
 * `OffscreenCanvas` (inside the worker) and on a DOM canvas (the in-thread
 * fallback). It owns programs, the tier's mesh buffers, the two page textures
 * plus the placeholder, and the LUT — and nothing else. It has **no loop and no
 * clock**: the host calls {@link RendererApi.draw} once per frame with the
 * timeline's snapshot. That separation is what lets the same renderer run under
 * a worker's frame loop or the main thread's, and what lets the harness scrub
 * to any point by calling `draw` with a hand-built snapshot.
 *
 * ## Per-frame rules (spec §8.4)
 *
 * `draw` allocates nothing, writes the `frame`-cadence uniforms of `UNIFORMS`
 * and makes at most two draw calls — the surface, then the cage over the same
 * triangles. Depth testing is on, with no sorting and no transparency until POP.
 * Culling is off, so `gl_FrontFacing` selects the page side.
 *
 * ### Which winding is "front" (a correction to the T01 wording)
 *
 * The mesh contract says triangles are counter-clockwise "seen from outside the
 * round sphere" and states the test as `((b−a)×(c−a))·centroid > 0` in BODY
 * space. Body space is screen-handed — x right, **y DOWN**, z toward the viewer
 * (`domain.ts`) — which is a mirror of GL's y-up clip space. The vertex shader
 * must flip y on the way to clip space, and that flip turns the outside-CCW
 * triangles of the contract into CLOCKWISE triangles in window space. So the
 * renderer sets `frontFace(CW)`: the one setting under which `gl_FrontFacing`
 * is true on the original outer side, as spec §4.5 requires. Writing `CCW` here
 * would silently swap `before` and `after`.
 *
 * ## Context and output
 *
 * Created with `alpha: true, premultipliedAlpha: true, antialias: true,
 * depth: true`. Cleared to the resolved veil colour with alpha
 * `snapshot.bgAlpha` — opaque from the first frame, transparent from `reveal`
 * on (spec §10.1). Shaders therefore output PREMULTIPLIED colour. Context loss
 * is surfaced through {@link RendererOptions.onContextLost}; after it every
 * method is a no-op (the host abandons the run, spec §9.4).
 *
 * ## GPU formats
 *
 * - **Page textures:** `RGBA8`, mipmapped (`LINEAR_MIPMAP_LINEAR`), clamped,
 *   anisotropy per tier (`TIERS[tier].anisotropy`, capped by the device). The
 *   globe minifies the page hard at the limb, so mips and anisotropy are what
 *   keep text legible there. Bitmaps are uploaded without Y-flip (row 0 is the
 *   top, matching the `v`-down page UV) and without alpha premultiplication
 *   (a captured page is opaque).
 * - **LUT: `RG32F`, `NEAREST`, `CLAMP` both ways, filtered by hand in the
 *   shader (clamped, not wrapped in longitude — see `LUT_SAMPLE_GLSL`).** The task asked to choose between RG16F and RG32F. A half float
 *   carries one part in 2048 — about 2 px at 4096 px — and the LUT is the page
 *   coordinate itself, so that error is a visible wobble on text at the
 *   projection's high-gradient regions. `RG32F` is exact, costs 4 MB instead of
 *   2 MB for the duration of one navigation, and is core WebGL2 for `NEAREST`
 *   sampling (only `LINEAR` needs `OES_texture_float_linear`, which not every
 *   mobile GPU has — hence the four-`texelFetch` bilinear in
 *   `stub-shaders.ts#LUT_SAMPLE_GLSL`, which T23 reuses). The CPU encoding
 *   (T07) therefore needs NO half-float conversion: the renderer wants exactly
 *   `bakeLut`'s `Float32Array`, `LUT_SIZE[0] × h × 2` floats, row 0 = south pole,
 *   column 0 = `θ = −π`. This amends `uniforms.ts` (which said RG16F) and the
 *   comment on `RendererPrime.lut`; spec §8.5 allows either.
 * - **Fallbacks:** a 1×1 page texture and a 1×1 LUT stay bound to unused units so
 *   no sampler is ever incomplete (an incomplete sampler reads black and warns
 *   every frame). They are permanent, so they are part of the construction
 *   baseline of {@link GlCounters.live}.
 *
 * ## Lifetime (spec §3.2, §8.5)
 *
 * `release()` at the end of each navigation frees the page textures, the
 * placeholder and the LUT (the caller closes its `ImageBitmap`s); programs, the
 * mesh buffers and the fallbacks stay so the next navigation does not recompile.
 * `dispose()` frees everything. After every `release()`, `counters().live`
 * equals its value right after `createRenderer` — that is the baseline the
 * 20-navigation soak checks.
 *
 * ## Shaders
 *
 * It compiles the stub `ShaderSet` (`stub-shaders.ts`, T24) until T23's
 * `getShaderSet()` is available, then the real one; nothing outside this file
 * chooses. Programs are compiled eagerly in `createRenderer` (surface and cage;
 * the transform-feedback program is compiled inside each `debugEvaluate` and
 * deleted again, because the product never needs it).
 */

import { CAGE_ALPHA_END, CAGE_ALPHA_START, LUT_SIZE, STAGE_PARAM_COUNT, TIERS } from '../constants';
import { registerDebug } from '../debug';
import type { RendererDebug } from '../debug';
import { meshForTier } from '../mesh';
import { stageParams } from '../thurston';
import type {
  GlCounters,
  Mesh,
  RendererApi,
  RendererOptions,
  RendererPrime,
  Rgba,
  TextureSlot,
  ThemeColours,
  TimelineSnapshot,
  Viewport,
} from '../types';
import { getShaderSet } from './shaders';
import type { ProgramSource, ShaderSet } from './shaders';
import { getStubShaderSet } from './stub-shaders';
import { ATTRIBUTE_DOMAIN, SAMPLER_UNITS, UNIFORMS } from './uniforms';
import type { UniformName } from './uniforms';

/** `EXT_texture_filter_anisotropic`'s enums, which the DOM typings do not carry. */
const TEXTURE_MAX_ANISOTROPY_EXT = 0x84fe;
const MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84ff;

type Loc = WebGLUniformLocation | null;
type Locs = Record<UniformName, Loc>;

/** A linked program and where its uniforms are. A missing uniform is `null` and its writes are ignored. */
interface Program {
  readonly program: WebGLProgram;
  readonly loc: Locs;
}

type ObjectKind = 'buffers' | 'textures' | 'programs' | 'vertexArrays';

const WHITE: Rgba = [1, 1, 1, 1];

/**
 * Create a renderer on `canvas`. Works on an `OffscreenCanvas` or a DOM canvas.
 * Compiles the programs and builds the tier's mesh buffers; does not draw.
 * Registers the `renderer` debug slot.
 *
 * @throws if WebGL2 is unavailable or program compilation fails — the host
 *   turns that into a `fatal` `error` message and the controller falls back.
 */
export function createRenderer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  options: RendererOptions,
): RendererApi {
  const gl = (canvas as HTMLCanvasElement).getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('eversion: WebGL2 is not available on this canvas');

  const { tier } = options;
  const tierConfig = TIERS[tier];
  const count = options.countObjects !== false;

  /* ── Counters ─────────────────────────────────────────────────────────── */

  const made = { buffers: 0, textures: 0, programs: 0, vertexArrays: 0 };
  const freed = { buffers: 0, textures: 0, programs: 0, vertexArrays: 0 };
  const created = (kind: ObjectKind) => {
    if (count) made[kind]++;
  };
  const deleted = (kind: ObjectKind) => {
    if (count) freed[kind]++;
  };

  function newTexture(): WebGLTexture {
    const t = gl!.createTexture();
    if (!t) throw new Error('eversion: createTexture failed');
    created('textures');
    return t;
  }
  function dropTexture(t: WebGLTexture | null): null {
    if (t) {
      gl!.deleteTexture(t);
      deleted('textures');
    }
    return null;
  }

  /* ── State ────────────────────────────────────────────────────────────── */

  let lost = false;
  let disposed = false;

  const onLost = (event: Event) => {
    // Without preventDefault the browser never fires `webglcontextrestored`;
    // we do not restore — the host abandons the run and the controller falls back.
    event.preventDefault();
    if (lost) return;
    lost = true;
    options.onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost as EventListener, false);

  /** Drawing-buffer size in device px, and the CSS viewport it covers. */
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let dprScale = 1;
  let bufW = 0;
  let bufH = 0;
  let pixelRatio = 1;

  let colours: ThemeColours | null = null;
  const mAfter = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const stageScratch = new Float32Array(STAGE_PARAM_COUNT);
  const stageScratch64 = new Float64Array(STAGE_PARAM_COUNT);
  let forcedEvert: number | null = null;

  /* ── Programs ─────────────────────────────────────────────────────────── */

  const shaders = resolveShaderSet();
  const surface = buildProgram(gl, shaders.surface, 'surface', created);
  const cage = buildProgram(gl, shaders.cage, 'cage', created);

  /** Once per program: the sampler units never change (spec §8.4: written once). */
  for (const p of [surface, cage]) {
    gl.useProgram(p.program);
    gl.uniform1i(p.loc.u_lut, SAMPLER_UNITS.lut);
    gl.uniform1i(p.loc.u_before, SAMPLER_UNITS.before);
    gl.uniform1i(p.loc.u_after, SAMPLER_UNITS.after);
    gl.uniform1i(p.loc.u_placeholder, SAMPLER_UNITS.placeholder);
  }

  /* ── Mesh ─────────────────────────────────────────────────────────────── */

  const mesh: Mesh = meshForTier(tier);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ebo = gl.createBuffer();
  if (!vao || !vbo || !ebo) throw new Error('eversion: could not create the mesh buffers');
  created('vertexArrays');
  created('buffers');
  created('buffers');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.domain, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTRIBUTE_DOMAIN.location);
  gl.vertexAttribPointer(ATTRIBUTE_DOMAIN.location, ATTRIBUTE_DOMAIN.size, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  /* ── Textures ─────────────────────────────────────────────────────────── */

  const anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
  const anisotropy = anisoExt
    ? Math.min(tierConfig.anisotropy, gl.getParameter(MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
    : 0;

  const slotUnit: Record<TextureSlot, number> = SAMPLER_UNITS;
  const pages: Record<TextureSlot, WebGLTexture | null> = {
    before: null,
    after: null,
    placeholder: null,
  };
  let lutTexture: WebGLTexture | null = null;

  const fallbackPage = newTexture();
  gl.bindTexture(gl.TEXTURE_2D, fallbackPage);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  setSamplerState(false);

  const fallbackLut = newTexture();
  gl.bindTexture(gl.TEXTURE_2D, fallbackLut);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RG32F,
    1,
    1,
    0,
    gl.RG,
    gl.FLOAT,
    new Float32Array([0.5, 0.5]),
  );
  setLutSamplerState();

  bindUnit(SAMPLER_UNITS.lut, fallbackLut);
  bindUnit(SAMPLER_UNITS.before, fallbackPage);
  bindUnit(SAMPLER_UNITS.after, fallbackPage);
  bindUnit(SAMPLER_UNITS.placeholder, fallbackPage);

  function bindUnit(unit: number, tex: WebGLTexture | null) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
  }

  /** Sampler state of the TEXTURE bound to the active unit (WebGL2 samplers are not used). */
  function setSamplerState(mips: boolean) {
    const g = gl!;
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, mips ? g.LINEAR_MIPMAP_LINEAR : g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    if (mips && anisotropy > 1) {
      g.texParameterf(g.TEXTURE_2D, TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
    }
  }

  function setLutSamplerState() {
    const g = gl!;
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }

  /** Upload a bitmap or 1×1 pixel into a page slot, replacing what was there. */
  function uploadPage(slot: TextureSlot, source: ImageBitmap | Uint8Array) {
    const g = gl!;
    let tex = pages[slot];
    if (!tex) {
      tex = newTexture();
      pages[slot] = tex;
    }
    g.activeTexture(g.TEXTURE0 + slotUnit[slot]);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (source instanceof Uint8Array) {
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, source);
    } else {
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, source);
    }
    setSamplerState(true);
    g.generateMipmap(g.TEXTURE_2D);
  }

  function freePage(slot: TextureSlot) {
    const tex = pages[slot];
    if (!tex) return;
    pages[slot] = dropTexture(tex);
    bindUnit(slotUnit[slot], fallbackPage);
  }

  function freeLut() {
    if (!lutTexture) return;
    lutTexture = dropTexture(lutTexture);
    bindUnit(SAMPLER_UNITS.lut, fallbackLut);
  }

  /* ── Sizing and the per-navigation uniforms ───────────────────────────── */

  function applySize() {
    const ratio = Math.max(0.25, Math.min(dpr, options.dprCap) * dprScale);
    const w = Math.max(1, Math.round(cssW * ratio));
    const h = Math.max(1, Math.round(cssH * ratio));
    // Assigning width/height reallocates the drawing buffer even when unchanged.
    if (w !== bufW || h !== bufH) {
      canvas.width = w;
      canvas.height = h;
      bufW = w;
      bufH = h;
    }
    pixelRatio = w / cssW;
    writeStatic();
  }

  /** `prime`- and `resize`-cadence uniforms, for every program that has them. */
  function writeStatic() {
    const g = gl!;
    for (const p of [surface, cage]) {
      const l = p.loc;
      g.useProgram(p.program);
      g.uniform2f(l.u_viewport, cssW, cssH);
      g.uniform1f(l.u_pixelRatio, pixelRatio);
      g.uniformMatrix3fv(l.u_mAfter, false, mAfter);
      const c = colours;
      if (c) {
        g.uniform4f(l.u_colBg, c.bg[0], c.bg[1], c.bg[2], c.bg[3]);
        g.uniform4f(l.u_colVeil, c.veil[0], c.veil[1], c.veil[2], c.veil[3]);
        g.uniform4f(l.u_colAccent, c.accent[0], c.accent[1], c.accent[2], c.accent[3]);
        g.uniform4f(
          l.u_colCageMinor,
          c.cageMinor[0],
          c.cageMinor[1],
          c.cageMinor[2],
          c.cageMinor[3],
        );
        g.uniform4f(
          l.u_colCageParallel,
          c.cageParallel[0],
          c.cageParallel[1],
          c.cageParallel[2],
          c.cageParallel[3],
        );
        g.uniform4f(
          l.u_colCageMajor,
          c.cageMajor[0],
          c.cageMajor[1],
          c.cageMajor[2],
          c.cageMajor[3],
        );
        g.uniform4f(
          l.u_colCageRipple,
          c.cageRipple[0],
          c.cageRipple[1],
          c.cageRipple[2],
          c.cageRipple[3],
        );
        g.uniform1f(l.u_cageWidth, c.cageWidth);
      }
    }
  }

  /** The `frame`-cadence uniforms — the only per-frame CPU→GPU traffic. */
  function writeFrame(p: Program, s: Readonly<TimelineSnapshot>, evert: number, cageAlpha: number) {
    const g = gl!;
    const l = p.loc;
    g.uniform1f(l.u_wrap, s.wrap);
    g.uniform1f(l.u_unwrap, s.unwrap);
    g.uniform1f(l.u_evert, evert);
    if (l.u_stageParams) writeStageParams(l.u_stageParams, evert);
    g.uniform1f(l.u_spin, s.spin);
    g.uniform1f(l.u_tilt, s.tilt);
    g.uniform1f(l.u_radius, s.radius);
    g.uniform2f(l.u_centre, s.centreX, s.centreY);
    g.uniform1f(l.u_afterMix, s.afterMix);
    g.uniform1f(l.u_pageAlpha, s.pageAlpha);
    g.uniform1f(l.u_pop, s.pop);
    g.uniform2f(l.u_ripple, s.ripple0Age, s.ripple1Age);
    g.uniform1f(l.u_cageAlpha, cageAlpha);
  }

  /** `stageParams` into a reused Float32Array: GL's uniform setters do not take Float64Array. */
  function writeStageParams(loc: WebGLUniformLocation, e: number) {
    stageParams(e, stageScratch64, 0);
    for (let i = 0; i < STAGE_PARAM_COUNT; i++) stageScratch[i] = stageScratch64[i];
    gl!.uniform1fv(loc, stageScratch);
  }

  /* ── The API ──────────────────────────────────────────────────────────── */

  function guard(): boolean {
    return !lost && !disposed;
  }

  const api: RendererApi = {
    tier,

    prime(p: RendererPrime) {
      if (!guard()) return;
      const g = gl;
      colours = p.colours;
      for (let i = 0; i < 9; i++) mAfter[i] = p.mAfter[i];

      const width = LUT_SIZE[0];
      const height = p.lut.length / (2 * width);
      if (!Number.isInteger(height) || height < 1) {
        throw new Error(
          `eversion: LUT has ${p.lut.length} floats, expected a multiple of ${2 * width} (RG32F, ${width} wide)`,
        );
      }
      if (!lutTexture) lutTexture = newTexture();
      bindUnit(SAMPLER_UNITS.lut, lutTexture);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
      g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      g.texImage2D(g.TEXTURE_2D, 0, g.RG32F, width, height, 0, g.RG, g.FLOAT, p.lut);
      setLutSamplerState();

      cssW = p.viewport.w;
      cssH = p.viewport.h;
      dpr = p.viewport.dpr;
      dprScale = 1;
      applySize();
    },

    setTexture(slot: TextureSlot, bitmap: ImageBitmap | null) {
      if (!guard()) return;
      if (bitmap) uploadPage(slot, bitmap);
      else freePage(slot);
    },

    draw(s: Readonly<TimelineSnapshot>) {
      if (!guard()) return;
      const g = gl;
      const evert = forcedEvert ?? s.evert;
      const cageAlpha = CAGE_ALPHA_START + (CAGE_ALPHA_END - CAGE_ALPHA_START) * evert;

      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, bufW || canvas.width, bufH || canvas.height);
      g.frontFace(g.CW);
      g.disable(g.CULL_FACE);
      g.enable(g.DEPTH_TEST);
      g.depthFunc(g.LESS);
      g.depthMask(true);
      g.disable(g.BLEND);

      const veil = colours ? colours.veil : WHITE;
      const a = s.bgAlpha;
      g.clearColor(veil[0] * a, veil[1] * a, veil[2] * a, a);
      g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);

      g.bindVertexArray(vao);

      g.useProgram(surface.program);
      writeFrame(surface, s, evert, cageAlpha);
      g.drawElements(g.TRIANGLES, mesh.indexCount, g.UNSIGNED_INT, 0);

      if (cageAlpha > 0) {
        g.useProgram(cage.program);
        writeFrame(cage, s, evert, cageAlpha);
        g.enable(g.BLEND);
        g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
        g.depthFunc(g.LEQUAL);
        g.depthMask(false);
        g.drawElements(g.TRIANGLES, mesh.indexCount, g.UNSIGNED_INT, 0);
        g.depthMask(true);
        g.disable(g.BLEND);
      }
      g.bindVertexArray(null);
    },

    resize(viewport: Viewport) {
      if (!guard()) return;
      cssW = viewport.w;
      cssH = viewport.h;
      dpr = viewport.dpr;
      applySize();
    },

    setDprScale(scale: number) {
      if (!guard()) return;
      dprScale = scale;
      applySize();
    },

    release() {
      if (!guard()) return;
      freePage('before');
      freePage('after');
      freePage('placeholder');
      freeLut();
      colours = null;
      forcedEvert = null;
    },

    dispose() {
      if (disposed) return;
      const g = gl;
      disposed = true;
      unregisterDebug();
      canvas.removeEventListener('webglcontextlost', onLost as EventListener, false);
      freePage('before');
      freePage('after');
      freePage('placeholder');
      freeLut();
      dropTexture(fallbackPage);
      dropTexture(fallbackLut);
      g.deleteVertexArray(vao);
      deleted('vertexArrays');
      g.deleteBuffer(vbo);
      deleted('buffers');
      g.deleteBuffer(ebo);
      deleted('buffers');
      for (const p of [surface, cage]) {
        g.deleteProgram(p.program);
        deleted('programs');
      }
    },

    debugEvaluate(es: Float32Array): Float32Array {
      if (!guard()) return new Float32Array(0);
      const g = gl;
      // Compiled per call and deleted at the end: it is a test/debug path, and a
      // program that outlived it would be one more object for the soak to explain.
      const feedback = buildFeedbackProgram(g, shaders, created);
      const vc = mesh.vertexCount;
      const out = new Float32Array(es.length * vc * 3);
      const tfBuffer = g.createBuffer();
      const tf = g.createTransformFeedback();
      if (!tfBuffer || !tf) throw new Error('eversion: could not create transform feedback');
      created('buffers');
      g.bindBuffer(g.TRANSFORM_FEEDBACK_BUFFER, tfBuffer);
      g.bufferData(g.TRANSFORM_FEEDBACK_BUFFER, vc * 3 * 4, g.DYNAMIC_READ);
      g.bindBuffer(g.TRANSFORM_FEEDBACK_BUFFER, null);
      g.bindTransformFeedback(g.TRANSFORM_FEEDBACK, tf);
      g.useProgram(feedback.program);
      g.bindVertexArray(vao);
      g.enable(g.RASTERIZER_DISCARD);
      const row = new Float32Array(vc * 3);
      for (let k = 0; k < es.length; k++) {
        g.uniform1f(feedback.loc.u_evert, es[k]);
        if (feedback.loc.u_stageParams) writeStageParams(feedback.loc.u_stageParams, es[k]);
        g.bindBufferBase(g.TRANSFORM_FEEDBACK_BUFFER, 0, tfBuffer);
        g.beginTransformFeedback(g.POINTS);
        g.drawArrays(g.POINTS, 0, vc);
        g.endTransformFeedback();
        // A buffer may not be read while it is also bound to an indexed feedback point.
        g.bindBufferBase(g.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        g.bindBuffer(g.COPY_READ_BUFFER, tfBuffer);
        g.getBufferSubData(g.COPY_READ_BUFFER, 0, row);
        g.bindBuffer(g.COPY_READ_BUFFER, null);
        out.set(row, k * vc * 3);
      }
      g.disable(g.RASTERIZER_DISCARD);
      g.bindTransformFeedback(g.TRANSFORM_FEEDBACK, null);
      g.bindVertexArray(null);
      g.deleteTransformFeedback(tf);
      g.deleteBuffer(tfBuffer);
      deleted('buffers');
      g.deleteProgram(feedback.program);
      deleted('programs');
      return out;
    },

    counters(): GlCounters {
      const live =
        made.buffers -
        freed.buffers +
        (made.textures - freed.textures) +
        (made.programs - freed.programs) +
        (made.vertexArrays - freed.vertexArrays);
      return {
        buffers: { created: made.buffers, deleted: freed.buffers },
        textures: { created: made.textures, deleted: freed.textures },
        programs: { created: made.programs, deleted: freed.programs },
        vertexArrays: { created: made.vertexArrays, deleted: freed.vertexArrays },
        live,
      };
    },
  };

  /* ── The `renderer` debug slot (T24/T25; no-op unless ?eversion-debug) ── */

  const debugSlot: RendererDebug = {
    pauseAt(e) {
      forcedEvert = e;
    },
    solidTextures(before, after) {
      if (!guard()) return;
      uploadPage('before', toBytes(before));
      uploadPage('after', toBytes(after));
      // The placeholder shows until `afterMix` rises; a harness that only set
      // two colours should see `after` without also having to drive afterMix.
      uploadPage('placeholder', toBytes(after));
    },
    counters: () => api.counters(),
    evaluate: (es) => Promise.resolve(api.debugEvaluate(es)),
    injectHardCut() {
      // The re-plan lives in the timeline (T10/T35); the renderer has nothing to skip.
    },
  };
  const unregisterDebug = registerDebug('renderer', debugSlot);

  return api;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function toBytes(c: Rgba): Uint8Array {
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) b[i] = Math.round(Math.max(0, Math.min(1, c[i])) * 255);
  return b;
}

/** The real shader set once T23 lands; until then the stub. Any OTHER error is T23's bug and propagates. */
function resolveShaderSet(): ShaderSet {
  try {
    return getShaderSet();
  } catch (error) {
    if (error instanceof Error && /getShaderSet not implemented/.test(error.message)) {
      return getStubShaderSet();
    }
    throw error;
  }
}

/** Compile one stage; on failure throw the info log with the offending source lines. */
function compile(gl: WebGL2RenderingContext, type: number, source: string, label: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`eversion: createShader failed (${label})`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
    gl.deleteShader(shader);
    throw new Error(`eversion: ${label} failed to compile\n${log}\n${excerpt(source, log)}`);
  }
  return shader;
}

/** The numbered source lines named by `ERROR: 0:LINE:` entries in `log`, with one line of context. */
function excerpt(source: string, log: string): string {
  const lines = source.split('\n');
  const wanted = new Set<number>();
  for (const m of log.matchAll(/:(\d+):/g)) wanted.add(Number(m[1]));
  const out: string[] = [];
  for (const n of [...wanted].slice(0, 5)) {
    for (let i = Math.max(1, n - 1); i <= Math.min(lines.length, n + 1); i++) {
      out.push(`${String(i).padStart(4)} | ${lines[i - 1]}${i === n ? '   <--' : ''}`);
    }
  }
  return out.join('\n');
}

function link(
  gl: WebGL2RenderingContext,
  source: ProgramSource,
  label: string,
  varyings?: readonly string[],
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, source.vertex, `${label} vertex shader`);
  let fs: WebGLShader;
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, source.fragment, `${label} fragment shader`);
  } catch (error) {
    gl.deleteShader(vs);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) throw new Error(`eversion: createProgram failed (${label})`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // The attribute location is part of the interface (`ATTRIBUTE_DOMAIN`); binding it
  // here means a shader that forgets `layout(location = 0)` still gets the right slot.
  gl.bindAttribLocation(program, ATTRIBUTE_DOMAIN.location, ATTRIBUTE_DOMAIN.name);
  if (varyings) gl.transformFeedbackVaryings(program, [...varyings], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(program);
  // Linked programs keep their code; the shader objects are no longer needed.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(no info log)';
    gl.deleteProgram(program);
    throw new Error(`eversion: ${label} failed to link\n${log}`);
  }
  return program;
}

function locate(gl: WebGL2RenderingContext, program: WebGLProgram): Locs {
  const loc = {} as Locs;
  for (const u of UNIFORMS) loc[u.name] = gl.getUniformLocation(program, u.name);
  return loc;
}

function buildProgram(
  gl: WebGL2RenderingContext,
  source: ProgramSource,
  label: string,
  created: (kind: ObjectKind) => void,
): Program {
  const program = link(gl, source, label);
  created('programs');
  return { program, loc: locate(gl, program) };
}

function buildFeedbackProgram(
  gl: WebGL2RenderingContext,
  shaders: ShaderSet,
  created: (kind: ObjectKind) => void,
): Program & { varyings: readonly string[] } {
  const { varyings } = shaders.feedback;
  const program = link(gl, shaders.feedback, 'feedback', varyings);
  created('programs');
  return { program, loc: locate(gl, program), varyings };
}
