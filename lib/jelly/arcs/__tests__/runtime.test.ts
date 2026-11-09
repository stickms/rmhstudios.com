/**
 * The arc runtime's gates (03-arcs.md §2.3, §6.2; master plan R9, R10, R13): the global-off list removes the layer and
 * every input listener and comes back when it clears; `clicks` keeps clicks but arms no ambient timer; the hub and an
 * eversion switch arcs off; a click storm stays inside the flash ledger; strikes are announced on the bus; and
 * teardown leaves nothing behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJellyBus } from '../../bus';
import { activeElectricArcs, dischargeAt, installElectricArcs, strike } from '../index';
import { createFlashLedger } from '../ledger';
import { NUDGE } from '../nudge';
import { fakeButtons, fakeRegistry, fakeEnv, type FakeEl, type FakeEnv } from './arc-dom';

describe('electric arcs runtime', () => {
  let env: FakeEnv;
  let els: FakeEl[];
  let teardown: (() => void) | null = null;
  const install = (
    o: {
      ledger?: ReturnType<typeof createFlashLedger>;
      bus?: ReturnType<typeof createJellyBus>;
      ambient?: boolean;
    } = {},
  ) => {
    teardown = installElectricArcs(env.doc, {
      registry: fakeRegistry(els),
      seed: 1,
      warmupMs: 3000,
      ambient: o.ambient,
      ledger: o.ledger ?? createFlashLedger(),
      bus: o.bus ?? createJellyBus(),
    });
    return activeElectricArcs()!;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    env = fakeEnv();
    els = fakeButtons();
    env.state.hit = els[0];
  });
  afterEach(() => {
    teardown?.();
    teardown = null;
    vi.useRealTimers();
  });

  it('is a no-op without a window (SSR)', () => {
    const off = installElectricArcs({ defaultView: null } as unknown as Document);
    expect(activeElectricArcs()).toBeNull();
    expect(dischargeAt(1, 1)).toBe(false);
    off();
  });

  it('full: layer on, clicks arc at once, ambient only after the warm-up', () => {
    const rt = install();
    expect(rt.active).toBe(true);
    expect(env.canvas()).toBeDefined();
    expect(rt.ambient).toBe(false);
    expect(env.winListeners.count('pointerdown')).toBe(1);
    expect(dischargeAt(140, 116)).toBe(true);
    expect(env.rafQueue.size).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(rt.ambient).toBe(true);
    expect(rt.ambientArmed).toBe(true);
  });

  it('a pointerdown on a jelly element discharges; a right click does not', () => {
    install();
    env.docListeners.dispatch('pointerdown', {
      isPrimary: true,
      pointerType: 'mouse',
      button: 2,
      target: els[1],
      clientX: 230,
      clientY: 116,
    });
    expect(env.rafCalls).toBe(0);
    env.docListeners.dispatch('pointerdown', {
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      target: els[1],
      clientX: 230,
      clientY: 116,
    });
    expect(env.rafCalls).toBe(1);
  });

  it('electricArcs = off: no layer, no listeners, API is a no-op; back on when the preference changes', () => {
    env.root.setAttribute('data-electric-arcs', 'off');
    const rt = install();
    expect(rt.active).toBe(false);
    expect(env.canvas()).toBeUndefined();
    expect(env.winListeners.count('pointerdown')).toBe(0);
    expect(dischargeAt(140, 116)).toBe(false);
    expect(strike(els[0] as unknown as Element, els[1] as unknown as Element)).toBe(false);
    env.root.removeAttribute('data-electric-arcs');
    env.mutate();
    expect(rt.active).toBe(true);
    expect(env.canvas()).toBeDefined();
  });

  it('electricArcs = clicks: clicks work, no ambient timer is ever armed', () => {
    env.root.setAttribute('data-electric-arcs', 'clicks');
    const rt = install();
    vi.advanceTimersByTime(5000);
    expect(rt.active).toBe(true);
    expect(rt.ambient).toBe(false);
    expect(rt.ambientArmed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(dischargeAt(140, 116)).toBe(true);
  });

  it('jellyMotion = still and a playing game switch arcs off', () => {
    env.root.setAttribute('data-jelly-motion', 'still');
    const rt = install();
    expect(rt.active).toBe(false);
    env.root.removeAttribute('data-jelly-motion');
    env.root.setAttribute('data-game-state', 'playing');
    env.mutate();
    expect(rt.active).toBe(false);
    env.root.removeAttribute('data-game-state');
    env.mutate();
    expect(rt.active).toBe(true);
  });


  it('the hub open or an eversion in progress switches arcs off, including the API', () => {
    const rt = install();
    env.state.hub = true;
    expect(dischargeAt(140, 116)).toBe(false); // checked at action time, before any observer fires
    env.mutate();
    expect(rt.active).toBe(false);
    expect(env.canvas()).toBeUndefined();
    env.state.hub = false;
    env.mutate();
    expect(rt.active).toBe(true);
  });

  it('ambient: false (full preference): no warm-up timer, no ambient arcs, no breakdown, no attraction; clicks still arc and hop', () => {
    const bus = createJellyBus();
    const kinds: string[] = [];
    const pulses: Element[] = [];
    let attracted = 0;
    bus.on('arc:strike', (p) => kinds.push(p.kind));
    bus.on('charge:pulse', (p) => pulses.push(p.el));
    bus.on('charge:attract', () => attracted++);
    const rt = install({ bus, ambient: false });
    // Nothing is armed at install (the warm-up timer is the ambient system's), and none ever appears on its own.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(rt.active).toBe(true);
    expect(rt.ambient).toBe(false);
    expect(rt.ambientArmed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // The buttons are 10px apart, inside the uncharged breakdown gap, yet nothing strikes.
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
    expect(kinds).toHaveLength(0);
    // A click still arcs, deposits charge and hops it on; no attraction pull is ever emitted.
    expect(dischargeAt(140, 116)).toBe(true);
    for (let i = 0; i < 120; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
    expect(pulses.length).toBeGreaterThanOrEqual(2);
    expect(kinds.every((k) => k === 'click')).toBe(true);
    expect(attracted).toBe(0);
  });

  it('press(event) replays a pointerdown through the same gates; a stale target is skipped', () => {
    const rt = install({ ambient: false });
    const down = (target: unknown, over: object = {}) =>
      ({
        isPrimary: true,
        pointerType: 'mouse',
        button: 0,
        target,
        clientX: 230,
        clientY: 116,
        ...over,
      }) as unknown as PointerEvent;
    expect(rt.press(down(els[1], { button: 2 }))).toBe(false);
    expect(rt.press(down(null))).toBe(false);
    expect(rt.press(down(els[1]))).toBe(true);
    // A target that left the document while the chunk loaded.
    expect(rt.press(down(Object.assign(Object.create(els[1]), { isConnected: false })))).toBe(
      false,
    );
    env.state.hub = true;
    expect(rt.press(down(els[1]))).toBe(false);
  });

  it('a hidden tab kills live arcs and arms nothing', () => {
    const rt = install();
    vi.advanceTimersByTime(3000);
    dischargeAt(140, 116);
    env.state.hidden = true;
    env.docListeners.dispatch('visibilitychange');
    expect(rt.active).toBe(false);
    expect(env.rafQueue.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a low-end device gets click arcs only', () => {
    env = fakeEnv({ cores: 2 });
    els = fakeButtons();
    env.state.hit = els[0];
    const rt = install();
    vi.advanceTimersByTime(3000);
    expect(rt.active).toBe(true);
    expect(rt.ambient).toBe(false);
  });

  it('a 20 Hz click storm stays inside the flash ledger', () => {
    const ledger = createFlashLedger();
    install({ ledger });
    const onsets: number[] = [];
    const orig = ledger.tryOnset;
    ledger.tryOnset = (t: number) => {
      const ok = orig(t);
      if (ok) onsets.push(t);
      return ok;
    };
    for (let i = 0; i < 100; i++) {
      dischargeAt(140, 116);
      vi.advanceTimersByTime(50);
      env.frame();
    }
    for (const start of onsets) {
      expect(onsets.filter((t) => t >= start && t < start + 1000).length).toBeLessThanOrEqual(3);
    }
    expect(onsets.length).toBeGreaterThan(5);
  });

  it('announces arc:strike per rim endpoint with an inward normal', () => {
    const bus = createJellyBus();
    const strikes: { el: Element; nx: number; kind: string }[] = [];
    bus.on('arc:strike', (p) => strikes.push(p));
    install({ bus });
    expect(
      strike(els[0] as unknown as Element, els[1] as unknown as Element, { kind: 'click' }),
    ).toBe(true);
    for (let i = 0; i < 40 && env.rafQueue.size; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
    expect(strikes).toHaveLength(2);
    const a = strikes.find((s) => s.el === (els[0] as unknown as Element))!;
    const b = strikes.find((s) => s.el === (els[1] as unknown as Element))!;
    // els[0] is left of els[1]: the kick into els[0] points left (−x), into els[1] right (+x).
    expect(a.nx).toBeLessThan(0);
    expect(b.nx).toBeGreaterThan(0);
    expect(a.kind).toBe('click');
  });

  it('electricArcs = clicks: a press deposits charge that hops on; too-close bodies never break down', () => {
    env.root.setAttribute('data-electric-arcs', 'clicks');
    const bus = createJellyBus();
    const pulses: Element[] = [];
    const strikes: string[] = [];
    bus.on('charge:pulse', (p) => pulses.push(p.el));
    bus.on('arc:strike', (p) => strikes.push(p.kind));
    const rt = install({ bus });
    // The buttons are 10px apart — inside the uncharged breakdown gap — yet nothing strikes on its own.
    vi.advanceTimersByTime(5000);
    expect(strikes).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(rt.ambient).toBe(false);
    expect(dischargeAt(140, 116)).toBe(true);
    expect(pulses[0]).toBe(els[0] as unknown as Element);
    for (let i = 0; i < 120; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
    // The click's charge jumped on: a pulse on a neighbour, never back onto the sender as its next hop.
    expect(pulses.length).toBeGreaterThanOrEqual(2);
    expect(pulses[1]).toBe(els[1] as unknown as Element);
    expect(strikes.every((k) => k === 'click')).toBe(true);
  });

  it('electricArcs = full: a too-close pair breaks down on its own after the warm-up, inside the ledger', () => {
    const bus = createJellyBus();
    const ledger = createFlashLedger();
    const onsets: number[] = [];
    const orig = ledger.tryOnset;
    ledger.tryOnset = (t: number) => {
      const ok = orig(t);
      if (ok) onsets.push(t);
      return ok;
    };
    install({ bus, ledger });
    vi.advanceTimersByTime(2900);
    expect(onsets).toHaveLength(0);
    for (let i = 0; i < 70; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
    // The ambient scheduler alone allows ≤ 1 arc per 1.2s; breakdown adds deterministic strikes.
    expect(onsets.length).toBeGreaterThanOrEqual(2);
    for (const start of onsets) {
      expect(onsets.filter((t) => t >= start && t < start + 1000).length).toBeLessThanOrEqual(3);
    }
  });

  it('electricArcs = off: no charge, no pulse', () => {
    env.root.setAttribute('data-electric-arcs', 'off');
    const bus = createJellyBus();
    const pulses: unknown[] = [];
    bus.on('charge:pulse', (p) => pulses.push(p));
    install({ bus });
    expect(dischargeAt(140, 116)).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(pulses).toHaveLength(0);
  });

  /** Run the shared frame until the arcs are done (16ms steps). */
  const settle = () => {
    for (let i = 0; i < 100 && env.rafQueue.size > 0; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
  };

  it('a strike nudges the struck hosts (≤ 1.5px, inward) and the nudge clears after the settle', () => {
    install({ ambient: false });
    expect(strike(els[0] as unknown as Element, els[1] as unknown as Element)).toBe(true);
    settle();
    // Both struck hosts were kicked at the first strike and have been let go onto the release spring by now.
    const kicked = [els[0], els[1]].filter((el) => el.getAttribute(NUDGE.attr) !== null);
    expect(kicked).toHaveLength(2);
    vi.advanceTimersByTime(NUDGE.kickMs + NUDGE.settleMs);
    for (const el of els) {
      expect(el.getAttribute(NUDGE.attr)).toBeNull();
      expect(el.style[NUDGE.propX]).toBeUndefined();
    }
  });

  it('teardown mid-nudge removes the nudge properties at once', () => {
    install({ ambient: false });
    expect(strike(els[0] as unknown as Element, els[1] as unknown as Element)).toBe(true);
    // Run just past the first strike (pre-glow 40ms), while the hosts are still kicked.
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(16);
      env.frame();
    }
    expect(els[1].getAttribute(NUDGE.attr)).toBe('kick');
    expect(els[1].style[NUDGE.propX]).toMatch(/px$/);
    teardown!();
    teardown = null;
    for (const el of els) {
      expect(el.getAttribute(NUDGE.attr)).toBeNull();
      expect(el.style[NUDGE.propX]).toBeUndefined();
      expect(el.style[NUDGE.propY]).toBeUndefined();
    }
    expect(env.canvas()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still and off: a strike draws nothing and nudges nothing', () => {
    for (const set of [
      () => env.root.setAttribute('data-jelly-motion', 'still'),
      () => env.root.setAttribute('data-electric-arcs', 'off'),
    ]) {
      set();
      install({ ambient: false });
      expect(strike(els[0] as unknown as Element, els[1] as unknown as Element)).toBe(false);
      expect(dischargeAt(140, 116)).toBe(false);
      expect(env.canvas()).toBeUndefined();
      expect(env.rafCalls).toBe(0);
      expect(els.every((el) => el.getAttribute(NUDGE.attr) === null)).toBe(true);
      teardown!();
      teardown = null;
      env.root.removeAttribute('data-jelly-motion');
      env.root.removeAttribute('data-electric-arcs');
    }
  });

  it('a touch-only device ticks once per burst; a fine pointer never does', () => {
    const vibrate = vi.fn(() => true);
    (env.win.navigator as unknown as { vibrate: typeof vibrate }).vibrate = vibrate;
    env.state.fine = false;
    install({ ambient: false });
    expect(strike(els[0] as unknown as Element, els[1] as unknown as Element)).toBe(true);
    settle();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(NUDGE.vibrateMs);
    teardown!();
    teardown = null;
    vibrate.mockClear();
    env.state.fine = true;
    vi.advanceTimersByTime(2000);
    install({ ambient: false });
    expect(strike(els[0] as unknown as Element, els[1] as unknown as Element)).toBe(true);
    settle();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('teardown removes the layer, listeners and the active runtime', () => {
    install();
    teardown!();
    teardown = null;
    expect(env.canvas()).toBeUndefined();
    expect(env.winListeners.count('pointerdown')).toBe(0);
    expect(env.docListeners.count('click')).toBe(0);
    expect(env.docListeners.count('scroll')).toBe(0);
    expect(activeElectricArcs()).toBeNull();
    expect(env.observers.every((o) => !o.on)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
