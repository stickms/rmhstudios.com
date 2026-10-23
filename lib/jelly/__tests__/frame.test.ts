/**
 * The jelly frame driver (`lib/jelly/frame.ts`) is the ONE `requestAnimationFrame` behind the engine, the soft body,
 * the arcs and the fallback light (docs/plasmatic-jelly-system.md §8.1). What it must prove:
 *  - many awake drivers share one requested frame, never one each;
 *  - drivers run in `order` (producer before consumer), ties in registration order;
 *  - a page with no awake driver requests no frame at all (the settle proof `raf-loop-allowlist.test.ts` cites);
 *  - `stop()` unregisters and cancels a frame nobody else needs;
 *  - one throwing driver never stops the others or the loop.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameLoop, drive } from '../frame';

function fakeWindow() {
  let next = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const win = {
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
      const id = next++;
      pending.set(id, cb);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      pending.delete(id);
    }),
  };
  /** Run every frame requested so far at time `now`. */
  const step = (now: number) => {
    const due = [...pending];
    pending.clear();
    for (const [, cb] of due) cb(now);
  };
  return { win, step, pending };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('jelly frame driver', () => {
  it('requests no frame until a driver wakes', () => {
    const { win, pending } = fakeWindow();
    const loop = createFrameLoop(win);
    loop.drive(() => true);
    loop.drive(() => true);
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
    expect(loop.pending).toBe(false);
    expect(pending.size).toBe(0);
  });

  it('shares ONE requestAnimationFrame across every awake driver', () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    const a = vi.fn(() => true);
    const b = vi.fn(() => true);
    const c = vi.fn(() => true);
    const da = loop.drive(a);
    const db = loop.drive(b);
    const dc = loop.drive(c);
    da.wake();
    db.wake();
    dc.wake();
    da.wake(); // idempotent
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    step(16);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
    // All three stay awake → still exactly one frame requested for the next tick.
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('runs drivers in ascending order, ties in registration order', () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    const seen: string[] = [];
    const arcs = loop.drive(() => void seen.push('arcs'), { order: 30 });
    const engine = loop.drive(() => void seen.push('engine'), { order: 20 });
    const physics = loop.drive(() => void seen.push('physics'), { order: 10 });
    const late1 = loop.drive(() => void seen.push('late1'));
    const late2 = loop.drive(() => void seen.push('late2'));
    for (const d of [late2, arcs, late1, engine, physics]) d.wake();
    step(16);
    expect(seen).toEqual(['physics', 'engine', 'arcs', 'late1', 'late2']);
  });

  it('sleeps when idle: a driver that does not return true stops, and no frame follows', () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    let frames = 3;
    const fn = vi.fn(() => --frames > 0);
    const d = loop.drive(fn);
    d.wake();
    for (let t = 16; t < 200; t += 16) step(t);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(d.awake).toBe(false);
    expect(loop.pending).toBe(false);
    // 3 frames ran; nothing was requested after the driver slept.
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(3);
  });

  it('passes a bounded dt, and resets it after a sleep', () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    const dts: number[] = [];
    let keep = true;
    const d = loop.drive((_now, dt) => {
      dts.push(dt);
      return keep;
    });
    d.wake();
    step(1000);
    step(1016);
    step(5000); // a long stall is clamped
    keep = false;
    step(5016);
    d.wake();
    step(9000);
    expect(dts[0]).toBeCloseTo(1000 / 60);
    expect(dts[1]).toBe(16);
    expect(dts[2]).toBe(250);
    expect(dts[3]).toBe(16);
    expect(dts[4]).toBeCloseTo(1000 / 60);
  });

  it('stop() unregisters and cancels a frame no other driver needs', () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    const fn = vi.fn(() => true);
    const d = loop.drive(fn);
    d.wake();
    expect(loop.pending).toBe(true);
    d.stop();
    expect(win.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(loop.pending).toBe(false);
    expect(loop.size).toBe(0);
    step(16);
    expect(fn).not.toHaveBeenCalled();
    d.wake(); // a stopped driver cannot be woken
    expect(loop.pending).toBe(false);
  });

  it('stop() keeps the frame when another driver is still awake', () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    const other = vi.fn(() => false);
    const a = loop.drive(() => true);
    const b = loop.drive(other);
    a.wake();
    b.wake();
    a.stop();
    expect(win.cancelAnimationFrame).not.toHaveBeenCalled();
    step(16);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing driver: the others run and the loop continues', async () => {
    const { win, step } = fakeWindow();
    const loop = createFrameLoop(win);
    const errors: unknown[] = [];
    const qm = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      try {
        cb();
      } catch (e) {
        errors.push(e);
      }
    });
    const after = vi.fn(() => true);
    const bad = loop.drive(
      () => {
        throw new Error('boom');
      },
      { order: 1 },
    );
    const good = loop.drive(after, { order: 2 });
    bad.wake();
    good.wake();
    step(16);
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(bad.awake).toBe(false);
    expect(loop.pending).toBe(true);
    step(32);
    expect(after).toHaveBeenCalledTimes(2);
    qm.mockRestore();
  });

  it('drive() shares one loop per window and is inert without one (SSR)', () => {
    const { win, step } = fakeWindow();
    const w = win as unknown as Window & typeof globalThis;
    const a = vi.fn(() => false);
    const b = vi.fn(() => false);
    drive(a, {}, w).wake();
    drive(b, {}, w).wake();
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    step(16);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    const inert = drive(() => true, {}, undefined);
    expect(() => inert.wake()).not.toThrow();
    expect(inert.awake).toBe(false);
    expect(() => inert.stop()).not.toThrow();
  });
});
