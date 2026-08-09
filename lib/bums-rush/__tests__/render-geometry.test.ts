/**
 * The render pipeline's arithmetic, with no canvas anywhere.
 *
 * Everything under test here is a pure function or a small state machine, and
 * every one of them is a thing that is invisible when it is wrong on the
 * machine it was written on:
 *
 * - **The stage fit** is correct on a 16:9 monitor no matter how it is written.
 *   `max` instead of `min` clips the playfield; two scales instead of one skews
 *   the drawing; forgetting to centre pins the stage to a corner. All three
 *   ship green on a developer's screen and are obvious on a phone, so the six
 *   resolutions below are checked by number rather than by eye.
 * - **The DPR ladder** must never disagree with the buffer it sizes, and must
 *   never exceed `MAX_GAME_DPR` — a 3× phone drawing at 3× is 2.25× the fill
 *   rate for no visible gain.
 * - **The boil** must be a pure function of `(vertex, phase)`. If it is not,
 *   the line hisses instead of boiling, and nothing but a determinism test
 *   catches that before someone watches it.
 * - **Note wrapping** must not assume English. German runs ~40% longer and
 *   compounds into single tokens wider than the card.
 * - **The degradation ladder** must ignore single spikes. A ladder driven by
 *   one frame drops the boil every time the pause menu opens.
 */

import { describe, expect, it } from 'vitest';
import { CAMERA, PHYSICS, RENDER } from '../constants';
import type { Rect } from '../types';
import {
  DPR_LADDER,
  LOW_END_DPR_CAP,
  QualityLadder,
  fitStage,
  stageDpr,
  visibleWorldRect,
  worldTransform,
  type StageFit,
  type Transform2D,
} from '../render/renderer';
import { createBoil } from '../render/boil';
import { taperWidth } from '../render/ink';
import { bakeScaleFor, MAX_BAKE_PIXELS, measureNote } from '../render/worldbake';
import { MAX_GAME_DPR } from '@/lib/display-scale';

const DESIGN_W = PHYSICS.DESIGN_WIDTH;
const DESIGN_H = PHYSICS.DESIGN_HEIGHT;
const DESIGN_RATIO = DESIGN_W / DESIGN_H;

/** The viewports the fit is contractually required to be right at. */
const VIEWPORTS = [
  { name: '1920×1080 desktop 16:9', w: 1920, h: 1080 },
  { name: '3440×1440 ultrawide 21:9', w: 3440, h: 1440 },
  { name: '1024×768 tablet 4:3', w: 1024, h: 768 },
  { name: '2532×1170 phone landscape 20:9', w: 2532, h: 1170 },
  { name: '390×844 phone portrait', w: 390, h: 844 },
  { name: '800×600 small 4:3', w: 800, h: 600 },
] as const;

function mapPoint(t: Transform2D, x: number, y: number): [number, number] {
  return [t.a * x + t.e, t.d * y + t.f];
}

const SCRATCH: Transform2D = { a: 0, d: 0, e: 0, f: 0 };
const RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

describe('fitStage — 16:9 letterboxing', () => {
  for (const view of VIEWPORTS) {
    describe(view.name, () => {
      const fit = fitStage(view.w, view.h);

      it('keeps the stage exactly 16:9', () => {
        expect(fit.width / fit.height).toBeCloseTo(DESIGN_RATIO, 10);
      });

      it('never skews — one scale for both axes', () => {
        expect(fit.width / DESIGN_W).toBeCloseTo(fit.scale, 12);
        expect(fit.height / DESIGN_H).toBeCloseTo(fit.scale, 12);
      });

      it('never clips — the whole stage is inside the viewport', () => {
        expect(fit.width).toBeLessThanOrEqual(view.w + 1e-9);
        expect(fit.height).toBeLessThanOrEqual(view.h + 1e-9);
        expect(fit.offsetX).toBeGreaterThanOrEqual(0);
        expect(fit.offsetY).toBeGreaterThanOrEqual(0);
      });

      it('centres the stage, so the letterbox is split evenly', () => {
        expect(fit.offsetX * 2 + fit.width).toBeCloseTo(view.w, 9);
        expect(fit.offsetY * 2 + fit.height).toBeCloseTo(view.h, 9);
      });

      it('fills at least one axis exactly (contain, not shrink-to-fit)', () => {
        const fillsWidth = Math.abs(fit.width - view.w) < 1e-6;
        const fillsHeight = Math.abs(fit.height - view.h) < 1e-6;
        expect(fillsWidth || fillsHeight).toBe(true);
      });
    });
  }

  it('produces the expected letterbox at each tested resolution', () => {
    const results = VIEWPORTS.map((v) => {
      const fit = fitStage(v.w, v.h);
      return {
        name: v.name,
        scale: Number(fit.scale.toFixed(4)),
        stage: [Math.round(fit.width), Math.round(fit.height)],
        bars: [Math.round(fit.offsetX), Math.round(fit.offsetY)],
      };
    });
    expect(results).toEqual([
      { name: '1920×1080 desktop 16:9', scale: 1, stage: [1920, 1080], bars: [0, 0] },
      { name: '3440×1440 ultrawide 21:9', scale: 1.3333, stage: [2560, 1440], bars: [440, 0] },
      { name: '1024×768 tablet 4:3', scale: 0.5333, stage: [1024, 576], bars: [0, 96] },
      {
        name: '2532×1170 phone landscape 20:9',
        scale: 1.0833,
        stage: [2080, 1170],
        bars: [226, 0],
      },
      { name: '390×844 phone portrait', scale: 0.2031, stage: [390, 219], bars: [0, 312] },
      { name: '800×600 small 4:3', scale: 0.4167, stage: [800, 450], bars: [0, 75] },
    ]);
  });

  it('returns a zero fit for a viewport that has not been laid out yet', () => {
    for (const [w, h] of [
      [0, 0],
      [1920, 0],
      [Number.NaN, 1080],
      [-100, 100],
    ]) {
      const fit = fitStage(w, h);
      expect(fit.scale).toBe(0);
      expect(fit.width).toBe(0);
    }
  });
});

describe('worldTransform', () => {
  const camera = { x: 4000, y: 2500, zoom: 1 };

  it('puts the camera centre at the centre of the stage on every viewport', () => {
    for (const view of VIEWPORTS) {
      for (const dpr of [1, 1.5, 2]) {
        const fit = fitStage(view.w, view.h);
        const t = worldTransform(fit, camera, dpr, SCRATCH);
        const [x, y] = mapPoint(t, camera.x, camera.y);
        expect(x).toBeCloseTo((view.w * dpr) / 2, 6);
        expect(y).toBeCloseTo((view.h * dpr) / 2, 6);
      }
    }
  });

  it('maps the design-space corners onto the stage corners at zoom 1', () => {
    const fit = fitStage(2532, 1170);
    const t = worldTransform(fit, camera, 2, SCRATCH);
    const [left, top] = mapPoint(t, camera.x - DESIGN_W / 2, camera.y - DESIGN_H / 2);
    const [right, bottom] = mapPoint(t, camera.x + DESIGN_W / 2, camera.y + DESIGN_H / 2);
    expect(left).toBeCloseTo(fit.offsetX * 2, 6);
    expect(top).toBeCloseTo(fit.offsetY * 2, 6);
    expect(right).toBeCloseTo((fit.offsetX + fit.width) * 2, 6);
    expect(bottom).toBeCloseTo((fit.offsetY + fit.height) * 2, 6);
  });

  it('scales both axes identically at every zoom — the no-skew guarantee', () => {
    const fit = fitStage(3440, 1440);
    for (const zoom of [CAMERA.MIN_ZOOM, 0.8, 1, CAMERA.MAX_ZOOM]) {
      const t = worldTransform(fit, { x: 0, y: 0, zoom }, 2, SCRATCH);
      expect(t.a).toBe(t.d);
      expect(t.a).toBeCloseTo(2 * fit.scale * zoom, 10);
    }
  });

  it('clamps a camera zoom outside the §5 range instead of trusting it', () => {
    const fit = fitStage(1920, 1080);
    expect(worldTransform(fit, { x: 0, y: 0, zoom: 9 }, 1, SCRATCH).a).toBeCloseTo(
      CAMERA.MAX_ZOOM,
      10,
    );
    expect(worldTransform(fit, { x: 0, y: 0, zoom: 0.01 }, 1, SCRATCH).a).toBeCloseTo(
      CAMERA.MIN_ZOOM,
      10,
    );
  });

  it('survives a NaN camera rather than blanking the screen', () => {
    const fit = fitStage(1920, 1080);
    const t = worldTransform(fit, { x: 0, y: 0, zoom: Number.NaN }, 1, SCRATCH);
    expect(Number.isFinite(t.a)).toBe(true);
    expect(t.a).toBeGreaterThan(0);
  });
});

describe('visibleWorldRect', () => {
  it('shows exactly the design rect at zoom 1, centred on the camera', () => {
    const fit = fitStage(1920, 1080);
    visibleWorldRect(fit, { x: 500, y: 300, zoom: 1 }, RECT);
    expect(RECT.w).toBeCloseTo(DESIGN_W, 9);
    expect(RECT.h).toBeCloseTo(DESIGN_H, 9);
    expect(RECT.x).toBeCloseTo(500 - DESIGN_W / 2, 9);
    expect(RECT.y).toBeCloseTo(300 - DESIGN_H / 2, 9);
  });

  it('shows less world as the camera zooms in, and more as it zooms out', () => {
    const fit = fitStage(390, 844);
    visibleWorldRect(fit, { x: 0, y: 0, zoom: CAMERA.MAX_ZOOM }, RECT);
    const zoomedIn = RECT.w;
    visibleWorldRect(fit, { x: 0, y: 0, zoom: CAMERA.MIN_ZOOM }, RECT);
    expect(RECT.w).toBeGreaterThan(zoomedIn);
    expect(RECT.w).toBeCloseTo(DESIGN_W / CAMERA.MIN_ZOOM, 9);
  });

  it('is independent of viewport shape — everyone sees the same world', () => {
    const widths = VIEWPORTS.map((v) => {
      visibleWorldRect(fitStage(v.w, v.h), { x: 0, y: 0, zoom: 1 }, RECT);
      return RECT.w;
    });
    expect(new Set(widths).size).toBe(1);
  });
});

describe('stageDpr', () => {
  it('never exceeds MAX_GAME_DPR however sharp the display claims to be', () => {
    for (const devicePixelRatio of [2, 3, 4, 5.5]) {
      expect(stageDpr({ devicePixelRatio }, { lowEnd: false, step: 0 })).toBe(MAX_GAME_DPR);
    }
  });

  it('passes through a ratio below the cap', () => {
    expect(stageDpr({ devicePixelRatio: 1 }, { lowEnd: false, step: 0 })).toBe(1);
    expect(stageDpr({ devicePixelRatio: 1.5 }, { lowEnd: false, step: 0 })).toBe(1.5);
  });

  it('caps perf-lite devices one rung lower (§12.3)', () => {
    expect(stageDpr({ devicePixelRatio: 3 }, { lowEnd: true, step: 0 })).toBe(LOW_END_DPR_CAP);
  });

  it('walks down the ladder and never back past 1', () => {
    const source = { devicePixelRatio: 3 };
    expect(stageDpr(source, { lowEnd: false, step: 0 })).toBe(DPR_LADDER[0]);
    expect(stageDpr(source, { lowEnd: false, step: 1 })).toBe(DPR_LADDER[1]);
    expect(stageDpr(source, { lowEnd: false, step: 2 })).toBe(DPR_LADDER[2]);
    expect(stageDpr(source, { lowEnd: false, step: 99 })).toBe(DPR_LADDER[DPR_LADDER.length - 1]);
  });

  it('defaults to 1 when the browser reports nothing', () => {
    expect(stageDpr({}, { lowEnd: false, step: 0 })).toBe(1);
  });
});

describe('the boil', () => {
  it('advances once every RENDER.BOIL_FRAME_DIVISOR frames', () => {
    const boil = createBoil(42);
    boil.advance(0);
    expect(boil.phase).toBe(0);
    boil.advance(RENDER.BOIL_FRAME_DIVISOR - 1);
    expect(boil.phase).toBe(0);
    boil.advance(RENDER.BOIL_FRAME_DIVISOR);
    expect(boil.phase).toBe(1);
    boil.advance(RENDER.BOIL_FRAME_DIVISOR * 7 + 2);
    expect(boil.phase).toBe(7);
  });

  it('is a pure function of (seed, vertex, phase)', () => {
    const a = createBoil(9001);
    const b = createBoil(9001);
    for (const frame of [0, 3, 12, 900]) {
      a.advance(frame);
      b.advance(frame);
      for (let id = 0; id < 32; id++) {
        expect(a.dx(id, 1.4)).toBe(b.dx(id, 1.4));
        expect(a.dy(id, 1.4)).toBe(b.dy(id, 1.4));
      }
    }
  });

  it('holds every offset inside the amplitude', () => {
    const boil = createBoil(7);
    for (let frame = 0; frame < 60; frame += 3) {
      boil.advance(frame);
      for (let id = 0; id < 200; id++) {
        expect(Math.abs(boil.dx(id, RENDER.BOIL_AMPLITUDE_WORLD))).toBeLessThanOrEqual(
          RENDER.BOIL_AMPLITUDE_WORLD,
        );
      }
    }
  });

  it('decorrelates neighbouring vertices — a line boils, it does not translate', () => {
    const boil = createBoil(1234);
    boil.advance(9);
    const values = new Set<number>();
    for (let id = 0; id < 64; id++) values.add(boil.dx(id, 1.4));
    expect(values.size).toBeGreaterThan(60);
  });

  it('moves when the phase moves', () => {
    const boil = createBoil(5);
    boil.advance(0);
    const before = boil.dx(11, 1.4);
    boil.advance(RENDER.BOIL_FRAME_DIVISOR);
    expect(boil.dx(11, 1.4)).not.toBe(before);
  });

  it('is zeroed and frozen under reduced motion (§2.3)', () => {
    const boil = createBoil(5, true);
    boil.advance(999);
    expect(boil.phase).toBe(0);
    expect(boil.active).toBe(false);
    expect(boil.world).toBe(0);
    expect(boil.actor).toBe(0);
    expect(boil.dx(3, RENDER.BOIL_AMPLITUDE_WORLD)).toBe(0);
    expect(boil.dy(3, RENDER.BOIL_AMPLITUDE_WORLD)).toBe(0);
  });

  it('is zeroed and frozen when the degradation ladder drops it (§17 step 1)', () => {
    const boil = createBoil(5);
    boil.advance(30);
    expect(boil.phase).toBe(10);
    boil.setEnabled(false);
    expect(boil.phase).toBe(0);
    expect(boil.dx(3, 1.4)).toBe(0);
    boil.setEnabled(true);
    boil.advance(30);
    expect(boil.phase).toBe(10);
    expect(boil.world).toBe(RENDER.BOIL_AMPLITUDE_WORLD);
    expect(boil.actor).toBe(RENDER.BOIL_AMPLITUDE_ACTOR);
  });
});

describe('taperWidth', () => {
  it('is widest at the midpoint', () => {
    expect(taperWidth(0.5, 10)).toBeCloseTo(10, 12);
  });

  it('thins to (1 - taper) at both ends, symmetrically', () => {
    const ends = 10 * (1 - RENDER.STROKE_TAPER);
    expect(taperWidth(0, 10)).toBeCloseTo(ends, 12);
    expect(taperWidth(1, 10)).toBeCloseTo(ends, 12);
    expect(taperWidth(0.25, 10)).toBeCloseTo(taperWidth(0.75, 10), 12);
  });

  it('never inverts or goes negative across the whole taper range', () => {
    for (const taper of [0, 0.35, 0.9, 1]) {
      for (let i = 0; i <= 20; i++) {
        expect(taperWidth(i / 20, 10, taper)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('clamps t outside [0, 1] rather than growing the stroke', () => {
    expect(taperWidth(-4, 10)).toBeCloseTo(taperWidth(0, 10), 12);
    expect(taperWidth(9, 10)).toBeCloseTo(taperWidth(1, 10), 12);
  });
});

describe('bakeScaleFor', () => {
  it('gives a small level the density the device asked for', () => {
    expect(bakeScaleFor({ x: 0, y: 0, w: 1920, h: 1080 }, 1)).toBeCloseTo(1, 6);
  });

  it('caps a huge level so one baked layer stays inside its pixel budget', () => {
    const bounds = { x: 0, y: 0, w: 8000, h: 4500 };
    const scale = bakeScaleFor(bounds, 2);
    expect(scale).toBeLessThan(2);
    expect(bounds.w * scale * (bounds.h * scale)).toBeLessThanOrEqual(MAX_BAKE_PIXELS + 1);
  });
});

// ─── Note text ──────────────────────────────────────────────────────────────

interface FakeCtx {
  ctx: CanvasRenderingContext2D;
  drawn: { text: string; x: number; y: number }[];
}

/**
 * A 2D context stub. Text width is `length × fontSize × 0.5`, which is wrong
 * for any real font and exactly right for testing a wrapper: what matters is
 * that the wrapper asks, not what the answer is.
 */
function fakeContext(): FakeCtx {
  const drawn: { text: string; x: number; y: number }[] = [];
  const noop = (): void => {};
  const state = {
    font: '16px sans-serif',
    textAlign: 'left',
    textBaseline: 'top',
    fillStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000',
    measureText(text: string): TextMetrics {
      const match = /^(\d+(?:\.\d+)?)px/.exec(state.font);
      const size = match ? Number(match[1]) : 16;
      return { width: text.length * size * 0.5 } as TextMetrics;
    },
    fillText(text: string, x: number, y: number): void {
      drawn.push({ text, x, y });
    },
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    rect: noop,
    arc: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
  };
  return { ctx: state as unknown as CanvasRenderingContext2D, drawn };
}

describe('measureNote — sticky-note text (§15)', () => {
  const box: Rect = { x: 0, y: 0, w: 300, h: 190 };

  it('wraps on whitespace rather than overflowing the card', () => {
    const { ctx } = fakeContext();
    const layout = measureNote(ctx, 'Grab the rope and swing across the gap', box);
    expect(layout.lines.length).toBeGreaterThan(1);
    for (const line of layout.lines) {
      expect(ctx.measureText(line).width).toBeLessThanOrEqual(box.w - 28);
    }
  });

  it('breaks a token that is wider than the card — German compounds have no spaces', () => {
    const { ctx } = fakeContext();
    const layout = measureNote(ctx, 'Geschwindigkeitsbegrenzungsschild', box);
    expect(layout.lines.length).toBeGreaterThan(1);
    for (const line of layout.lines) {
      expect(ctx.measureText(line).width).toBeLessThanOrEqual(box.w - 28);
    }
  });

  it('shrinks once when the wrapped text is too tall, and says so when it still is', () => {
    const { ctx } = fakeContext();
    const short = measureNote(ctx, 'Swing across', box);
    expect(short.fontSize).toBe(22);
    expect(short.overflow).toBe(false);

    const long = measureNote(ctx, 'Swing across the gap. '.repeat(24), box);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.overflow).toBe(true);
  });

  it('lets a 40%-longer translation cost lines, never width', () => {
    const { ctx } = fakeContext();
    const en = measureNote(ctx, 'Hold on and let go at the top', box);
    const de = measureNote(ctx, 'Festhalten und ganz oben wieder loslassen bitte', box);
    expect(de.lines.length).toBeGreaterThanOrEqual(en.lines.length);
    for (const line of de.lines) {
      expect(ctx.measureText(line).width).toBeLessThanOrEqual(box.w - 28);
    }
  });

  it('never returns an empty layout for empty text', () => {
    const { ctx } = fakeContext();
    expect(measureNote(ctx, '', box).lines).toEqual(['']);
  });
});

// ─── The degradation ladder ─────────────────────────────────────────────────

function run(ladder: QualityLadder, frames: number, frameMs: number, startMs = 0): number {
  let t = startMs;
  for (let i = 0; i < frames; i++) {
    t += frameMs;
    ladder.push(frameMs, t);
  }
  return t;
}

describe('QualityLadder', () => {
  it('does not degrade on a good run', () => {
    const ladder = new QualityLadder();
    run(ladder, 600, 10);
    expect(ladder.step).toBe(0);
  });

  it('ignores a single catastrophic frame', () => {
    const ladder = new QualityLadder();
    let t = run(ladder, 119, 10);
    t += 400;
    ladder.push(400, t);
    run(ladder, 300, 10, t);
    expect(ladder.step).toBe(0);
  });

  it('degrades one rung at a time when the median stays over budget', () => {
    const ladder = new QualityLadder();
    run(ladder, 140, 25);
    expect(ladder.step).toBe(1);
    run(ladder, 140, 25, 3500);
    expect(ladder.step).toBe(2);
  });

  it('walks all the way down but never past the last rung', () => {
    const ladder = new QualityLadder();
    run(ladder, 2000, 30);
    expect(ladder.step).toBe(4);
  });

  it('recovers only after a sustained good spell, not immediately', () => {
    const ladder = new QualityLadder(2);
    // Enough good frames to fill the window and compute a median, but nothing
    // like the ten seconds the ladder waits for.
    run(ladder, 140, 10);
    expect(ladder.step).toBe(2);
    run(ladder, 1200, 10, 1400);
    expect(ladder.step).toBe(1);
  });

  it('reports the median it is deciding on', () => {
    const ladder = new QualityLadder();
    run(ladder, 140, 12);
    expect(ladder.medianFrameMs).toBeCloseTo(12, 6);
  });

  it('treats a backgrounded tab as one slow frame, not a disaster', () => {
    const ladder = new QualityLadder();
    let t = 0;
    for (let i = 0; i < 130; i++) {
      t += 10;
      ladder.push(i === 60 ? 30_000 : 10, t);
    }
    expect(ladder.step).toBe(0);
  });
});

describe('the fit and the transform agree', () => {
  it('covers the stage exactly with the visible world rect at zoom 1', () => {
    for (const view of VIEWPORTS) {
      const fit: StageFit = fitStage(view.w, view.h);
      const camera = { x: 1234, y: 567, zoom: 1 };
      visibleWorldRect(fit, camera, RECT);
      const t = worldTransform(fit, camera, 1, SCRATCH);
      const [left, top] = mapPoint(t, RECT.x, RECT.y);
      const [right, bottom] = mapPoint(t, RECT.x + RECT.w, RECT.y + RECT.h);
      expect(left).toBeCloseTo(fit.offsetX, 6);
      expect(top).toBeCloseTo(fit.offsetY, 6);
      expect(right).toBeCloseTo(fit.offsetX + fit.width, 6);
      expect(bottom).toBeCloseTo(fit.offsetY + fit.height, 6);
    }
  });
});
