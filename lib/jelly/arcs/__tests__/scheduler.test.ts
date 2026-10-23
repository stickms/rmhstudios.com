/**
 * The ambient scheduler's contract (03-arcs.md §2.2–2.3, §7.1): never more than Λ_max·T arcs, never closer than
 * T_min, closer pairs arc more often by exp(Δgap/L), every quiet state silences it and it resumes, and with nothing to
 * do (quiet, hidden, Λ = 0) no timer is armed at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJellyBus } from '../../bus';
import { ARC_BUDGET } from '../rate';
import { mulberry32 } from '../rng';
import {
  MODAL_SELECTOR,
  QUIET,
  createAmbientScheduler,
  createChargeBook,
  createQuietTracker,
  type ArcCandidate,
} from '../scheduler';
import { Listeners } from './arc-dom';

const el = () => ({ contains: () => false }) as unknown as Element;

/** A row of `n` 80×40 cards `gap` px apart. */
function row(n: number, gap: number, y = 100, x0 = 0): ArcCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    el: el(),
    rect: { x: x0 + i * (80 + gap), y, w: 80, h: 40, r: 8 },
  }));
}

describe('ambient scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays under Λ_max·T and at least T_min apart over 10 simulated minutes', () => {
    const times: number[] = [];
    const s = createAmbientScheduler({
      candidates: () => [...row(10, 8), ...row(10, 12, 160)],
      quiet: () => false,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
      fire: () => {
        times.push(Date.now());
        return true;
      },
      rand: mulberry32(42),
      now: () => Date.now(),
    });
    s.invalidate();
    const T = 600_000;
    vi.advanceTimersByTime(T);
    expect(times.length).toBeGreaterThan(50);
    expect(times.length).toBeLessThanOrEqual(ARC_BUDGET.maxAmbientRate * (T / 1000));
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(ARC_BUDGET.minAmbientIntervalMs);
    }
    s.stop();
  });

  it('a pair at 8px arcs ≈ exp((120 − 8)/48) times as often as a pair at 120px', () => {
    const near = row(2, 8, 100);
    const far = row(2, 120, 700, 2000);
    const counts = new Map<Element, number>();
    const s = createAmbientScheduler({
      candidates: () => [...near, ...far],
      quiet: () => false,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
      fire: (a) => {
        counts.set(a.el, (counts.get(a.el) ?? 0) + 1);
        return true;
      },
      rand: mulberry32(9),
      now: () => Date.now(),
      charge: null,
    });
    s.invalidate();
    vi.advanceTimersByTime(36_000_000); // 10 simulated hours
    const n = counts.get(near[0].el) ?? 0;
    const f = counts.get(far[0].el) ?? 0;
    expect(f).toBeGreaterThan(50);
    const expected = Math.exp((120 - 8) / 48);
    expect(n / f).toBeGreaterThan(expected * 0.7);
    expect(n / f).toBeLessThan(expected * 1.3);
    s.stop();
  });

  it('only pairs whose ends both hold ≥ 0.35 charge arc, and an arc drains both', () => {
    const charge = createChargeBook();
    const cands = [...row(10, 8), ...row(10, 12, 160)];
    let fired = 0;
    const s = createAmbientScheduler({
      candidates: () => cands,
      quiet: () => false,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
      fire: (a, b) => {
        const t = Date.now();
        expect(charge.get(a.el, t)).toBeGreaterThanOrEqual(ARC_BUDGET.chargeThreshold);
        expect(charge.get(b.el, t)).toBeGreaterThanOrEqual(ARC_BUDGET.chargeThreshold);
        fired++;
        return true;
      },
      rand: mulberry32(1),
      now: () => Date.now(),
      charge,
    });
    // A click drained one card to 0: it cannot arc until it recharges.
    charge.set(cands[0].el, 0, Date.now());
    s.invalidate();
    vi.advanceTimersByTime(300_000);
    expect(fired).toBeGreaterThan(20);
    s.stop();
  });

  it('a quiet state arms no timer and fires nothing; resume works', () => {
    let quiet = true;
    const fire = vi.fn(() => true);
    const s = createAmbientScheduler({
      candidates: () => row(6, 8),
      quiet: () => quiet,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
      fire,
      rand: mulberry32(5),
      now: () => Date.now(),
    });
    s.invalidate();
    expect(s.armed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(fire).not.toHaveBeenCalled();
    quiet = false;
    s.poke();
    expect(s.armed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(fire).toHaveBeenCalled();
    s.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a hidden tab (quiet) leaves no armed timer', () => {
    let hidden = false;
    const s = createAmbientScheduler({
      candidates: () => row(6, 8),
      quiet: () => hidden,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
      fire: () => true,
      rand: mulberry32(5),
      now: () => Date.now(),
    });
    s.invalidate();
    expect(vi.getTimerCount()).toBe(1);
    hidden = true;
    s.poke();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Λ = 0 (no pairs, all too far, or the tier says no ambient arcs) arms no timer', () => {
    let cands: ArcCandidate[] = [];
    let interval = 2000;
    const s = createAmbientScheduler({
      candidates: () => cands,
      quiet: () => false,
      minIntervalMs: () => interval,
      multiplier: () => 1,
      fire: () => true,
      rand: mulberry32(5),
      now: () => Date.now(),
    });
    s.invalidate();
    expect(s.rate()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    cands = row(3, 400); // beyond maxGap
    s.invalidate();
    expect(vi.getTimerCount()).toBe(0);
    cands = row(3, 8);
    interval = Infinity;
    s.invalidate();
    expect(vi.getTimerCount()).toBe(0);
    interval = 2000;
    s.poke();
    expect(vi.getTimerCount()).toBe(1);
    s.stop();
  });

  it('a coarse pointer and a handheld interval lower the rate', () => {
    const base = {
      candidates: () => [...row(10, 8), ...row(10, 8, 160)],
      quiet: () => false,
      fire: () => true,
      rand: mulberry32(5),
      now: () => Date.now(),
    };
    const full = createAmbientScheduler({
      ...base,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
    });
    const handheld = createAmbientScheduler({
      ...base,
      minIntervalMs: () => 4000,
      multiplier: () => ARC_BUDGET.coarseMultiplier,
    });
    expect(full.rate()).toBeCloseTo(0.5, 5);
    expect(handheld.rate()).toBeLessThanOrEqual(0.25);
  });
});

// ── Quiet tracker ────────────────────────────────────────────────────────────

function quietDoc() {
  const l = new Listeners();
  const state = {
    modal: false,
    selection: false,
    video: null as null | { paused: boolean; ended: boolean },
    scrollingAttr: false,
  };
  const doc = {
    documentElement: { hasAttribute: () => state.scrollingAttr },
    defaultView: { innerWidth: 1000, innerHeight: 800 },
    addEventListener: l.addEventListener,
    removeEventListener: l.removeEventListener,
    getSelection: () =>
      state.selection
        ? { rangeCount: 1, isCollapsed: false }
        : { rangeCount: 0, isCollapsed: true },
    querySelector: (s: string) => (s === MODAL_SELECTOR && state.modal ? {} : null),
    querySelectorAll: (s: string) =>
      s === 'video' && state.video
        ? [
            {
              ...state.video,
              getBoundingClientRect: () => ({ left: 0, top: 0, right: 640, bottom: 360 }),
            },
          ]
        : [],
    fullscreenElement: null,
  };
  return { doc: doc as unknown as Document, l, state };
}

const editable = { closest: (s: string) => (s.includes('textarea') ? {} : null) };
const plain = { closest: () => null };

describe('quiet tracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const q = quietDoc();
    const bus = createJellyBus();
    const onChange = vi.fn();
    const onScroll = vi.fn();
    const tracker = createQuietTracker(q.doc, { bus, onChange, onScroll, now: () => Date.now() });
    return { ...q, bus, onChange, onScroll, tracker };
  }

  it('scrolling holds until 800ms after the last scroll, and fades live arcs', () => {
    const { l, tracker, onChange, onScroll } = setup();
    l.dispatch('scroll');
    expect(tracker.reason()).toBe('scrolling');
    expect(onScroll).toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    l.dispatch('scroll');
    vi.advanceTimersByTime(500);
    expect(tracker.quiet()).toBe(true);
    vi.advanceTimersByTime(QUIET.scrollMs);
    expect(tracker.quiet()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2); // enter + resume
    tracker.dispose();
  });

  it('typing in a field holds for 2500ms; keys elsewhere do not', () => {
    const { l, tracker } = setup();
    l.dispatch('keydown', { target: plain });
    expect(tracker.quiet()).toBe(false);
    l.dispatch('keydown', { target: editable });
    expect(tracker.reason()).toBe('typing');
    vi.advanceTimersByTime(QUIET.typingMs + 2);
    expect(tracker.quiet()).toBe(false);
    tracker.dispose();
  });

  it('a drag holds until drag:end + 600ms', () => {
    const { bus, tracker } = setup();
    const e = {} as Element;
    bus.emit('drag:start', { el: e });
    vi.advanceTimersByTime(10_000);
    expect(tracker.reason()).toBe('drag');
    bus.emit('drag:end', { el: e });
    expect(tracker.quiet()).toBe(true);
    vi.advanceTimersByTime(QUIET.dragMs + 2);
    expect(tracker.quiet()).toBe(false);
    tracker.dispose();
  });

  it('selection, modal, playing video and the scrolling attribute each hold', () => {
    const { tracker, state } = setup();
    expect(tracker.quiet()).toBe(false);
    state.selection = true;
    expect(tracker.reason()).toBe('selection');
    state.selection = false;
    state.modal = true;
    expect(tracker.reason()).toBe('modal');
    state.modal = false;
    state.video = { paused: false, ended: false };
    expect(tracker.reason()).toBe('video');
    state.video = { paused: true, ended: false };
    expect(tracker.quiet()).toBe(false);
    state.scrollingAttr = true;
    expect(tracker.reason()).toBe('scrolling');
    tracker.dispose();
  });

  it('every quiet condition produces 0 ambient arcs, and arcs resume after', () => {
    const { l, bus, tracker, state } = setup();
    const dragged = {} as Element;
    const fire = vi.fn(() => true);
    const s = createAmbientScheduler({
      candidates: () => row(8, 8),
      quiet: tracker.quiet,
      minIntervalMs: () => 2000,
      multiplier: () => 1,
      fire,
      rand: mulberry32(11),
      now: () => Date.now(),
      charge: null,
    });
    s.invalidate();
    const holds: [string, () => void, () => void][] = [
      ['selection', () => (state.selection = true), () => (state.selection = false)],
      ['modal', () => (state.modal = true), () => (state.modal = false)],
      ['video', () => (state.video = { paused: false, ended: false }), () => (state.video = null)],
      [
        'drag',
        () => bus.emit('drag:start', { el: dragged }),
        () => bus.emit('drag:end', { el: dragged }),
      ],
    ];
    for (const [, on, off] of holds) {
      on();
      s.poke();
      fire.mockClear();
      vi.advanceTimersByTime(30_000);
      expect(fire).not.toHaveBeenCalled();
      off();
      vi.advanceTimersByTime(QUIET.dragMs + 2);
      s.poke();
      vi.advanceTimersByTime(30_000);
      expect(fire).toHaveBeenCalled();
    }
    // Scrolling continuously for 30s: nothing; then resume.
    fire.mockClear();
    for (let t = 0; t < 30_000; t += 200) {
      l.dispatch('scroll');
      s.poke();
      vi.advanceTimersByTime(200);
    }
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    s.poke();
    vi.advanceTimersByTime(30_000);
    expect(fire).toHaveBeenCalled();
    s.stop();
    tracker.dispose();
  });

  it('dispose removes every listener', () => {
    const { l, tracker } = setup();
    tracker.dispose();
    for (const type of ['scroll', 'keydown', 'input', 'selectionchange', 'play', 'pause', 'ended'])
      expect(l.count(type)).toBe(0);
  });
});
