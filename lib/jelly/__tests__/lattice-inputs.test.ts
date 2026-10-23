/**
 * The physics → engine hand-off for Tier L lattices: per-host drives and queued impulses, keyed weakly, with a wake
 * callback so a sleeping engine frame restarts. No DOM reads — plain objects stand in for elements.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  drainLatticeImpulses,
  latticeDrive,
  latticeImpulse,
  onLatticeWake,
  resetLatticeInputsForTests,
  setLatticeDrive,
} from '../lattice-inputs';

const el = () => ({}) as Element;

afterEach(() => resetLatticeInputsForTests());

describe('lattice drives', () => {
  it('stores, replaces and clears the drive per host', () => {
    const a = el();
    const b = el();
    expect(latticeDrive(a)).toBeNull();
    setLatticeDrive(a, { kind: 'press', x: 4, y: 5 });
    setLatticeDrive(b, { kind: 'hover', x: 1, y: 2, strength: 0.5 });
    expect(latticeDrive(a)).toEqual({ kind: 'press', x: 4, y: 5 });
    expect(latticeDrive(b)).toEqual({ kind: 'hover', x: 1, y: 2, strength: 0.5 });
    setLatticeDrive(a, { kind: 'drag', ax: 10, ay: -3 });
    expect(latticeDrive(a)).toEqual({ kind: 'drag', ax: 10, ay: -3 });
    setLatticeDrive(a, null);
    expect(latticeDrive(a)).toBeNull();
    expect(latticeDrive(b)).not.toBeNull();
  });

  it('wakes the engine when a drive changes, and only then', () => {
    const a = el();
    const wake = vi.fn();
    const off = onLatticeWake(wake);
    setLatticeDrive(a, { kind: 'press', x: 1, y: 1 });
    setLatticeDrive(a, { kind: 'press', x: 1, y: 1 });
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenLastCalledWith(a);
    setLatticeDrive(a, { kind: 'press', x: 2, y: 1 });
    setLatticeDrive(a, null);
    setLatticeDrive(a, null);
    expect(wake).toHaveBeenCalledTimes(3);
    off();
    setLatticeDrive(a, { kind: 'hover', x: 0, y: 0 });
    expect(wake).toHaveBeenCalledTimes(3);
  });
});

describe('lattice impulses', () => {
  it('queues impulses until drained, then empties', () => {
    const a = el();
    latticeImpulse(a, 1, 0, 1.5);
    latticeImpulse(a, 0, -1, 0.5);
    expect(drainLatticeImpulses(a)).toEqual([
      { dx: 1, dy: 0, peak: 1.5 },
      { dx: 0, dy: -1, peak: 0.5 },
    ]);
    expect(drainLatticeImpulses(a)).toEqual([]);
  });

  it('ignores degenerate impulses and bounds the queue', () => {
    const a = el();
    const wake = vi.fn();
    onLatticeWake(wake);
    latticeImpulse(a, 0, 0, 1);
    latticeImpulse(a, 1, 0, 0);
    latticeImpulse(a, Number.NaN, 0, 1);
    expect(wake).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) latticeImpulse(a, 1, 0, i + 1);
    const drained = drainLatticeImpulses(a);
    expect(drained.length).toBeLessThanOrEqual(4);
    expect(drained.at(-1)?.peak).toBe(10);
    expect(wake).toHaveBeenCalledTimes(10);
  });

  it('a throwing wake listener does not stop the others', async () => {
    const a = el();
    const errors: unknown[] = [];
    const ok = vi.fn();
    onLatticeWake(() => {
      throw new Error('boom');
    });
    onLatticeWake(ok);
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (fn) => {
      try {
        fn();
      } catch (e) {
        errors.push(e);
      }
    };
    try {
      latticeImpulse(a, 1, 1, 1);
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(ok).toHaveBeenCalledWith(a);
    expect(errors).toHaveLength(1);
  });
});
