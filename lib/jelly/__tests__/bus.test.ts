/**
 * The jelly bus is how arcs, physics, the engine and the carriers talk without importing each other. What matters:
 * delivery is synchronous (a strike's impulse lands in the bolt's frame), unsubscribing works mid-emit, and one
 * throwing consumer never silences the rest.
 */
import { describe, expect, it, vi } from 'vitest';
import { createJellyBus, jellyBus } from '../bus';

const el = {} as Element;

describe('jelly bus', () => {
  it('delivers synchronously, in subscription order, with the payload as given', () => {
    const bus = createJellyBus();
    const seen: string[] = [];
    bus.on('drag:start', (p) => seen.push(`a:${p.el === el}`));
    bus.on('drag:start', () => seen.push('b'));
    bus.emit('drag:start', { el });
    expect(seen).toEqual(['a:true', 'b']);
  });

  it('keeps event types apart', () => {
    const bus = createJellyBus();
    const fn = vi.fn();
    bus.on('drag:end', fn);
    bus.emit('drag:start', { el });
    expect(fn).not.toHaveBeenCalled();
    const strike = { el, x: 1, y: 2, nx: 0, ny: 1, energy: 0.5, kind: 'click' as const };
    bus.on('arc:strike', fn);
    bus.emit('arc:strike', strike);
    expect(fn).toHaveBeenCalledWith(strike);
  });

  it('unsubscribes, and a mid-emit unsubscribe affects only the next emit', () => {
    const bus = createJellyBus();
    const later = vi.fn();
    let off = () => {};
    bus.on('haze:change', () => off());
    off = bus.on('haze:change', later);
    bus.emit('haze:change', { el, on: true });
    expect(later).toHaveBeenCalledTimes(1);
    bus.emit('haze:change', { el, on: false });
    expect(later).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('haze:change')).toBe(1);
  });

  it('counts a function subscribed twice once', () => {
    const bus = createJellyBus();
    const fn = vi.fn();
    bus.on('body:release', fn);
    bus.on('body:release', fn);
    expect(bus.listenerCount('body:release')).toBe(1);
    bus.emit('body:release', { el, x: 0, y: 0, energy: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reports a throwing listener asynchronously and still calls the rest', async () => {
    const bus = createJellyBus();
    const after = vi.fn();
    const boom = new Error('boom');
    const queued: (() => void)[] = [];
    const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      queued.push(cb);
    });
    try {
      bus.on('drag:end', () => {
        throw boom;
      });
      bus.on('drag:end', after);
      expect(() => bus.emit('drag:end', { el })).not.toThrow();
      expect(after).toHaveBeenCalled();
      expect(queued).toHaveLength(1);
      expect(() => queued[0]!()).toThrow(boom);
    } finally {
      spy.mockRestore();
    }
  });

  it('exports one site-wide bus', () => {
    expect(typeof jellyBus.on).toBe('function');
    expect(typeof jellyBus.emit).toBe('function');
  });
});
