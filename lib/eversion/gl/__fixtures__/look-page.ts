/**
 * The test page's script for `testing/e2e/eversion-look.mjs` (amendment 2026-10-18: tiers, the cosmos, any
 * aspect ratio). Bundled by esbuild for that script only — it is not imported by the app.
 *
 * It runs a whole navigation the way the live loop does — the REAL `Timeline`, the REAL baked LUT, the REAL end
 * orientation and the REAL renderer and shaders on the REAL mesh — at a chosen tier, viewport and theme, and
 * exposes two things on `window.__l`:
 *
 * - `frames(times)`: the canvas at those timeline times, as PNGs (the screenshots a person looks at);
 * - `continuity(stepMs)`: every `stepMs` from start to `done`, the mean absolute change of a 160-px-wide copy of
 *   the canvas from the frame before, so a pop (anything arriving or leaving in one frame) is a spike in a curve
 *   that is otherwise as smooth as the motion.
 */

import { PLAN_MS, UNCOVER_LEAD_MS, TIERS } from '../../constants';
import { getBakedLut } from '../../projection-lut';
import { afterDomainTransform, alignAngle, fitEndIsometry } from '../../orientation';
import { SPIN_AXIS } from '../../domain';
import { Timeline } from '../../timeline';
import { cosmosEnabled } from '../../cosmos';
import type { ProjectionId, ThemeColours, Tier, TimelineSnapshot } from '../../types';
import { createRenderer } from '../renderer';

const THEMES: Record<'dark' | 'light', ThemeColours> = {
  dark: {
    bg: [0.04, 0.05, 0.08, 1],
    veil: [0.07, 0.08, 0.12, 1],
    accent: [0.38, 0.55, 1, 1],
    cageMinor: [0.7, 0.8, 1, 0.2],
    cageParallel: [0.7, 0.8, 1, 0.13],
    cageMajor: [0.8, 0.9, 1, 0.34],
    cageRipple: [0.6, 0.85, 1, 0.8],
    cageWidth: 1.2,
  },
  light: {
    bg: [0.97, 0.97, 0.98, 1],
    veil: [0.9, 0.91, 0.94, 1],
    accent: [0.2, 0.4, 0.95, 1],
    cageMinor: [0.1, 0.15, 0.3, 0.2],
    cageParallel: [0.1, 0.15, 0.3, 0.13],
    cageMajor: [0.1, 0.15, 0.35, 0.34],
    cageRipple: [0.1, 0.3, 0.8, 0.6],
    cageWidth: 1.2,
  },
};

let view = { w: 1440, h: 900, dpr: 1 };
let theme: 'dark' | 'light' = 'dark';
let tier: Tier = 'high';
let projection: ProjectionId = 'mercator';
let canvas: HTMLCanvasElement | null = null;
let renderer: ReturnType<typeof createRenderer> | null = null;
/** The destination page: what the live page under the canvas is, so the final dissolve is judged against it. */
let destination: HTMLCanvasElement | null = null;

/** A page that looks like a page: a top bar, a column of cards with "text" lines, a side rail. */
function sitePage(label: string, hue: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = view.w;
  c.height = view.h;
  const g = c.getContext('2d')!;
  const dark = theme === 'dark';
  g.fillStyle = dark ? '#0b0d14' : '#f6f7fa';
  g.fillRect(0, 0, view.w, view.h);
  g.fillStyle = dark ? '#141826' : '#ffffff';
  g.fillRect(0, 0, view.w, 64);
  g.fillStyle = `hsl(${hue}, 80%, ${dark ? 62 : 48}%)`;
  g.font = 'bold 28px sans-serif';
  g.fillText(label, 24, 42);
  const col = Math.min(680, view.w - 48);
  const x0 = Math.max(24, (view.w - col) / 2);
  for (let y = 96, i = 0; y < view.h - 40; y += 190, i++) {
    g.fillStyle = dark ? '#151a28' : '#ffffff';
    g.fillRect(x0, y, col, 168);
    g.fillStyle = `hsl(${(hue + i * 40) % 360}, 70%, ${dark ? 55 : 60}%)`;
    g.fillRect(x0 + 16, y + 16, 44, 44);
    g.fillStyle = dark ? '#c8cee0' : '#2a3040';
    g.font = 'bold 18px sans-serif';
    g.fillText(`${label} post ${i + 1}`, x0 + 72, y + 34);
    g.fillStyle = dark ? '#7d859c' : '#7a8296';
    for (let l = 0; l < 4; l++)
      g.fillRect(x0 + 72, y + 52 + l * 22, col - 100 - ((l * 53) % 120), 9);
  }
  if (view.w > 1000) {
    g.fillStyle = dark ? '#121624' : '#eef0f5';
    g.fillRect(view.w - 300, 64, 300, view.h - 64);
  }
  return c;
}

function realOrientation() {
  const { R } = fitEndIsometry();
  const thetaAlign = alignAngle(R);
  return { thetaAlign, mAfter: afterDomainTransform(R, SPIN_AXIS, thetaAlign) };
}

let orientation: ReturnType<typeof realOrientation> | null = null;

async function setup() {
  canvas?.remove();
  canvas = document.createElement('canvas');
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  document.body.appendChild(canvas);
  renderer?.dispose();
  // Software GL is slow by construction: the cosmos governor would always fade it out here.
  renderer = createRenderer(canvas, {
    tier,
    dprCap: TIERS[tier].canvasDprCap,
    governCosmos: false,
  });
  orientation ??= realOrientation();
  renderer.prime({
    projection,
    viewport: { ...view },
    globe: hubGlobe(),
    colours: THEMES[theme],
    lut: getBakedLut(projection, view).data,
    mAfter: orientation.mAfter,
  });
  const before = await createImageBitmap(sitePage('Home', 220));
  destination = sitePage('Games', 30);
  const after = await createImageBitmap(destination);
  renderer.setTexture('before', before);
  renderer.setTexture('placeholder', after);
  renderer.setTexture('after', after);
}

/** The hub's globe as it is released: centred, a little smaller than the effect's, still turning a little. */
function hubGlobe() {
  return {
    yaw: 20,
    pitch: -8,
    yawVel: 30,
    pitchVel: 0,
    centre: [view.w / 2, view.h / 2] as [number, number],
    radius: 0.3 * Math.min(view.w, view.h),
  };
}

/** Replay a run from the start, calling `at(snapshot)` on every tick of `stepMs`, until `done`. */
function replay(stepMs: number, at: (s: Readonly<TimelineSnapshot>) => boolean | void) {
  const tl = new Timeline({
    viewport: { ...view },
    globe: hubGlobe(),
    thetaAlign: orientation!.thetaAlign,
  });
  let now = 0;
  tl.start(now);
  let uncoverAt = -1;
  let answered = false;
  let afterSent = false;
  for (let i = 0; i < 20000 && !tl.finished; i++) {
    now += stepMs;
    // AFTER lands mid-eversion, as a settled destination does.
    if (!afterSent && now >= 1400) {
      afterSent = true;
      tl.afterReady(now);
    }
    const s = tl.tick(now);
    for (const e of tl.events()) if (e.stage === 'uncover') uncoverAt = now;
    if (uncoverAt >= 0 && !answered && now >= uncoverAt + UNCOVER_LEAD_MS) {
      answered = true;
      tl.reveal(now);
    }
    if (at(s) === false) break;
  }
}

declare global {
  interface Window {
    __l: typeof api;
  }
}

const api = {
  plan: PLAN_MS,
  async init(opts: {
    w: number;
    h: number;
    tier: Tier;
    theme: 'dark' | 'light';
    projection?: ProjectionId;
  }) {
    view = { w: opts.w, h: opts.h, dpr: 1 };
    tier = opts.tier;
    theme = opts.theme;
    projection = opts.projection ?? 'mercator';
    await setup();
    return { cosmos: cosmosEnabled(view, tier), canvas: [canvas!.width, canvas!.height] };
  },

  /** The canvas at each of `times` (timeline ms), as PNG data URLs, with the snapshot's stage. */
  frames(times: number[]) {
    const out: { t: number; stage: string; png: string; err: number }[] = [];
    const want = [...times].sort((a, b) => a - b);
    let k = 0;
    replay(4, (s) => {
      while (k < want.length && s.t >= want[k]!) {
        renderer!.draw(s);
        const gl = canvas!.getContext('webgl2')!;
        out.push({
          t: want[k]!,
          stage: s.stage,
          png: canvas!.toDataURL('image/png'),
          err: gl.getError(),
        });
        k++;
      }
      return k < want.length;
    });
    return out;
  },

  /**
   * Frame-to-frame change across the whole run (mean |Δ| per channel, 0..255, of a 160-px-wide copy), with the
   * time of each sample. Drawn with `preserveDrawingBuffer` semantics avoided: each frame is copied right after
   * its draw, in the same task.
   */
  continuity(stepMs = 16) {
    const small = document.createElement('canvas');
    small.width = 160;
    small.height = Math.max(1, Math.round((160 * view.h) / view.w));
    const g = small.getContext('2d', { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    const deltas: { t: number; d: number; stage: string }[] = [];
    replay(stepMs, (s) => {
      renderer!.draw(s);
      // What the visitor sees: the canvas over the live page (the destination, once the cover is off).
      g.drawImage(destination!, 0, 0, small.width, small.height);
      g.drawImage(canvas!, 0, 0, small.width, small.height);
      const px = g.getImageData(0, 0, small.width, small.height).data;
      if (prev) {
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) {
          sum +=
            Math.abs(px[i]! - prev[i]!) +
            Math.abs(px[i + 1]! - prev[i + 1]!) +
            Math.abs(px[i + 2]! - prev[i + 2]!);
        }
        deltas.push({ t: s.t, d: sum / ((px.length / 4) * 3), stage: s.stage });
      }
      prev = new Uint8ClampedArray(px);
    });
    return deltas;
  },
};

window.__l = api;
