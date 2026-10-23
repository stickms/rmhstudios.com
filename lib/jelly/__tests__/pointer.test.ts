/**
 * The jelly pointer hub (`lib/jelly/pointer.ts`) is the ONE window pointer listener set behind the soft body, the
 * arcs' click discharge, the engine's cursor light and the fallback light (docs/plasmatic-jelly-system.md §8.1).
 * What it must prove:
 *  - however many subscribers, the target gets exactly one capture+passive listener per pointer type;
 *  - delivery fans out by type to every subscriber;
 *  - removal is refcounted: listeners leave with the last subscriber, and a double unsubscribe is harmless;
 *  - a throwing handler is isolated (reported asynchronously) and the rest still run.
 */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { onJellyPointer } from '../pointer';

const TYPES = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'pointerover',
  'pointerout',
];

function fakeTarget() {
  const listeners = new Map<string, Set<EventListener>>();
  const add = vi.fn((type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    expect(opts).toMatchObject({ capture: true, passive: true });
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  });
  const remove = vi.fn((type: string, fn: EventListener) => {
    listeners.get(type)?.delete(fn);
  });
  const target = { addEventListener: add, removeEventListener: remove } as unknown as EventTarget;
  const fire = (type: string, extra: Record<string, unknown> = {}) => {
    const e = { type, ...extra } as unknown as Event;
    for (const fn of [...(listeners.get(type) ?? [])]) fn(e);
  };
  const count = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { target, add, remove, fire, count };
}

describe('jelly pointer hub', () => {
  it('installs ONE listener per pointer type, however many subscribers', () => {
    const t = fakeTarget();
    const offs = [
      onJellyPointer('pointerdown', () => {}, t.target),
      onJellyPointer('pointerdown', () => {}, t.target),
      onJellyPointer('pointermove', () => {}, t.target),
      onJellyPointer('pointerup', () => {}, t.target),
    ];
    expect(t.add).toHaveBeenCalledTimes(TYPES.length);
    expect(new Set(t.add.mock.calls.map((c) => c[0]))).toEqual(new Set(TYPES));
    expect(t.count()).toBe(TYPES.length);
    offs.forEach((off) => off());
  });

  it('fans each event out to its own type only', () => {
    const t = fakeTarget();
    const down1 = vi.fn();
    const down2 = vi.fn();
    const move = vi.fn();
    const offs = [
      onJellyPointer('pointerdown', down1, t.target),
      onJellyPointer('pointerdown', down2, t.target),
      onJellyPointer('pointermove', move, t.target),
    ];
    t.fire('pointerdown', { clientX: 3 });
    expect(down1).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pointerdown', clientX: 3 }),
    );
    expect(down2).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
    t.fire('pointercancel');
    expect(down1).toHaveBeenCalledTimes(1);
    offs.forEach((off) => off());
  });

  it('removes the listeners only with the last subscriber (refcounted)', () => {
    const t = fakeTarget();
    const a = vi.fn();
    const b = vi.fn();
    const offA = onJellyPointer('pointermove', a, t.target);
    const offB = onJellyPointer('pointerdown', b, t.target);
    offA();
    expect(t.remove).not.toHaveBeenCalled();
    t.fire('pointermove');
    expect(a).not.toHaveBeenCalled();
    offA(); // double unsubscribe is a no-op and must not drop b's refcount
    expect(t.remove).not.toHaveBeenCalled();
    t.fire('pointerdown');
    expect(b).toHaveBeenCalledTimes(1);
    offB();
    expect(t.remove).toHaveBeenCalledTimes(TYPES.length);
    expect(t.count()).toBe(0);

    // A fresh subscriber re-installs exactly one set.
    const offC = onJellyPointer('pointerup', () => {}, t.target);
    expect(t.add).toHaveBeenCalledTimes(TYPES.length * 2);
    offC();
    expect(t.count()).toBe(0);
  });

  it('subscribing the same handler twice counts once', () => {
    const t = fakeTarget();
    const fn = vi.fn();
    const off1 = onJellyPointer('pointerdown', fn, t.target);
    const off2 = onJellyPointer('pointerdown', fn, t.target);
    t.fire('pointerdown');
    expect(fn).toHaveBeenCalledTimes(1);
    off2();
    off1();
    expect(t.count()).toBe(0);
  });

  it('isolates a throwing handler: the rest still run and the error is reported asynchronously', () => {
    const t = fakeTarget();
    const errors: unknown[] = [];
    const qm = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      try {
        cb();
      } catch (e) {
        errors.push(e);
      }
    });
    const after = vi.fn();
    const off1 = onJellyPointer(
      'pointerdown',
      () => {
        throw new Error('boom');
      },
      t.target,
    );
    const off2 = onJellyPointer('pointerdown', after, t.target);
    expect(() => t.fire('pointerdown')).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    off1();
    off2();
    qm.mockRestore();
  });

  it('a handler unsubscribing mid-dispatch does not skip the others', () => {
    const t = fakeTarget();
    const later = vi.fn();
    let offSelf = () => {};
    offSelf = onJellyPointer('pointerdown', () => offSelf(), t.target);
    const offLater = onJellyPointer('pointerdown', later, t.target);
    t.fire('pointerdown');
    expect(later).toHaveBeenCalledTimes(1);
    offLater();
    expect(t.count()).toBe(0);
  });

  it('is a no-op without a target (SSR)', () => {
    const off = onJellyPointer('pointerdown', () => {}, undefined);
    expect(() => off()).not.toThrow();
  });
});
