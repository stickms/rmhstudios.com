/**
 * The arc runtime's gates (03-arcs.md §2.3, §6.2; master plan R9, R10, R13): the global-off list removes the layer and
 * every input listener and comes back when it clears; `clicks` keeps clicks but arms no ambient timer; the hub and an
 * eversion switch arcs off; a click storm stays inside the flash ledger; strikes are announced on the bus; and
 * teardown leaves nothing behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJellyBus } from '../../bus';
import type { JellyEntry, JellyRegistry } from '../../registry';
import { activeElectricArcs, dischargeAt, installElectricArcs, strike } from '../index';
import { createFlashLedger } from '../ledger';
import { FakeEl, fakeEnv, type FakeEnv } from './arc-dom';

function fakeRegistry(els: FakeEl[]): JellyRegistry {
  const entries: JellyEntry[] = els.map((el, order) => ({
    el: el as unknown as Element,
    role: 'control',
    order,
    visible: true,
    rect: { ...el.box },
  }));
  return {
    visible: () => entries,
    ambientSlots: () => [],
    liveSet: () => [],
    entryFor: () => undefined,
    onChange: () => () => {},
    scrolling: false,
    epoch: 0,
    refresh: () => {},
    dispose: () => {},
  };
}

/** Three buttons in a row, 10px apart. */
function buttons() {
  return [0, 1, 2].map(
    (i) => new FakeEl('button', { left: 100 + i * 90, top: 100, width: 80, height: 32 }, true),
  );
}

describe('electric arcs runtime', () => {
  let env: FakeEnv;
  let els: FakeEl[];
  let teardown: (() => void) | null = null;
  const install = (
    o: {
      ledger?: ReturnType<typeof createFlashLedger>;
      bus?: ReturnType<typeof createJellyBus>;
    } = {},
  ) => {
    teardown = installElectricArcs(env.doc, {
      registry: fakeRegistry(els),
      seed: 1,
      warmupMs: 3000,
      ledger: o.ledger ?? createFlashLedger(),
      bus: o.bus ?? createJellyBus(),
    });
    return activeElectricArcs()!;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    env = fakeEnv();
    els = buttons();
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

  it('high contrast, reduced transparency and perf-lite remove the layer', () => {
    const rt = install();
    for (const cls of ['style-high-contrast', 'reduce-transparency', 'perf-lite']) {
      env.root.classes.add(cls);
      env.mutate();
      expect(rt.active, cls).toBe(false);
      expect(env.canvas(), cls).toBeUndefined();
      env.root.classes.delete(cls);
      env.mutate();
      expect(rt.active, cls).toBe(true);
    }
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
    els = buttons();
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

  it('a soft-body release adds charge (body:release is consumed)', () => {
    const bus = createJellyBus();
    install({ bus });
    expect(bus.listenerCount('body:release')).toBe(1);
  });

  it('teardown removes the layer, listeners and the active runtime', () => {
    const bus = createJellyBus();
    install({ bus });
    teardown!();
    teardown = null;
    expect(env.canvas()).toBeUndefined();
    expect(env.winListeners.count('pointerdown')).toBe(0);
    expect(env.docListeners.count('click')).toBe(0);
    expect(env.docListeners.count('scroll')).toBe(0);
    expect(bus.listenerCount('body:release')).toBe(0);
    expect(activeElectricArcs()).toBeNull();
    expect(env.observers.every((o) => !o.on)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
