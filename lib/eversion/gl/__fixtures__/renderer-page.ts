/**
 * The test page's script for `testing/e2e/eversion-renderer.mjs` (T24). Bundled
 * by esbuild for that script only — it is not imported by the app.
 *
 * It exposes `window.__t`, a handful of scenario functions the Playwright script
 * calls and asserts on. The renderer under test is the REAL `createRenderer`; the
 * script aliases `../mesh` to a local UV sphere and `./shaders` to "not
 * implemented" so the stub shaders are what run (see `local-mesh.ts`,
 * `no-real-shaders.ts`).
 */

import { LUT_SIZE } from '../../constants';
import { createSnapshot } from '../../snapshot';
import type { Rgba, ThemeColours, TimelineSnapshot } from '../../types';
import { createRenderer } from '../renderer';
import { meshForTier, windingErrors } from './local-mesh';

const VIEW = { w: 256, h: 160, dpr: 1 } as const;

/** Colours chosen so no two are close; cage alpha 0 keeps the centre pixel pure. */
const BEFORE: Rgba = [0.9, 0.2, 0.1, 1];
const AFTER: Rgba = [0.1, 0.4, 0.9, 1];
const VEIL: Rgba = [0.05, 0.05, 0.05, 1];
const CLEAR: Rgba = [0, 0, 0, 0];

const colours: ThemeColours = {
  bg: [1, 1, 1, 1],
  veil: VEIL,
  accent: [0.5, 0.5, 0.5, 1],
  cageMinor: CLEAR,
  cageParallel: CLEAR,
  cageMajor: CLEAR,
  cageRipple: CLEAR,
  cageWidth: 1,
};

/** An identity LUT: texel (i, j) holds the page UV whose sphere point is `(θ, φ)`. */
function identityLut(): Float32Array {
  const [w, h] = LUT_SIZE;
  const lut = new Float32Array(w * h * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const phi = ((j + 0.5) / h) * Math.PI - Math.PI / 2;
      lut[(j * w + i) * 2] = (i + 0.5) / w;
      lut[(j * w + i) * 2 + 1] = 0.5 - phi / Math.PI;
    }
  }
  return lut;
}

const IDENTITY3 = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

let canvas: HTMLCanvasElement | null = null;
let renderer: ReturnType<typeof createRenderer> | null = null;
let lostCalls = 0;
let drawCalls = 0;

/** Count draw calls per `draw()`: the budget is two. */
let instrumented = false;
function instrumentDrawCalls() {
  if (instrumented) return;
  instrumented = true;
  const proto = WebGL2RenderingContext.prototype;
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced'] as const) {
    const original = proto[name] as (...a: unknown[]) => void;
    (proto as unknown as Record<string, unknown>)[name] = function (
      this: unknown,
      ...a: unknown[]
    ) {
      drawCalls++;
      return original.apply(this, a);
    };
  }
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

function ctx(): WebGL2RenderingContext {
  // The same canvas returns the renderer's own context.
  return canvas!.getContext('webgl2') as WebGL2RenderingContext;
}

/** RGB (0–255) at a point given in CSS px from the TOP-left. */
function pixel(x: number, y: number): [number, number, number] {
  const gl = ctx();
  const out = new Uint8Array(4);
  gl.readPixels(
    Math.round(x),
    canvas!.height - 1 - Math.round(y),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    out,
  );
  return [out[0], out[1], out[2]];
}

function bytes(c: Rgba): [number, number, number] {
  return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
}

function drawAndRead(patch: Partial<TimelineSnapshot>, x = VIEW.w / 2, y = VIEW.h / 2) {
  renderer!.draw(snapshot(patch));
  return pixel(x, y);
}

const api = {
  windingErrors: () => {
    const m = meshForTier('low');
    return { bad: windingErrors(m), triangles: m.indexCount / 3 };
  },

  init() {
    canvas?.remove();
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    instrumentDrawCalls();
    renderer = createRenderer(canvas, {
      tier: 'low',
      dprCap: 1,
      onContextLost: () => {
        lostCalls++;
      },
    });
    return { baselineLive: renderer.counters().live, debugSlots: window.__eversion?.slots() ?? [] };
  },

  prime() {
    renderer!.prime({
      projection: 'equirect',
      viewport: { ...VIEW },
      globe: {
        yaw: 0,
        pitch: 0,
        yawVel: 0,
        pitchVel: 0,
        centre: [VIEW.w / 2, VIEW.h / 2],
        radius: 60,
      },
      orb: { cx: 0, cy: 0, radius: 10 },
      colours,
      lut: identityLut(),
      mAfter: IDENTITY3,
    });
    return { w: canvas!.width, h: canvas!.height };
  },

  /** Solid textures through the debug slot, as the harness does it. */
  solid() {
    window.__eversion!.renderer!.solidTextures(BEFORE, AFTER);
  },

  expected: { before: bytes(BEFORE), after: bytes(AFTER), veil: bytes(VEIL) },

  /** The five centre-pixel scenarios of the T24 acceptance. */
  centre() {
    const rest = drawAndRead({});
    const sphere = drawAndRead({ wrap: 1, unwrap: 1, evert: 0, afterMix: 1 });
    const flipped = drawAndRead({ wrap: 1, unwrap: 1, evert: 1, afterMix: 1 });
    window.__eversion!.renderer!.pauseAt(1);
    const forced = drawAndRead({ wrap: 1, unwrap: 1, evert: 0, afterMix: 1 });
    window.__eversion!.renderer!.pauseAt(null);
    // Corner of the sphere's frame is outside the globe: the veil clear.
    const outside = drawAndRead({ wrap: 1, unwrap: 1, evert: 0 }, 3, 3);
    // bgAlpha 0 clears to transparent: premultiplied (0,0,0).
    const clear = drawAndRead({ wrap: 1, unwrap: 1, bgAlpha: 0 }, 3, 3);
    return { rest, sphere, flipped, forced, outside, clear };
  },

  /** A real ImageBitmap: four quadrants, so orientation and the flat morph endpoint are checked. */
  async quadrants() {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const g = c.getContext('2d')!;
    const fills = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']; // TL TR BL BR
    fills.forEach((f, i) => {
      g.fillStyle = f;
      g.fillRect(i % 2, Math.floor(i / 2), 1, 1);
    });
    const bitmap = await createImageBitmap(c);
    renderer!.setTexture('before', bitmap);
    bitmap.close();
    renderer!.draw(snapshot({ wrap: 0, unwrap: 1 }));
    const q = (fx: number, fy: number) => pixel(VIEW.w * fx, VIEW.h * fy);
    return { tl: q(0.25, 0.25), tr: q(0.75, 0.25), bl: q(0.25, 0.75), br: q(0.75, 0.75) };
  },

  /** `draw` makes at most two draw calls (the surface, then the cage). */
  maxDrawCallsPerFrame() {
    let max = 0;
    for (const patch of [{}, { wrap: 1 }, { wrap: 1, evert: 0.5 }]) {
      drawCalls = 0;
      renderer!.draw(snapshot(patch));
      max = Math.max(max, drawCalls);
    }
    return max;
  },

  /** `debugEvaluate` against the stub's round-sphere `F`. */
  evaluate() {
    const es = new Float32Array([0, 0.25, 0.5, 1]);
    const out = renderer!.debugEvaluate(es);
    const mesh = meshForTier('low');
    let worst = 0;
    for (let k = 0; k < es.length; k++) {
      for (let v = 0; v < mesh.vertexCount; v += 7) {
        const th = mesh.domain[v * 2];
        const ph = mesh.domain[v * 2 + 1];
        const s = 1 - 2 * es[k];
        const want = [
          Math.cos(ph) * Math.sin(th) * s,
          -Math.sin(ph) * s,
          Math.cos(ph) * Math.cos(th) * s,
        ];
        for (let c = 0; c < 3; c++) {
          worst = Math.max(worst, Math.abs(out[(k * mesh.vertexCount + v) * 3 + c] - want[c]));
        }
      }
    }
    return { length: out.length, expected: es.length * mesh.vertexCount * 3, worst };
  },

  /** For the CDP heap measurement: run `n` draws in one task. */
  drawMany(n: number) {
    const s = snapshot({ wrap: 1, unwrap: 1, evert: 0.3, spin: 0.1, tilt: 0.2, afterMix: 0.5 });
    for (let i = 0; i < n; i++) {
      s.spin = i * 0.01;
      s.evert = (i % 100) / 100;
      renderer!.draw(s);
    }
  },

  counters: () => renderer!.counters(),
  release: () => renderer!.release(),
  dispose: () => renderer!.dispose(),
  setDprScale: (s: number) => {
    renderer!.setDprScale(s);
    return { w: canvas!.width, h: canvas!.height };
  },

  /** Lose the context and wait for the renderer's callback. */
  async loseContext() {
    const gl = ctx();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { supported: false, calls: 0 };
    ext.loseContext();
    for (let i = 0; i < 50 && lostCalls === 0; i++) await new Promise((r) => setTimeout(r, 20));
    // Must be a safe no-op afterwards.
    renderer!.draw(snapshot());
    return { supported: true, calls: lostCalls };
  },
};

(window as unknown as { __t: typeof api }).__t = api;
