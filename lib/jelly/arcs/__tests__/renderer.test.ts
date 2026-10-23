/**
 * The arc overlay's cost contract (03-arcs.md §4.3, §7.1–7.2): no rAF with no arcs, a bounded burst of frames per arc
 * and then idle, teardown cancels and removes, composite mode follows the theme's background, and no blur/shadow is
 * ever assigned.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFlashLedger } from '../ledger';
import {
  admitArc,
  boltArc,
  clampRed,
  createArcRenderer,
  flareArc,
  paletteFrom,
  srgbToOklch,
  type LiveArc,
} from '../renderer';
import { fakeEnv, type FakeEnv } from './arc-dom';

const A = { x: 100, y: 100, nx: 1, ny: 0 };
const B = { x: 180, y: 104, nx: -1, ny: 0 };

function runFrames(env: FakeEnv, stepMs = 16, max = 200): number {
  let frames = 0;
  while (env.rafQueue.size > 0 && frames < max) {
    vi.advanceTimersByTime(stepMs);
    frames += env.frame();
  }
  return frames;
}

describe('arc renderer', () => {
  let env: FakeEnv;
  beforeEach(() => {
    vi.useFakeTimers();
    env = fakeEnv();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends one aria-hidden, glass-excluded layer and requests no frame with no arcs', () => {
    const r = createArcRenderer(env.doc);
    const canvas = env.canvas();
    expect(canvas).toBeDefined();
    expect(canvas!.getAttribute('aria-hidden')).toBe('true');
    expect(canvas!.getAttribute('data-liquid-glass')).toBe('off');
    expect(canvas!.getAttribute('data-jelly-arcs')).toBe('off');
    vi.advanceTimersByTime(10_000);
    r.fade();
    expect(env.rafCalls).toBe(0);
    // No backing store until an arc needs one.
    expect(canvas!.width).toBe(0);
    r.dispose();
  });

  it('one arc produces a bounded burst of frames and then stops', () => {
    const ledger = createFlashLedger();
    const onStrike = vi.fn();
    const r = createArcRenderer(env.doc, { ledger, onStrike });
    const arc = boltArc({ kind: 'click', emitKind: 'click', a: A, b: B, seed: 7, start: r.now() });
    expect(admitArc(arc, ledger)).toBe(true);
    r.add(arc);
    expect(env.rafCalls).toBe(1);
    const frames = runFrames(env);
    // Life ≤ 250 + 160ms at 16ms per frame, plus the final clearing frame.
    expect(frames).toBeGreaterThan(5);
    expect(frames).toBeLessThanOrEqual(Math.ceil(410 / 16) + 2);
    expect(env.rafQueue.size).toBe(0);
    expect(r.live()).toBe(0);
    expect(onStrike).toHaveBeenCalledTimes(1);
    // Idle afterwards.
    const calls = env.rafCalls;
    vi.advanceTimersByTime(5_000);
    expect(env.rafCalls).toBe(calls);
    // DPR capped at 1.5 on a fine pointer (devicePixelRatio is 2).
    expect(env.canvas()!.width).toBe(1200 * 1.5);
    r.dispose();
  });

  it('clears dirty rects, not the whole canvas, while arcs live', () => {
    const r = createArcRenderer(env.doc);
    r.add(flareArc(50, 50, r.now()));
    vi.advanceTimersByTime(16);
    env.frame();
    const ctxCalls = env.canvas()!.ctx.calls;
    expect(ctxCalls).toContain('clearRect');
    r.dispose();
  });

  it('teardown cancels the frame and removes the canvas', () => {
    const r = createArcRenderer(env.doc);
    r.add(boltArc({ kind: 'ambient', emitKind: 'ambient', a: A, b: B, seed: 3, start: r.now() }));
    expect(env.rafQueue.size).toBe(1);
    r.dispose();
    expect(env.rafQueue.size).toBe(0);
    expect(env.canvas()).toBeUndefined();
  });

  it('clear() (hidden tab / global off) kills live arcs and the frame', () => {
    const r = createArcRenderer(env.doc);
    r.add(boltArc({ kind: 'ambient', emitKind: 'ambient', a: A, b: B, seed: 3, start: r.now() }));
    r.clear();
    expect(r.live()).toBe(0);
    expect(env.rafQueue.size).toBe(0);
    r.dispose();
  });

  it('a light background selects source-over, a dark one lighter (re-read on theme change only)', () => {
    const r = createArcRenderer(env.doc);
    expect(r.palette().composite).toBe('source-over');
    env.state.dark = true;
    // Not re-read until <html> attributes change.
    expect(r.palette().composite).toBe('source-over');
    env.mutate();
    expect(r.palette().composite).toBe('lighter');
    expect(r.palette().dark).toBe(true);
    r.dispose();
  });

  it('a refused re-strike goes straight to afterglow instead of flashing again', () => {
    const ledger = createFlashLedger({ maxOnsets: 1 });
    const r = createArcRenderer(env.doc, { ledger });
    // Find a multi-strike click arc.
    let arc: LiveArc | null = null;
    for (let seed = 1; seed < 200 && !arc; seed++) {
      const a = boltArc({ kind: 'click', emitKind: 'click', a: A, b: B, seed, start: r.now() });
      if (a.timeline.strikes.length >= 2) arc = a;
    }
    expect(arc).not.toBeNull();
    expect(admitArc(arc!, ledger)).toBe(true);
    r.add(arc!);
    runFrames(env, 8);
    expect(arc!.timeline.strikes.length).toBe(1);
    r.dispose();
  });

  it('lifts the layer to the modal tier only while a modal arc lives', () => {
    const r = createArcRenderer(env.doc);
    r.add(flareArc(10, 10, r.now(), true));
    expect(env.canvas()!.getAttribute('data-layer')).toBe('modal');
    runFrames(env);
    expect(env.canvas()!.getAttribute('data-layer')).toBeNull();
    r.dispose();
  });

  it('never assigns shadowBlur or a canvas filter (the arc cost model)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/jelly/arcs/renderer.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(src).not.toMatch(/shadowBlur/);
    expect(src).not.toMatch(/\.filter\s*=/);
  });
});

describe('arc colour', () => {
  it('rotates a saturated red core to violet and leaves violet alone', () => {
    const red = clampRed([0.9, 0.1, 0.1]);
    const [, , h] = srgbToOklch(red);
    expect(h).toBeGreaterThan(250);
    expect(h).toBeLessThan(330);
    const violet: [number, number, number] = [0.36, 0.25, 0.84];
    expect(clampRed(violet)).toEqual(violet);
  });

  it('chooses the composite from the background luminance', () => {
    expect(paletteFrom([1, 1, 1, 1], [1, 1, 1, 0.5], [0.05, 0.05, 0.07, 1]).composite).toBe(
      'lighter',
    );
    expect(paletteFrom([0, 0, 0, 1], [0, 0, 0, 0.5], [0.97, 0.97, 0.96, 1]).composite).toBe(
      'source-over',
    );
  });
});
