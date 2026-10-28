/**
 * The page's one glass renderer: a single WebGL 2 context, two programs (the rim slab and the jelly haze), one scene
 * texture. Each glass surface owns a plain 2D canvas (behind its content); `draw` renders that surface into the shared
 * offscreen canvas and copies it across in the same task, so no frame is ever shown half-drawn and the browser never
 * holds more than one GL context for all of it (they are capped at ~16 per page, and the globe uses one too).
 * `drawHaze` does the same for a surface's low-res haze canvas with the haze program; the engine batches every haze
 * draw of a frame before its rim draws, so a frame switches program at most twice.
 *
 * ## Handing a frame over
 *
 * Two ways, one per thread:
 *
 * - **transfer** (the glass worker, `glass.worker.ts` — the normal path): the context lives on an `OffscreenCanvas`
 *   sized to the surface, and `transferToImageBitmap()` hands the drawing buffer itself to the target's
 *   `bitmaprenderer` context — no copy, no readback. The price is that the buffer must be exactly the surface, so a
 *   surface of a different size from the last reallocates it, and the transfer waits for the GPU to finish. Both are
 *   paid on the worker's thread, never the page's.
 * - **copy** (the page, where no worker can render WebGL): render into the bottom-left of a high-water backing store
 *   and `drawImage` that region onto the surface's 2D canvas. Surfaces of every size share ONE allocation, but the
 *   main thread waits for the GPU on every surface — onto a CPU-backed 2D canvas it is a pixel readback, and in Gecko
 *   a round trip to the GPU process (Firefox 136: 24 ms of main thread per hover frame across eight cards). The
 *   transfer was tried on the page too and reverted: there its reallocations and waits land on the main thread, and a
 *   React re-render that redraws every rim held software-GL frames for 100–400 ms
 *   (`testing/e2e/jelly-interaction.mjs`, the re-render pass).
 */
import { startProgram, whenLinked } from '@/lib/render/gl-program';
import { HAZE_FRAG } from './haze-shader';
import { FRAG, VERT } from './shader';

type RGB = [number, number, number];
type RGBA4 = [number, number, number, number];

/** The jelly terms shared by both programs (01 §2.4). */
export interface JellyLook {
  /** Per-surface 0..1. */
  seed: number;
  /** Haze colour (rgb 0..1) and the role's haze alpha. */
  haze: RGB;
  hazeA: number;
  plasmaA: RGB;
  plasmaB: RGB;
  /** Role plasma strength × theme gain. */
  plasma: number;
}

export interface GlassDraw {
  /** Surface size in CSS px, and the backing-store scale it is drawn at. */
  width: number;
  height: number;
  dpr: number;
  radius: number;
  bezel: number;
  thickness: number;
  /** Scene position (CSS px) of the surface's top-left corner, and the scene's size. */
  sceneX: number;
  sceneY: number;
  sceneW: number;
  sceneH: number;
  sceneOn: number;
  /** rgb 0..1 + alpha. */
  tint: [number, number, number, number];
  rim: [number, number, number];
  /** Theme light opacity; separate from RGB so dark glass keeps its softer lighting. */
  rimOpacity?: number;
  ink: [number, number, number];
  dark: number;
  /** Cursor light in surface px (+ height), and how strongly it is on. */
  lightX: number;
  lightY: number;
  lightZ: number;
  lightOn: number;
  /** Optical tilt on a unit disc. Only the glass normal changes; content stays in normal flow. */
  tilt?: [number, number];
  /** Jelly look; omitted = clear glass (no veil, no plasma, full dispersion). */
  jelly?: JellyLook;
  /** Dispersion relative to crown glass (0.8 for jelly). Default 1. */
  dispersion?: number;
  /** Canvas overdraw past the host on each side, CSS px (≤ 2). The target canvas covers `width + 2·margin`. */
  margin?: number;
  /** `latticeUniform()` output (16 floats) while a Tier L lattice is awake; omitted or null = no squish. */
  lattice?: Float32Array | null;
  /** #989 gel tokens; omitted = no RGB band, no Fresnel edge, no depth, no plasma colour. */
  gel?: GelLook;
  /** Dormant plasma drawn by THIS program (slabs without a haze canvas); omitted = none. */
  plasma?: PlasmaDraw | null;
  /** The press dent while `dentOf(el)` is non-null; omitted or null = none (`uDentOn` 0). */
  dent?: DentDraw | null;
}

/** The #989 gel tokens a surface carries, read on admission and theme change (`--gel-*`, `--site-accent`). */
export interface GelLook {
  /** R/G/B band displacement, px, signed: negative = toward the top-left light (`--gel-disperse-r/-g/-b`). */
  disperse: RGB;
  /** RGB band depth inside the edge, px (`--gel-bevel`), and its gain. */
  band: number;
  bandA: number;
  /** The band's channel tints + alpha (`--gel-edge-r/-g/-b`). */
  edge: [RGBA4, RGBA4, RGBA4];
  /** 1px Fresnel edge colour + alpha (`--gel-fresnel`). */
  fresnel: RGBA4;
  /** Dent light dot colour + alpha (`--gel-specular`). */
  specular: [number, number, number, number];
  /** Plasma colour (`--site-accent`). */
  accent: RGB;
  /** Plasma alpha at level 1. */
  plasmaPeak: number;
  /** Molded shoulder depth, 0 = the outlined rim (`--gel-mold`). */
  mold: number;
  /** Edge feather, px: how far the outermost pixels dissolve into the ground (`--gel-feather`). */
  feather: number;
  /** Wavelength spread × crown glass (`--gel-dispersion`), slab thickness multiplier (`--gel-lens`), environment reflection strength (`--gel-reflect`). */
  dispersion: number;
  lens: number;
  reflect: number;
}

/** The dormant plasma's per-draw state. */
export interface PlasmaDraw {
  /** Eased wake level 0..1. */
  level: number;
  /** `packRings()` output: 4 × (x, y, radius, strength), host px. */
  rings: Float32Array;
}

/** The press dent (`dentOf`), host px; `depth` normalised to 0..1. */
export interface DentDraw {
  x: number;
  y: number;
  depth: number;
  radius: number;
  stretchX: number;
  stretchY: number;
}

/** One haze draw (01 §2.6). The target canvas is `round(width·scale) × round(height·scale)`. */
export interface HazeDraw {
  width: number;
  height: number;
  scale: number;
  radius: number;
  bezel: number;
  look: JellyLook;
  /** Flow speed, eddy amount, current axis (radians). */
  flow: [number, number, number];
  quiet: number;
  /**
   * Extra haze swing in the bevel, absolute alpha (`--site-jelly-haze-edge`): where the legibility bound behind text
   * leaves a light theme ~4 sRGB levels, the currents running along the edges carry the motion. Omitted = 0.
   */
  edge?: number;
  /** Motion amplitude (1 lively, `CALM.amplitude` under calm). */
  amp: number;
  /** #989 dormant plasma; omitted = level 0, no rings. */
  plasma?: PlasmaDraw | null;
  gel?: GelLook;
  /** Plasma motion (1 lively, `PLASMA_LOOK.calmMotion` under calm, 0 still). */
  plasmaMotion?: number;
}

type GL = WebGL2RenderingContext;

const HAZE_NAMES = [
  'uSize',
  'uScale',
  'uRadius',
  'uBezel',
  'uTime',
  'uSeed',
  'uHaze',
  'uPlasmaA',
  'uPlasmaB',
  'uPlasma',
  'uFlow',
  'uQuiet',
  'uEdge',
  'uAmp',
  'uPlasmaMotion',
  'uLevel',
  'uAccent',
  'uPlasmaPeak',
  'uRings',
] as const;
type HName = (typeof HAZE_NAMES)[number];

const NO_LATTICE = new Float32Array(16);
const NO_RINGS = new Float32Array(16);
const NO_EDGE: RGBA4 = [0, 0, 0, 0];

const NAMES = [
  'uSize',
  'uPx',
  'uRadius',
  'uBezel',
  'uThickness',
  'uScene',
  'uSceneMap',
  'uSceneOn',
  'uTint',
  'uRim',
  'uInk',
  'uDark',
  'uLight',
  'uLightOn',
  'uTilt',
  'uMargin',
  'uSeed',
  'uHaze',
  'uDispersion',
  'uJelly',
  'uJellyOn',
  'uDisperse',
  'uBand',
  'uEdgeR',
  'uEdgeG',
  'uEdgeB',
  'uFresnel',
  'uPlasmaInRim',
  'uDent',
  'uDentStretch',
  'uDentOn',
  'uSpecular',
  'uLevel',
  'uAccent',
  'uPlasmaPeak',
  'uRings',
  'uMold',
  'uLens',
] as const;
type UName = (typeof NAMES)[number];

/** `transfer`: zero-copy ImageBitmap handoff into `bitmaprenderer` targets. `copy`: `drawImage` into 2D targets. */
export type GlassHandoff = 'transfer' | 'copy';

/** A surface canvas: in the page, or (the glass worker) one transferred with `transferControlToOffscreen`. */
export type GlassTarget = HTMLCanvasElement | OffscreenCanvas;
type Target = GlassTarget;
type TargetCtx =
  ImageBitmapRenderingContext | CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class GlassRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly handoff: GlassHandoff;
  private targets = new WeakMap<Target, TargetCtx>();
  private gl: GL | null = null;
  private u = {} as Record<UName, WebGLUniformLocation | null>;
  private h = {} as Record<HName, WebGLUniformLocation | null>;
  private rimProg: WebGLProgram | null = null;
  /** Null when the haze program failed to compile: rims still draw, the CSS carrier keeps the motion. */
  private hazeProg: WebGLProgram | null = null;
  private current: WebGLProgram | null = null;
  private hazeTime = NaN;
  private tex: WebGLTexture | null = null;
  private lost = false;
  private cw = 0;
  private ch = 0;
  /** Called after the context is lost or restored so the owner can fall back / redraw. */
  onChange: (() => void) | null = null;

  private constructor(canvas: HTMLCanvasElement | OffscreenCanvas, handoff: GlassHandoff) {
    this.canvas = canvas;
    this.handoff = handoff;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.builds++;
      this.building = false;
      this.gl = null;
      this.tex = null;
      this.rimProg = this.hazeProg = this.current = null;
      this.onChange?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.cw = this.ch = 0;
      // The page's renderer rebuilds in the background (and calls `onChange` when it has); a worker's, here.
      if (this.handoff === 'copy') {
        this.init(true);
      } else {
        this.init();
        this.onChange?.();
      }
    });
  }

  /**
   * The page's renderer: the copy handoff, onto a high-water backing store (see "Handing a frame over"). Its programs
   * build in the background (`lib/render/gl-program.ts`), so creating it never stalls the page on the driver: it is
   * {@link pending} (not `ready`) until they link, and then `onChange` fires — or {@link failed} turns true.
   */
  static create(doc: Document = document): GlassRenderer | null {
    const r = new GlassRenderer(doc.createElement('canvas'), 'copy');
    return r.init(true) ? r : null;
  }

  /**
   * A renderer for a worker (no document): always the transfer handoff, into targets the page handed over with
   * `transferControlToOffscreen()`. Null where the worker cannot run WebGL 2 on an `OffscreenCanvas`.
   */
  static createOffscreen(): GlassRenderer | null {
    if (typeof OffscreenCanvas === 'undefined') return null;
    try {
      const r = new GlassRenderer(new OffscreenCanvas(1, 1), 'transfer');
      return r.init() ? r : null;
    } catch {
      return null;
    }
  }

  get ready(): boolean {
    return !this.lost && this.gl !== null;
  }

  /** The programs are still building (the page renderer, between `create` and its first `onChange`). */
  get pending(): boolean {
    return this.building;
  }

  /** The rim program will not build on this driver. */
  failed = false;
  private building = false;
  private builds = 0;

  /**
   * Start a context and queue both programs. The rim and haze programs share one vertex shader and are queued
   * together, so a driver that compiles in parallel does both at once. `background`: finish when they have linked,
   * without blocking (the page); otherwise wait for them here (a worker, where nobody sees the wait).
   */
  private init(background = false): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    }) as GL | null;
    if (!gl) return false;
    const attribs = { aPos: 0 };
    const rimBuild = startProgram(gl, { vert: VERT, frag: FRAG, attribs });
    if (!rimBuild?.vertShader) return false;
    const vs = rimBuild.vertShader;
    const hazeBuild = startProgram(gl, { vert: VERT, frag: HAZE_FRAG, attribs, vertShader: vs });
    const done = (prog: WebGLProgram | null, haze: WebGLProgram | null): boolean => {
      gl.deleteShader(vs);
      if (!prog) {
        if (haze) gl.deleteProgram(haze);
        this.failed = true;
        return false;
      }
      this.finish(gl, prog, haze);
      return true;
    };
    if (!background) {
      const prog = rimBuild.linked() ? rimBuild.program : null;
      const haze = hazeBuild?.linked() ? hazeBuild.program : null;
      if (!prog) gl.deleteProgram(rimBuild.program);
      if (hazeBuild && !haze) gl.deleteProgram(hazeBuild.program);
      return done(prog, haze);
    }
    const generation = ++this.builds;
    this.building = true;
    void Promise.all([
      whenLinked(gl, rimBuild),
      hazeBuild ? whenLinked(gl, hazeBuild) : Promise.resolve(null),
    ]).then(([prog, haze]) => {
      // A context lost (and perhaps restored, with a build of its own) while this one was pending: not ours.
      if (generation !== this.builds) return;
      this.building = false;
      if (this.lost) return;
      done(prog, haze);
      this.onChange?.();
    });
    return true;
  }

  /** The rest of the set-up, once the rim program (and perhaps the haze program) has linked. */
  private finish(gl: GL, prog: WebGLProgram, haze: WebGLProgram | null): void {
    if (haze) for (const n of HAZE_NAMES) this.h[n] = gl.getUniformLocation(haze, n);
    this.hazeProg = haze;
    this.hazeTime = NaN;
    gl.useProgram(prog);
    this.rimProg = prog;
    this.current = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    for (const n of NAMES) this.u[n] = gl.getUniformLocation(prog, n);
    // A 1×1 transparent scene so the sampler is always complete.
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uScene, 0);
    this.tex = tex;
    this.gl = gl;
  }

  /**
   * Upload a page snapshot. The bitmap is NOT closed here; the caller owns it. The shader reads it as premultiplied
   * (transparent texels must stay transparent, not turn into an opaque black rim), so a canvas source is premultiplied
   * on upload. An ImageBitmap ignores the flag; whichever way the browser hands it over, a fully transparent texel
   * is rgb 0 with alpha 0, and the shader clamps colour to alpha, so a straight-alpha upload cannot paint black either.
   */
  setScene(source: ImageBitmap | HTMLCanvasElement): boolean {
    const gl = this.gl;
    if (!gl || !this.tex || this.lost) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return false;
    }
    return gl.getError() === gl.NO_ERROR;
  }

  /** True when the haze program compiled; without it the engine leaves haze to the CSS carriers. */
  get hazeReady(): boolean {
    return this.ready && this.hazeProg !== null;
  }

  private use(prog: WebGLProgram): void {
    if (this.current === prog) return;
    this.gl!.useProgram(prog);
    this.current = prog;
  }

  /** Size the shared drawing buffer (and, on the copy path, the target). */
  private prepare(pw: number, ph: number, target: Target): void {
    if (this.handoff === 'transfer') {
      // The transferred bitmap IS the drawing buffer, so it must be exactly the surface. Each transfer detaches the
      // buffer anyway and the next draw gets a fresh one, so there is no high-water store to keep.
      if (this.cw !== pw || this.ch !== ph) {
        this.canvas.width = this.cw = pw;
        this.canvas.height = this.ch = ph;
      }
      return;
    }
    // Retain a high-water backing store. Resizing this shared canvas to EVERY
    // surface reallocated the GPU buffer repeatedly within a single frame.
    if (pw > this.cw || ph > this.ch) {
      this.canvas.width = this.cw = Math.max(pw, this.cw);
      this.canvas.height = this.ch = Math.max(ph, this.ch);
    }
    if (target.width !== pw || target.height !== ph) {
      target.width = pw;
      target.height = ph;
    }
  }

  /** The target's context for this renderer's handoff; null if the canvas already holds another kind. */
  private targetCtx(target: Target): TargetCtx | null {
    let ctx = this.targets.get(target);
    if (ctx) return ctx;
    ctx =
      (this.handoff === 'transfer'
        ? target.getContext('bitmaprenderer')
        : target.getContext('2d')) ?? undefined;
    if (!ctx) return null;
    this.targets.set(target, ctx);
    return ctx;
  }

  /** Draw the bound program's full-screen triangle and hand the bottom-left `pw × ph` to `target`. */
  private blit(pw: number, ph: number, target: Target): boolean {
    const gl = this.gl!;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const tctx = this.targetCtx(target);
    if (!tctx) return false;
    if (this.handoff === 'transfer') {
      try {
        (tctx as ImageBitmapRenderingContext).transferFromImageBitmap(
          (this.canvas as OffscreenCanvas).transferToImageBitmap(),
        );
      } catch {
        return false;
      }
      return true;
    }
    const ctx = tctx as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, pw, ph);
    // The GL viewport starts at the bottom-left; Canvas2D's source rect starts
    // at the top-left. Copy just the current surface from the retained buffer.
    ctx.drawImage(this.canvas, 0, this.ch - ph, pw, ph, 0, 0, pw, ph);
    return true;
  }

  /**
   * Render one surface's haze into `target` (its `.jelly-haze-canvas`). `time` is the ambient clock in seconds: the
   * same value for every surface in a frame, so it is uploaded once per frame, not per surface.
   */
  drawHaze(o: HazeDraw, time: number, target: Target): boolean {
    const gl = this.gl;
    const prog = this.hazeProg;
    if (!gl || this.lost || !prog) return false;
    const pw = Math.max(1, Math.round(o.width * o.scale));
    const ph = Math.max(1, Math.round(o.height * o.scale));
    this.prepare(pw, ph, target);
    this.use(prog);
    const h = this.h;
    if (time !== this.hazeTime) {
      gl.uniform1f(h.uTime, time);
      this.hazeTime = time;
    }
    gl.viewport(0, 0, pw, ph);
    gl.uniform2f(h.uSize, o.width, o.height);
    gl.uniform2f(h.uScale, pw / o.width, ph / o.height);
    gl.uniform1f(h.uRadius, o.radius);
    gl.uniform1f(h.uBezel, o.bezel);
    gl.uniform1f(h.uSeed, o.look.seed);
    gl.uniform4f(h.uHaze, o.look.haze[0], o.look.haze[1], o.look.haze[2], o.look.hazeA);
    gl.uniform3f(h.uPlasmaA, o.look.plasmaA[0], o.look.plasmaA[1], o.look.plasmaA[2]);
    gl.uniform3f(h.uPlasmaB, o.look.plasmaB[0], o.look.plasmaB[1], o.look.plasmaB[2]);
    gl.uniform1f(h.uPlasma, o.look.plasma);
    gl.uniform3f(h.uFlow, o.flow[0], o.flow[1], o.flow[2]);
    gl.uniform1f(h.uQuiet, o.quiet);
    gl.uniform1f(h.uEdge, o.edge ?? 0);
    gl.uniform1f(h.uAmp, o.amp);
    gl.uniform1f(h.uPlasmaMotion, o.plasmaMotion ?? 1);
    gl.uniform1f(h.uLevel, o.plasma?.level ?? 0);
    gl.uniform4fv(h.uRings, o.plasma?.rings ?? NO_RINGS);
    const acc = o.gel?.accent;
    gl.uniform3f(h.uAccent, acc?.[0] ?? 0, acc?.[1] ?? 0, acc?.[2] ?? 0);
    gl.uniform1f(h.uPlasmaPeak, o.gel?.plasmaPeak ?? 0);
    return this.blit(pw, ph, target);
  }

  /** Render one surface and copy it into `target`. Returns false if nothing could be drawn. */
  draw(o: GlassDraw, target: Target): boolean {
    const gl = this.gl;
    if (!gl || this.lost || !this.rimProg) return false;
    const margin = Math.max(0, o.margin ?? 0);
    const cssW = o.width + 2 * margin;
    const cssH = o.height + 2 * margin;
    const pw = Math.max(1, Math.round(cssW * o.dpr));
    const ph = Math.max(1, Math.round(cssH * o.dpr));
    this.prepare(pw, ph, target);
    this.use(this.rimProg);
    const u = this.u;
    gl.viewport(0, 0, pw, ph);
    // gl_FragCoord is in device px; `uPx` converts it, and the surface size is the CSS size.
    gl.uniform2f(u.uSize, o.width, o.height);
    gl.uniform1f(u.uPx, cssW / pw);
    gl.uniform1f(u.uMargin, margin);
    gl.uniform1f(u.uRadius, o.radius);
    gl.uniform1f(u.uBezel, o.bezel);
    gl.uniform1f(u.uThickness, o.thickness);
    gl.uniform4f(
      u.uSceneMap,
      o.sceneX,
      o.sceneY,
      1 / Math.max(1, o.sceneW),
      1 / Math.max(1, o.sceneH),
    );
    gl.uniform1f(u.uSceneOn, o.sceneOn);
    gl.uniform4f(u.uTint, o.tint[0], o.tint[1], o.tint[2], o.tint[3]);
    gl.uniform4f(u.uRim, o.rim[0], o.rim[1], o.rim[2], o.rimOpacity ?? 1);
    gl.uniform3f(u.uInk, o.ink[0], o.ink[1], o.ink[2]);
    gl.uniform1f(u.uDark, o.dark);
    gl.uniform3f(u.uLight, o.lightX, o.lightY, o.lightZ);
    gl.uniform1f(u.uLightOn, o.lightOn);
    gl.uniform2f(u.uTilt, o.tilt?.[0] ?? 0, o.tilt?.[1] ?? 0);
    const j = o.jelly;
    gl.uniform1f(u.uSeed, j?.seed ?? 0);
    gl.uniform4f(u.uHaze, j?.haze[0] ?? 0, j?.haze[1] ?? 0, j?.haze[2] ?? 0, j?.hazeA ?? 0);
    gl.uniform1f(u.uDispersion, o.dispersion ?? 1);
    gl.uniform2fv(u.uJelly, o.lattice ?? NO_LATTICE);
    gl.uniform1f(u.uJellyOn, o.lattice ? 1 : 0);
    const gel = o.gel;
    gl.uniform3f(u.uDisperse, gel?.disperse[0] ?? 0, gel?.disperse[1] ?? 0, gel?.disperse[2] ?? 0);
    gl.uniform2f(u.uBand, gel?.band ?? 0, gel?.bandA ?? 0);
    const f = gel?.fresnel;
    gl.uniform4f(u.uFresnel, f?.[0] ?? 0, f?.[1] ?? 0, f?.[2] ?? 0, f?.[3] ?? 0);
    const [eR, eG, eB] = gel?.edge ?? [NO_EDGE, NO_EDGE, NO_EDGE];
    gl.uniform4f(u.uEdgeR, eR[0], eR[1], eR[2], eR[3]);
    gl.uniform4f(u.uEdgeG, eG[0], eG[1], eG[2], eG[3]);
    gl.uniform4f(u.uEdgeB, eB[0], eB[1], eB[2], eB[3]);
    const sp = gel?.specular;
    gl.uniform4f(u.uSpecular, sp?.[0] ?? 0, sp?.[1] ?? 0, sp?.[2] ?? 0, sp?.[3] ?? 0);
    gl.uniform3f(u.uAccent, gel?.accent[0] ?? 0, gel?.accent[1] ?? 0, gel?.accent[2] ?? 0);
    gl.uniform1f(u.uPlasmaPeak, gel?.plasmaPeak ?? 0);
    const p = o.plasma;
    gl.uniform1f(u.uPlasmaInRim, p ? 1 : 0);
    gl.uniform1f(u.uLevel, p?.level ?? 0);
    gl.uniform4fv(u.uRings, p?.rings ?? NO_RINGS);
    const dent = o.dent;
    gl.uniform1f(u.uDentOn, dent ? 1 : 0);
    gl.uniform4f(u.uDent, dent?.x ?? 0, dent?.y ?? 0, dent?.depth ?? 0, dent?.radius ?? 1);
    gl.uniform2f(u.uDentStretch, dent?.stretchX ?? 0, dent?.stretchY ?? 0);
    gl.uniform2f(u.uMold, gel?.mold ?? 0, gel?.feather ?? 0);
    gl.uniform3f(u.uLens, gel?.dispersion ?? 1, gel?.lens ?? 1, gel?.reflect ?? 0);
    return this.blit(pw, ph, target);
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.tex) gl.deleteTexture(this.tex);
    this.gl = null;
    this.tex = null;
    this.rimProg = this.hazeProg = this.current = null;
    this.canvas.width = this.canvas.height = 1;
    this.cw = this.ch = 0;
  }
}
