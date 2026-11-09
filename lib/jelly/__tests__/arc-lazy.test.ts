/**
 * The lazily installed click arc (CSS-first jelly §4, "Arcs are events"): at rest there is nothing, not a module, a
 * listener-owned timer, an observer or a canvas. The first press imports the arcs chunk and installs the runtime
 * with ambient arcs off; that press still fires its bolt; ten seconds after the last click the runtime is gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJellyBus } from '../bus';
import { createFlashLedger } from '../arcs/ledger';
import {
  fakeButtons,
  fakeEnv,
  fakeRegistry,
  type FakeEl,
  type FakeEnv,
} from '../arcs/__tests__/arc-dom';
import { FLASH_LEDGER, OPT_OUT_SCOPE_SELECTOR } from '../tiers';

/**
 * `chunk` counts evaluations of the arcs chunk (the factory runs on the first import of the file only, so the one test
 * that asserts it is still 0 comes first); `installs` counts runtimes installed, which every test can assert.
 */
const loads = vi.hoisted(() => ({ chunk: 0, installs: 0 }));
vi.mock('../arcs', async (importOriginal) => {
  loads.chunk++;
  const real = await importOriginal<typeof import('../arcs')>();
  return {
    ...real,
    installElectricArcs: (...args: Parameters<typeof real.installElectricArcs>) => {
      loads.installs++;
      return real.installElectricArcs(...args);
    },
  };
});

type LazyModule = typeof import('../arc-lazy');

describe('lazy click arcs', () => {
  let env: FakeEnv;
  let els: FakeEl[];
  let lazy: LazyModule;
  let ledger: ReturnType<typeof createFlashLedger>;
  let bus: ReturnType<typeof createJellyBus>;
  let off: (() => void) | null = null;

  const press = (target: unknown = els[1], over: object = {}) =>
    env.docListeners.dispatch('pointerdown', {
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      target,
      clientX: 230,
      clientY: 116,
      ...over,
    });
  const install = () => {
    off = lazy.installLazyClickArcs(env.doc, {
      registry: fakeRegistry(els),
      seed: 1,
      ledger,
      bus,
    });
    return off;
  };
  /**
   * The installed runtime. Read through the same (mocked) module the installer imports; calling it evaluates that
   * module, so tests that assert nothing was imported check `loads` and the DOM instead.
   */
  const active = async () => (await import('../arcs')).activeElectricArcs();
  /** Wait for the dynamic import and the install that follows the first press. */
  const installed = () =>
    vi.waitFor(async () => expect(await active()).not.toBeNull(), { timeout: 5000 });

  beforeEach(async () => {
    vi.useFakeTimers();
    loads.installs = 0;
    lazy = await import('../arc-lazy');
    env = fakeEnv();
    els = fakeButtons();
    env.state.hit = els[0];
    ledger = createFlashLedger();
    bus = createJellyBus();
  });
  afterEach(() => {
    off?.();
    off = null;
    vi.useRealTimers();
  });

  it('installs nothing before the first pointerdown: no import, canvas, observer, timer or frame', () => {
    install();
    // Valid only because this test runs first in the file: the chunk has never been evaluated.
    expect(loads.chunk).toBe(0);
    expect(loads.installs).toBe(0);
    expect(env.canvas()).toBeUndefined();
    expect(env.observers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(env.rafCalls).toBe(0);
    // One subscription on the shared pointer hub, and nothing else on the window or the document.
    expect(env.winListeners.count('pointerdown')).toBe(1);
    expect(env.docListeners.count('click')).toBe(0);
  });

  it('the first press imports the chunk, installs click-only arcs and still fires its own bolt', async () => {
    install();
    press();
    await installed();
    expect(loads.installs).toBe(1);
    const rt = (await active())!;
    expect(rt.active).toBe(true);
    expect(rt.ambient).toBe(false);
    expect(env.canvas()).toBeDefined();
    // The press that woke it was replayed: a layer exists AND a frame is queued for the bolt.
    await vi.waitFor(() => expect(env.rafQueue.size).toBeGreaterThan(0), { timeout: 5000 });
    // No ambient timer was armed (only the idle teardown, and click hops).
    expect(rt.ambientArmed).toBe(false);
  });

  it('a second click inside ten seconds reuses the runtime; the runtime fires that press itself', async () => {
    install();
    press();
    await installed();
    const first = await active();
    await vi.advanceTimersByTimeAsync(4000);
    const pulses: Element[] = [];
    bus.on('charge:pulse', (p) => pulses.push(p.el));
    press(els[2], { clientX: 320 });
    expect(await active()).toBe(first);
    expect(loads.installs).toBe(1);
    // Exactly one handler fired that press (the runtime's), not the runtime's and the installer's: one charge deposit.
    expect(pulses).toEqual([els[2] as unknown as Element]);
    // The idle window restarted at that click: 9 s later it is still there, 10 s later it is gone.
    await vi.advanceTimersByTimeAsync(9_999);
    expect(await active()).toBe(first);
    await vi.advanceTimersByTimeAsync(1);
    expect(await active()).toBeNull();
  });

  it('ten seconds after the last click the runtime is disposed: canvas, observers, timers and listeners gone', async () => {
    install();
    press();
    await installed();
    await vi.waitFor(() => expect(env.rafQueue.size).toBeGreaterThan(0), { timeout: 5000 });
    // A click re-arms the idle timer from a known instant.
    press();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await active()).toBeNull();
    expect(env.canvas()).toBeUndefined();
    expect(env.observers.every((o) => !o.on)).toBe(true);
    expect(env.docListeners.count('click')).toBe(0);
    expect(env.winListeners.count('pointerdown')).toBe(1); // only the installer's own subscription
    expect(vi.getTimerCount()).toBe(0);
    expect(env.rafQueue.size).toBe(0);
    // The next press installs it afresh.
    press();
    await installed();
    expect((await active())!.active).toBe(true);
  });

  it('the disposer removes the subscription, the idle timer and the runtime', async () => {
    const dispose = install();
    press();
    await installed();
    dispose();
    off = null;
    expect(await active()).toBeNull();
    expect(env.canvas()).toBeUndefined();
    expect(env.winListeners.count('pointerdown')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a press that lands after the disposer ran installs nothing', async () => {
    const dispose = install();
    press();
    dispose(); // the import is still in flight
    off = null;
    await import('../arcs'); // the in-flight import has now resolved
    await vi.advanceTimersByTimeAsync(50);
    expect(await active()).toBeNull();
    expect(env.canvas()).toBeUndefined();
  });

  it('the flash ledger still refuses a fourth onset inside one second', async () => {
    install();
    const onsets: number[] = [];
    const orig = ledger.tryOnset;
    ledger.tryOnset = (t: number) => {
      const ok = orig(t);
      if (ok) onsets.push(t);
      return ok;
    };
    press();
    await installed();
    for (let i = 0; i < 100; i++) {
      press();
      await vi.advanceTimersByTimeAsync(50);
      env.frame();
    }
    expect(onsets.length).toBeGreaterThan(5);
    for (const start of onsets) {
      expect(
        onsets.filter((t) => t >= start && t < start + FLASH_LEDGER.windowMs).length,
      ).toBeLessThanOrEqual(FLASH_LEDGER.maxOnsets);
    }
  });

  describe('gated at press time, before anything is imported', () => {
    const playfield = { closest: (s: string) => (s === OPT_OUT_SCOPE_SELECTOR ? {} : null) };
    const cases: Array<[string, () => void, (() => unknown) | undefined]> = [
      ['electricArcs = off', () => env.root.setAttribute('data-electric-arcs', 'off'), undefined],
      ['a game in play', () => env.root.setAttribute('data-game-state', 'playing'), undefined],
      ['jellyMotion = still', () => env.root.setAttribute('data-jelly-motion', 'still'), undefined],
      ['a native-material route', () => env.root.classes.add('native-material'), undefined],
      ['a hidden tab', () => (env.state.hidden = true), undefined],
      ['the radial hub open', () => (env.state.hub = true), undefined],
    ];
    it.each(cases)('%s: no runtime is installed, no canvas', async (_label, setup) => {
      setup();
      install();
      press();
      await vi.advanceTimersByTimeAsync(100);
      expect(loads.installs).toBe(0);
      expect(env.canvas()).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a press over a play-field arcs nothing', async () => {
      install();
      press(playfield);
      await vi.advanceTimersByTimeAsync(100);
      expect(loads.installs).toBe(0);
      expect(env.canvas()).toBeUndefined();
    });

    it('a secondary button, a non-primary pointer: no runtime', async () => {
      install();
      press(els[1], { button: 2 });
      press(els[1], { isPrimary: false });
      await vi.advanceTimersByTimeAsync(100);
      expect(loads.installs).toBe(0);
    });

    it('turning arcs off while installed tears the runtime down at once', async () => {
      install();
      press();
      await installed();
      env.root.setAttribute('data-electric-arcs', 'off');
      env.mutate();
      await vi.advanceTimersByTimeAsync(0);
      expect(await active()).toBeNull();
      expect(env.canvas()).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('ensureClickArcs (the /jelly lab)', () => {
    it('installs the runtime on demand so strike() works, and it is torn down after ten idle seconds', async () => {
      install();
      expect(await active()).toBeNull();
      await lazy.ensureClickArcs(env.doc);
      const rt = (await active())!;
      expect(rt.active).toBe(true);
      expect(rt.ambient).toBe(false);
      const arcs = await import('../arcs');
      expect(
        arcs.strike(els[0] as unknown as Element, els[1] as unknown as Element, { kind: 'click' }),
      ).toBe(true);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await active()).toBeNull();
    });

    it('does nothing while arcs are off', async () => {
      env.root.setAttribute('data-electric-arcs', 'off');
      install();
      await lazy.ensureClickArcs(env.doc);
      expect(loads.installs).toBe(0);
      expect(env.canvas()).toBeUndefined();
    });
  });
});
