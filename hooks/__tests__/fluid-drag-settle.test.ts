// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createFrameLoop } from '@/lib/jelly/frame';
import { createSettle } from '../fluid-drag-settle';

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
  let t = 0;
  const step = () => {
    t += 16;
    const due = [...pending];
    pending.clear();
    for (const [, cb] of due) cb(t);
  };
  return { win, step, pending };
}

function setup() {
  const f = fakeWindow();
  const loop = createFrameLoop(f.win);
  const make = () => createSettle({ drive: (fn, o) => loop.drive(fn, o) });
  return { ...f, loop, make };
}

describe('createSettle', () => {
  it('settles to the target and stops requesting frames', () => {
    const { make, step, pending } = setup();
    const settle = make();
    const onStep = vi.fn();
    const onDone = vi.fn();
    settle.start(100, 0, 0, onStep, onDone);
    for (let i = 0; i < 600 && pending.size > 0; i++) step();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(0, 0);
    expect(pending.size).toBe(0);
  });

  it('dispose mid-settle stops the driver', () => {
    const { make, step, pending, loop } = setup();
    const settle = make();
    const onStep = vi.fn();
    const onDone = vi.fn();
    settle.start(100, 0, 0, onStep, onDone);
    step();
    const calls = onStep.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    settle.dispose();
    step();
    expect(onStep.mock.calls.length).toBe(calls);
    expect(onDone).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
    expect(loop.size).toBe(0);
  });

  it('two settles run independently', () => {
    const { make, step, pending } = setup();
    const a = make();
    const b = make();
    const aStep = vi.fn();
    const bStep = vi.fn();
    const bDone = vi.fn();
    a.start(100, 0, 0, aStep, vi.fn());
    b.start(100, 0, 0, bStep, bDone);
    step();
    a.cancel();
    const aCalls = aStep.mock.calls.length;
    for (let i = 0; i < 600 && pending.size > 0; i++) step();
    expect(aStep.mock.calls.length).toBe(aCalls);
    expect(bDone).toHaveBeenCalledTimes(1);
  });
});
