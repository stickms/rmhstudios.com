/**
 * The registry is shared by four services, so its cost rules are the contract: one observer of each kind, mutation
 * adds batched into one pass, rects read in one batched pass at scroll end / resize and never per scroll event, slot
 * ranking by role then distance, and nothing touched at import (SSR).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROLE_PRIORITY,
  SCROLL_END_MS,
  createJellyRegistry,
  installJellyRegistry,
  jellyRegistry,
  rankEntries,
  takeWithin,
  type JellyEntry,
} from '../registry';
import { JELLY_BUDGETS } from '../tiers';

// ── A tiny fake DOM: elements declare the simple selectors they match ───────

class El {
  nodeType = 1;
  parent: El | null = null;
  children: El[] = [];
  rectReads = 0;
  constructor(
    public sel: string[],
    public box = { left: 0, top: 0, width: 100, height: 100 },
  ) {}
  get isConnected(): boolean {
    return this.parent ? this.parent.isConnected : this === root;
  }
  append(...kids: El[]) {
    for (const k of kids) {
      k.parent = this;
      this.children.push(k);
    }
    return this;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  matches(selector: string) {
    return selector.split(',').some((s) => this.sel.includes(s.trim()));
  }
  closest(selector: string): El | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
  }
  querySelectorAll(selector: string) {
    const out: El[] = [];
    const walk = (n: El) => {
      for (const c of n.children) {
        if (c.matches(selector)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  getBoundingClientRect() {
    this.rectReads++;
    return { ...this.box };
  }
}

let root: El;
let io: { cb: (r: unknown[]) => void; observed: Set<El>; opts: unknown }[];
let ro: { cb: () => void; observed: Set<El> }[];
let mo: { cb: (r: unknown[]) => void; opts: unknown; on: boolean }[];
let docListeners: Map<string, Set<() => void>>;
let winListeners: Map<string, Set<() => void>>;
let doc: Document;

const listen = (m: Map<string, Set<() => void>>) => ({
  addEventListener: (t: string, fn: () => void) => {
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)!.add(fn);
  },
  removeEventListener: (t: string, fn: () => void) => m.get(t)?.delete(fn),
});
const fire = (m: Map<string, Set<() => void>>, t: string) => m.get(t)?.forEach((fn) => fn());

function makeDoc(): Document {
  root = new El(['html']);
  io = [];
  ro = [];
  mo = [];
  docListeners = new Map();
  winListeners = new Map();
  class IO {
    rec: (typeof io)[number];
    constructor(cb: (r: unknown[]) => void, opts: unknown) {
      this.rec = { cb, observed: new Set(), opts };
      io.push(this.rec);
    }
    observe(el: El) {
      this.rec.observed.add(el);
    }
    unobserve(el: El) {
      this.rec.observed.delete(el);
    }
    disconnect() {
      this.rec.observed.clear();
    }
  }
  class RO {
    rec: (typeof ro)[number];
    constructor(cb: () => void) {
      this.rec = { cb, observed: new Set() };
      ro.push(this.rec);
    }
    observe(el: El) {
      this.rec.observed.add(el);
    }
    unobserve(el: El) {
      this.rec.observed.delete(el);
    }
    disconnect() {
      this.rec.observed.clear();
    }
  }
  class MO {
    rec: (typeof mo)[number];
    constructor(cb: (r: unknown[]) => void) {
      this.rec = { cb, opts: null, on: false };
      mo.push(this.rec);
    }
    observe(_t: unknown, opts: unknown) {
      this.rec.on = true;
      this.rec.opts = opts;
    }
    disconnect() {
      this.rec.on = false;
    }
  }
  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    IntersectionObserver: IO,
    ResizeObserver: RO,
    MutationObserver: MO,
    ...listen(winListeners),
  };
  return {
    documentElement: root,
    defaultView: win,
    ...listen(docListeners),
  } as unknown as Document;
}

/** Deliver an IntersectionObserver batch. */
const intersect = (...els: [El, boolean][]) =>
  io[0]!.cb(
    els.map(([el, on]) => ({ target: el, isIntersecting: on, boundingClientRect: el.box })),
  );

beforeEach(() => {
  vi.useFakeTimers();
  doc = makeDoc();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('discovery', () => {
  it('tracks every jelly host with ONE intersection, resize and mutation observer', () => {
    const pane = new El(['.glass-pane']);
    const btn = new El(['[data-slot="button"]']);
    const plain = new El(['div']);
    root.append(pane.append(btn), plain);
    const reg = createJellyRegistry(doc);
    expect(io).toHaveLength(1);
    expect(ro).toHaveLength(1);
    expect(mo).toHaveLength(1);
    expect(io[0]!.opts).toMatchObject({ rootMargin: '0px' });
    expect([...io[0]!.observed]).toEqual([pane, btn]);
    expect(reg.entryFor(pane as unknown as Element)?.role).toBe('pane');
    expect(reg.entryFor(btn as unknown as Element)?.role).toBe('control');
    expect(reg.entryFor(plain as unknown as Element)).toBeUndefined();
    reg.dispose();
  });

  it('skips opted-out hosts, opted-out scopes, playfields and self-drawing elements', () => {
    const off = new El(['.glass-fill', '[data-jelly="off"]']);
    const alias = new El(['.glass-fill', '[data-fluid-press="none"]']);
    const field = new El(['[data-jelly-zone="playfield"]']).append(new El(['.glass-fill']));
    const canvas = new El(['[data-jelly]', 'canvas']);
    root.append(off, alias, field, canvas);
    const reg = createJellyRegistry(doc);
    expect(io[0]!.observed.size).toBe(0);
    reg.dispose();
  });

  it('batches mutation adds into one pass and drops removed hosts', () => {
    const reg = createJellyRegistry(doc);
    const changed = vi.fn();
    reg.onChange(changed);
    const a = new El(['.glass-fill']);
    const b = new El(['.glass-fill']);
    const wrap = new El(['div']).append(a, b);
    root.append(wrap);
    mo[0]!.cb([{ type: 'childList', addedNodes: [wrap], removedNodes: [] }]);
    mo[0]!.cb([{ type: 'childList', addedNodes: [wrap], removedNodes: [] }]);
    expect(io[0]!.observed.size).toBe(0); // queued, not resolved
    vi.runOnlyPendingTimers();
    expect(io[0]!.observed.size).toBe(2);
    expect(changed).toHaveBeenCalledTimes(1);

    wrap.remove();
    mo[0]!.cb([{ type: 'childList', addedNodes: [], removedNodes: [wrap] }]);
    vi.runOnlyPendingTimers();
    expect(reg.entryFor(a as unknown as Element)).toBeUndefined();
    expect(io[0]!.observed.size).toBe(0);
    reg.dispose();
  });

  it('re-evaluates a host whose opt-out attribute changes', () => {
    const card = new El(['.glass-fill']);
    root.append(card);
    const reg = createJellyRegistry(doc);
    expect(reg.entryFor(card as unknown as Element)).toBeDefined();
    card.sel.push('[data-jelly="off"]');
    mo[0]!.cb([{ type: 'attributes', target: card, addedNodes: [], removedNodes: [] }]);
    vi.runOnlyPendingTimers();
    expect(reg.entryFor(card as unknown as Element)).toBeUndefined();
    reg.dispose();
  });
});

describe('rect cache', () => {
  it('takes rects from the intersection observer for free', () => {
    const card = new El(['.glass-fill'], { left: 10, top: 20, width: 30, height: 40 });
    root.append(card);
    const reg = createJellyRegistry(doc);
    intersect([card, true]);
    expect(reg.visible().map((e) => e.rect)).toEqual([
      { left: 10, top: 20, width: 30, height: 40 },
    ]);
    expect(card.rectReads).toBe(0);
    reg.dispose();
  });

  it('never reads layout per scroll event; one batched pass at scroll end', () => {
    const cards = [0, 1, 2].map(() => new El(['.glass-fill']));
    root.append(...cards);
    const reg = createJellyRegistry(doc);
    intersect(...cards.map((c) => [c, true] as [El, boolean]));
    const epoch = reg.epoch;
    for (let i = 0; i < 50; i++) fire(docListeners, 'scroll');
    expect(reg.scrolling).toBe(true);
    expect(cards.reduce((n, c) => n + c.rectReads, 0)).toBe(0);
    // Size changes during a scroll wait for the scroll to end.
    ro[0]!.cb();
    vi.advanceTimersByTime(SCROLL_END_MS + 1);
    expect(reg.scrolling).toBe(false);
    expect(cards.map((c) => c.rectReads)).toEqual([1, 1, 1]);
    expect(reg.epoch).toBe(epoch + 1);
    vi.runOnlyPendingTimers();
    expect(cards.map((c) => c.rectReads)).toEqual([1, 1, 1]);
    reg.dispose();
  });

  it('scrollend ends the scroll at once', () => {
    const card = new El(['.glass-fill']);
    root.append(card);
    const reg = createJellyRegistry(doc);
    intersect([card, true]);
    fire(docListeners, 'scroll');
    fire(docListeners, 'scrollend');
    expect(reg.scrolling).toBe(false);
    expect(card.rectReads).toBe(1);
    reg.dispose();
  });

  it('coalesces resize and size changes into one refresh, reading only visible hosts', () => {
    const on = new El(['.glass-fill']);
    const offscreen = new El(['.glass-fill']);
    root.append(on, offscreen);
    const reg = createJellyRegistry(doc);
    intersect([on, true], [offscreen, false]);
    fire(winListeners, 'resize');
    ro[0]!.cb();
    fire(winListeners, 'resize');
    vi.runOnlyPendingTimers();
    expect(on.rectReads).toBe(1);
    expect(offscreen.rectReads).toBe(0);
    reg.dispose();
  });
});

describe('slots', () => {
  const entry = (
    role: JellyEntry['role'],
    left: number,
    order: number,
    size = 100,
  ): JellyEntry => ({
    el: {} as Element,
    role,
    order,
    visible: true,
    rect: { left, top: 0, width: size, height: size },
  });

  it('rank by role priority, then distance to the focus, then discovery order', () => {
    expect(ROLE_PRIORITY.overlay).toBeLessThan(ROLE_PRIORITY.chrome);
    expect(ROLE_PRIORITY.chrome).toBeLessThan(ROLE_PRIORITY.pane);
    expect(ROLE_PRIORITY.pane).toBeLessThan(ROLE_PRIORITY.fill);
    expect(ROLE_PRIORITY.fill).toBeLessThan(ROLE_PRIORITY.control);
    const far = entry('fill', 900, 0);
    const near = entry('fill', 0, 1);
    const ctl = entry('control', 0, 2);
    const ov = entry('overlay', 900, 3);
    expect(rankEntries([ctl, far, near, ov], { x: 50, y: 50 })).toEqual([ov, near, far, ctl]);
  });

  it('cap by count and by animated area', () => {
    const big = entry('pane', 0, 0, 1000);
    const small = [1, 2, 3].map((i) => entry('fill', 0, i));
    expect(takeWithin([big, ...small], 2)).toEqual([big, small[0]]);
    // The big one does not fit the area; the smaller ones further down still do.
    expect(takeWithin([big, ...small], 8, 25_000)).toEqual(small.slice(0, 2));
  });

  it('ambientSlots and liveSet honour the tier budget', () => {
    const cards = Array.from(
      { length: 30 },
      (_, i) => new El(['.glass-fill'], { left: i, top: 0, width: 10, height: 10 }),
    );
    root.append(...cards);
    const reg = createJellyRegistry(doc);
    intersect(...cards.map((c) => [c, true] as [El, boolean]));
    expect(reg.ambientSlots(JELLY_BUDGETS.full)).toHaveLength(8);
    expect(reg.ambientSlots(JELLY_BUDGETS.handheld)).toHaveLength(4);
    expect(reg.liveSet(JELLY_BUDGETS.full)).toHaveLength(24);
    expect(reg.liveSet(JELLY_BUDGETS.lite)).toHaveLength(0);
    expect(reg.liveSet(5)).toHaveLength(5);
    reg.dispose();
  });
});

describe('lifecycle', () => {
  it('install is shared and reference-counted; the last teardown disposes', () => {
    const a = installJellyRegistry(doc);
    const b = installJellyRegistry(doc);
    expect(io).toHaveLength(1);
    const reg = jellyRegistry(doc);
    expect(reg).not.toBeNull();
    a();
    a(); // idempotent
    expect(jellyRegistry(doc)).toBe(reg);
    expect(mo[0]!.on).toBe(true);
    b();
    expect(jellyRegistry(doc)).toBeNull();
    expect(mo[0]!.on).toBe(false);
    expect(docListeners.get('scroll')!.size).toBe(0);
    expect(winListeners.get('resize')!.size).toBe(0);
  });

  it('is SSR-safe: no window at import, null without a document, and no rAF anywhere', () => {
    expect(typeof window).toBe('undefined');
    expect(jellyRegistry()).toBeNull();
    const src = readFileSync(join(__dirname, '..', 'registry.ts'), 'utf8');
    expect(src).not.toMatch(/requestAnimationFrame\s*\(/);
  });
});
