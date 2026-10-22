// @vitest-environment node
/**
 * The quiet gate (`quiet.ts`): the effect's main-thread work waits until the visitor is not scrolling, typing or
 * holding a pointer (a drag on the hub's globe fires no new press), then runs in an idle slot.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whenQuiet } from './quiet';

let target: EventTarget;
const fire = (type: string) => target.dispatchEvent(new Event(type));

beforeEach(() => {
  vi.useFakeTimers();
  target = new EventTarget();
});
afterEach(() => vi.useRealTimers());

describe('whenQuiet', () => {
  it('runs once after the quiet window, with no idle callback', () => {
    const fn = vi.fn();
    whenQuiet(fn, { quietMs: 200, target, requestIdle: null });
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    fire('scroll');
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('every scroll, wheel, touch or key restarts the window', () => {
    const fn = vi.fn();
    whenQuiet(fn, { quietMs: 200, target, requestIdle: null });
    for (const type of ['scroll', 'wheel', 'touchstart', 'keydown']) {
      vi.advanceTimersByTime(150);
      fire(type);
    }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a held pointer (a drag) holds it for as long as it is down', () => {
    const fn = vi.fn();
    whenQuiet(fn, { quietMs: 200, target, requestIdle: null });
    fire('pointerdown');
    vi.advanceTimersByTime(10_000);
    expect(fn).not.toHaveBeenCalled();
    fire('pointerup');
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a cancelled pointer counts as lifted', () => {
    const fn = vi.fn();
    whenQuiet(fn, { quietMs: 100, target, requestIdle: null });
    fire('pointerdown');
    fire('pointercancel');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('defers while busy(), and goes through the idle callback when there is one', () => {
    const fn = vi.fn();
    let busy = true;
    const idle: (() => void)[] = [];
    whenQuiet(fn, {
      quietMs: 100,
      target,
      busy: () => busy,
      requestIdle: (cb) => idle.push(cb),
      cancelIdle: () => {},
    });
    vi.advanceTimersByTime(500);
    expect(idle).toHaveLength(0);
    busy = false;
    vi.advanceTimersByTime(100);
    expect(idle).toHaveLength(1);
    expect(fn).not.toHaveBeenCalled();
    idle[0]!();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel stops it for good and removes its listeners', () => {
    const fn = vi.fn();
    const remove = vi.spyOn(target, 'removeEventListener');
    const cancel = whenQuiet(fn, { quietMs: 100, target, requestIdle: null });
    cancel();
    vi.advanceTimersByTime(1000);
    fire('pointerup');
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(7);
  });
});
