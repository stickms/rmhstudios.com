/**
 * The soft-body service's cost and lifecycle contract (02 §4–§5): the loop stops on its own and leaves nothing
 * inline behind, no geometry is read per pointer move, the active set is capped, opt-outs never move, writes compose
 * with Tailwind bases and yield to framer, admitted slabs get lattice drives, releases are announced and nudge their
 * neighbours (never after a scroll), arc strikes kick the struck element, and teardown restores everything.
 *
 * The suite runs in the node environment against a tiny fake DOM: elements match the simple selectors the service
 * uses, count their rect reads, and keep inline style as plain fields; frames run only when the test steps them.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FramerWatch,
  composeScale,
  composeTranslate,
  hasInlineTransformOffset,
  parseScale,
  parseTranslate,
  readBase,
} from '../compose';
import { jellyBus } from '../bus';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dentOf, latticeDrive, resetLatticeInputsForTests } from '../lattice-inputs';
import { createJellyLens, type JellyLens } from '../lens';
import { installJellyPhysics, plasmaEaseFactor, reportJellyDrag } from '../physics';
import { DENT, FINE_POINTER_QUERY, MOTION_BOUNDS, PLASMA } from '../tiers';

// ── Fake DOM ──────────────────────────────────────────────────────────────

/** Split a selector list on top-level commas. */
function splitList(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function matchCompound(el: FakeEl, sel: string): boolean {
  let rest = sel.trim();
  const tag = /^[a-z][a-z0-9]*/i.exec(rest);
  if (tag) {
    if (el.tag !== tag[0].toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest.length) {
    let m: RegExpExecArray | null;
    if ((m = /^\.([\w-]+)/.exec(rest))) {
      if (!el.classList.contains(m[1])) return false;
    } else if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(rest))) {
      const v = el.getAttribute(m[1]);
      if (v === null) return false;
      if (m[2] !== undefined && v !== m[2]) return false;
    } else if ((m = /^:not\((.+?\])\)/.exec(rest))) {
      if (matchCompound(el, m[1])) return false;
    } else if ((m = /^\*/.exec(rest))) {
      // universal
    } else throw new Error(`fake DOM cannot match "${sel}"`);
    rest = rest.slice(m[0].length);
  }
  return true;
}

class FakeStyle {
  translate = '';
  scale = '';
  transform = '';
  willChange = '';
  borderRadius = '';
  filter = '';
}

let rectReads = 0;

class FakeEl {
  attrs = new Map<string, string>();
  classes = new Set<string>();
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  style = new FakeStyle();
  computed: { translate?: string; scale?: string; borderTopLeftRadius?: string; filter?: string } =
    {};
  constructor(
    public tag: string,
    public box = { left: 0, top: 0, width: 100, height: 40 },
  ) {}
  get tagName() {
    return this.tag.toUpperCase();
  }
  get classList() {
    const c = this.classes;
    return {
      contains: (n: string) => c.has(n),
      [Symbol.iterator]: () => c[Symbol.iterator](),
    };
  }
  get isConnected(): boolean {
    return this.parentElement ? this.parentElement.isConnected : this === root;
  }
  getAttribute(n: string) {
    if (n === 'class') return [...this.classes].join(' ') || null;
    return this.attrs.has(n) ? this.attrs.get(n)! : null;
  }
  hasAttribute(n: string) {
    return this.getAttribute(n) !== null;
  }
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  removeAttribute(n: string) {
    this.attrs.delete(n);
  }
  matches(sel: string) {
    return splitList(sel).some((s) => matchCompound(this, s));
  }
  closest(sel: string): FakeEl | null {
    if (this.matches(sel)) return this;
    let n = this.parentElement;
    while (n) {
      if (n.matches(sel)) return n;
      n = n.parentElement;
    }
    return null;
  }
  contains(o: unknown): boolean {
    let n = o as FakeEl | null;
    while (n) {
      if (n === this) return true;
      n = n.parentElement;
    }
    return false;
  }
  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = [];
    const walk = (e: FakeEl) => {
      for (const c of e.children) {
        if (c.matches(sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel: string): FakeEl | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  append(...kids: FakeEl[]) {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    return this;
  }
  getBoundingClientRect() {
    rectReads++;
    const b = this.box;
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }
}

function make(
  tag: string,
  opts: { cls?: string[]; attrs?: Record<string, string>; box?: FakeEl['box'] } = {},
) {
  const e = new FakeEl(tag, opts.box);
  for (const c of opts.cls ?? []) e.classes.add(c);
  for (const [k, v] of Object.entries(opts.attrs ?? {})) e.attrs.set(k, v);
  return e;
}

let root: FakeEl;
let body: FakeEl;
let clock = 0;
let frames: Array<(t: number) => void> = [];
let rafCalls = 0;
let fine = true;
const docListeners = new Map<string, Set<(e: unknown) => void>>();
const winListeners = new Map<string, Set<(e: unknown) => void>>();
let getComputedStyle: ReturnType<typeof vi.fn>;
let win: Record<string, unknown>;
let doc: Record<string, unknown> & { hidden: boolean };
let teardown: () => void = () => {};

const listen =
  (map: Map<string, Set<(e: unknown) => void>>) => (type: string, fn: (e: unknown) => void) => {
    let s = map.get(type);
    if (!s) map.set(type, (s = new Set()));
    s.add(fn);
  };
const unlisten =
  (map: Map<string, Set<(e: unknown) => void>>) => (type: string, fn: (e: unknown) => void) => {
    map.get(type)?.delete(fn);
  };

function setup() {
  rectReads = 0;
  clock = 1000;
  frames = [];
  rafCalls = 0;
  docListeners.clear();
  winListeners.clear();
  root = make('html');
  body = make('body');
  root.append(body);
  getComputedStyle = vi.fn((el: FakeEl) => ({
    translate: el.computed.translate ?? 'none',
    scale: el.computed.scale ?? 'none',
    borderTopLeftRadius: el.computed.borderTopLeftRadius ?? '8px',
    filter: el.computed.filter ?? 'none',
  }));
  win = {
    requestAnimationFrame: (cb: (t: number) => void) => {
      rafCalls++;
      frames.push(cb);
      return frames.length;
    },
    cancelAnimationFrame: () => {
      frames = [];
    },
    matchMedia: (q: string) => ({
      matches: q === FINE_POINTER_QUERY ? fine : false,
      addEventListener() {},
      removeEventListener() {},
    }),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle,
    addEventListener: listen(winListeners),
    removeEventListener: unlisten(winListeners),
    performance: { now: () => clock },
  };
  doc = {
    defaultView: win,
    documentElement: root,
    hidden: false,
    addEventListener: listen(docListeners),
    removeEventListener: unlisten(docListeners),
    querySelector: () => null,
  };
}

function install(opts: { lens?: JellyLens } = {}) {
  teardown = installJellyPhysics(doc as unknown as Document, opts);
}

/** A minimal SVG-capable document for the lens: nodes keep attributes and children, nothing renders. */
class FakeSvgNode {
  attrs = new Map<string, string>();
  children: FakeSvgNode[] = [];
  parent: FakeSvgNode | null = null;
  constructor(public tag: string) {}
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  setAttributeNS(_ns: string, n: string, v: string) {
    this.attrs.set(n, v);
  }
  appendChild(c: FakeSvgNode) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
}

function svgLens(): { lens: JellyLens; svgBody: FakeSvgNode } {
  const svgBody = new FakeSvgNode('body');
  const svgDoc = {
    defaultView: null,
    body: svgBody,
    createElementNS: (_ns: string, tag: string) => new FakeSvgNode(tag),
  };
  return { lens: createJellyLens(svgDoc as unknown as Document, { supported: true }), svgBody };
}

/** Run the frames queued so far, `ms` apart. Returns how many ran. */
function step(n = 1, ms = 16): number {
  let ran = 0;
  for (let i = 0; i < n; i++) {
    const queued = frames;
    frames = [];
    if (!queued.length) break;
    clock += ms;
    for (const cb of queued) cb(clock);
    ran++;
  }
  return ran;
}

/** Step until the loop stops by itself; returns the number of frames, or Infinity past the bound. */
function settle(max = 600): number {
  let n = 0;
  while (frames.length) {
    step(1);
    if (++n > max) return Infinity;
  }
  return n;
}

const pointerId = 1;
function fire(
  type: string,
  target: FakeEl | null,
  x = 50,
  y = 20,
  extra: Partial<{
    pointerType: string;
    pointerId: number;
    relatedTarget: unknown;
    button: number;
  }> = {},
) {
  const e = {
    type,
    target,
    clientX: x,
    clientY: y,
    pointerType: 'mouse',
    pointerId,
    button: 0,
    relatedTarget: undefined,
    ...extra,
  };
  for (const fn of [...(docListeners.get(type) ?? [])]) fn(e);
  // Pointer input reaches physics through the ONE window listener set (`pointer.ts`).
  for (const fn of [...(winListeners.get(type) ?? [])]) fn(e);
}

const inlineClean = (el: FakeEl) =>
  el.style.scale === '' &&
  el.style.translate === '' &&
  el.style.willChange === '' &&
  !el.hasAttribute('data-jelly-body') &&
  !el.hasAttribute('data-jelly-active');

beforeEach(() => {
  fine = true;
  setup();
});

afterEach(() => {
  teardown();
  teardown = () => {};
  resetLatticeInputsForTests();
});

// ── compose.ts ────────────────────────────────────────────────────────────

describe('compose (02 §3.4)', () => {
  it('parses computed translate/scale', () => {
    expect(parseTranslate('none')).toEqual({ tx: '0px', ty: '0px', tz: null });
    expect(parseTranslate('-50% -50%')).toEqual({ tx: '-50%', ty: '-50%', tz: null });
    expect(parseTranslate('10px')).toEqual({ tx: '10px', ty: '0px', tz: null });
    expect(parseTranslate('1px 2px 3px').tz).toBe('3px');
    expect(parseScale('none')).toEqual({ sx: 1, sy: 1 });
    expect(parseScale('1.05')).toEqual({ sx: 1.05, sy: 1.05 });
    expect(parseScale('1 0.5')).toEqual({ sx: 1, sy: 0.5 });
  });

  it('keeps a percentage base and multiplies a scale base', () => {
    const base = readBase({}, { translate: '-50% -50%', scale: '1.1' });
    expect(composeTranslate(base, 1.5, -2)).toBe('calc(-50% + 1.5px) calc(-50% + -2px)');
    expect(composeScale(base, 0.96, 1)).toBe('1.056 1.1');
    const plain = readBase({}, { translate: 'none', scale: 'none' });
    expect(composeTranslate(plain, 1, 2)).toBe('1px 2px');
  });

  it('detects framer offsets and ownership', () => {
    expect(hasInlineTransformOffset('')).toBe(false);
    expect(hasInlineTransformOffset('none')).toBe(false);
    expect(hasInlineTransformOffset('translateX(0px) translateY(0px)')).toBe(false);
    expect(hasInlineTransformOffset('translateZ(0)')).toBe(false);
    expect(hasInlineTransformOffset('translateX(12px)')).toBe(true);
    expect(hasInlineTransformOffset('scale(1.2)')).toBe(true);
    const w = new FramerWatch('');
    expect(w.observe('')).toBe(false);
    expect(w.observe('translateY(3px)')).toBe(true);
    expect(w.observe('translateY(3px)')).toBe(true);
    expect(w.observe('translateY(3px)')).toBe(false);
  });
});

// ── physics.ts ────────────────────────────────────────────────────────────

describe('installJellyPhysics', () => {
  it('requests no frames without input', () => {
    install();
    const card = make('div', { cls: ['glass-fill'] });
    body.append(card);
    fire('pointermove', card);
    fire('scroll', null);
    expect(rafCalls).toBe(0);
  });

  it('settle proof: press → release starts the loop, which stops by itself and clears every inline value', () => {
    install();
    const btn = make('button');
    body.append(btn);
    fire('pointerdown', btn, 50, 20, { pointerType: 'touch' });
    expect(btn.hasAttribute('data-jelly-active')).toBe(true);
    step(12);
    expect(btn.hasAttribute('data-jelly-body')).toBe(true);
    const [sx] = btn.style.scale.split(' ').map(Number);
    expect(sx).toBeLessThan(0.99);
    expect(sx).toBeGreaterThan(0.94);
    fire('pointerup', btn, 50, 20, { pointerType: 'touch' });
    expect(btn.hasAttribute('data-jelly-active')).toBe(false);
    const n = settle();
    expect(n).toBeLessThan(200);
    expect(frames).toHaveLength(0);
    expect(inlineClean(btn)).toBe(true);
  });

  it('a press on a flat member presses the parent that marks itself press-through, not the member', () => {
    // A JellyGroup (or a bar of flat members): the members opt out of being bodies, the parent is the one body.
    install();
    const group = make('div', {
      cls: ['glass-fill'],
      attrs: { 'data-jelly-press-through': '' },
      box: { left: 0, top: 0, width: 260, height: 56 },
    });
    const member = make('button', { attrs: { 'data-jelly': 'off' } });
    group.children.push(member);
    member.parentElement = group;
    body.append(group);
    fire('pointerdown', member, 40, 20, { pointerType: 'touch' });
    expect(group.hasAttribute('data-jelly-active')).toBe(true);
    expect(member.hasAttribute('data-jelly-active')).toBe(false);
  });

  it('a press-through container with no glass body around it falls back to the member rules (opted out: nothing presses)', () => {
    install();
    const strip = make('div', {
      attrs: { 'data-jelly-press-through': '', 'data-jelly-scope': 'off' },
    });
    const tab = make('button');
    strip.children.push(tab);
    tab.parentElement = strip;
    body.append(strip);
    expect(() => fire('pointerdown', tab, 40, 20, { pointerType: 'touch' })).not.toThrow();
    expect(strip.hasAttribute('data-jelly-active')).toBe(false);
  });

  it('a held press leaves plastic memory; the loop runs until it has decayed and the body is cleared', () => {
    // Regression (testing/e2e/liquid-glass.mjs, 2026-10-23): a press held past plasticHoldMs leaves plastic memory in
    // the rest target. The springs settled ON that (still decaying) target, `settled` stopped the frames, plastic only
    // ages inside a step so it never reached 0, the body was never asleep, never cleared — `data-jelly-body` and a
    // `scale: 1.0004 1.0003` stayed on the card until some unrelated pointer frame stepped it again.
    install();
    const card = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 0, width: 260, height: 190 },
    });
    const elsewhere = make('div');
    body.append(card, elsewhere);
    fire('pointerover', card, 84, 49);
    step(10);
    fire('pointerdown', card, 84, 49);
    step(30);
    clock += 480; // the press is HELD (the pressed body idles at its pose without frames meanwhile)
    fire('pointerup', card, 84, 49);
    step(40);
    fire('pointermove', elsewhere, 2, 700); // hover leave: rest target = plastic memory
    let n = 0;
    while (frames.length && n < 2000) {
      step(1);
      n++;
      // A body nobody holds is never left written without a queued frame.
      if (card.hasAttribute('data-jelly-body')) expect(frames.length).toBeGreaterThan(0);
    }
    expect(n).toBeLessThan(2000);
    // Asleep means cleared with its inline values restored exactly, never "stopped but still written".
    expect(inlineClean(card)).toBe(true);
    // No stale body survives for an unrelated later frame to write.
    const before = rafCalls;
    fire('pointermove', elsewhere, 600, 400);
    fire('pointerdown', elsewhere, 600, 400);
    fire('pointerup', elsewhere, 600, 400);
    expect(rafCalls).toBe(before);
    expect(inlineClean(card)).toBe(true);
  });

  it('under jittery frames no released body stalls before it sleeps (seeded sweep)', () => {
    let r = 7919;
    const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
    const jitter = () => 16 + Math.floor(rnd() * 64);
    for (let run = 0; run < 40; run++) {
      teardown();
      setup();
      install();
      const card = make('div', {
        cls: ['glass-fill'],
        box: { left: 0, top: 0, width: 260, height: 190 },
      });
      body.append(card);
      const x = 20 + Math.floor(rnd() * 220);
      const y = 20 + Math.floor(rnd() * 160);
      fire('pointerover', card, x, y);
      step(10);
      fire('pointerdown', card, x, y);
      step(20);
      clock += 300 + Math.floor(rnd() * 900);
      fire('pointerup', card, x, y);
      for (let i = 0; i < 40 && frames.length; i++) step(1, jitter());
      fire('pointermove', body, 2, 700);
      for (let i = 0; i < 2000 && frames.length; i++) step(1, jitter());
      expect(frames).toHaveLength(0);
      expect(inlineClean(card)).toBe(true);
    }
  });

  it("a card's delegate link is never a body of its own: the card is (testing/e2e/ui-stability.mjs)", () => {
    install();
    const card = make('article', {
      cls: ['rmhark', 'glass-fill'],
      attrs: { 'data-evert': '' },
      box: { left: 0, top: 0, width: 400, height: 200 },
    });
    const link = make('a', {
      attrs: { href: '#post-0', 'data-evert-delegate': '' },
      box: { left: 0, top: 0, width: 400, height: 160 },
    });
    const text = make('strong');
    const action = make('button', { box: { left: 10, top: 165, width: 60, height: 30 } });
    link.append(text);
    card.append(link, action);
    body.append(card);
    fire('pointerover', text, 3, 40);
    step(20);
    expect(card.hasAttribute('data-jelly-body')).toBe(true);
    expect(link.hasAttribute('data-jelly-body')).toBe(false);
    expect(link.style.scale).toBe('');
    expect(link.style.translate).toBe('');
    // A sibling action keeps its own body.
    fire('pointerdown', action, 30, 180);
    step(5);
    expect(action.hasAttribute('data-jelly-active')).toBe(true);
    fire('pointerup', action, 30, 180);
    fire('pointermove', body, 900, 900);
    settle();
    expect(inlineClean(card)).toBe(true);
    expect(inlineClean(action)).toBe(true);
  });

  it('reads geometry once per activation and never per pointer move', () => {
    install();
    const card = make('a', { cls: ['glass-fill'], attrs: { href: '/x' } });
    body.append(card);
    fire('pointerover', card, 50, 20);
    step(1);
    expect(rectReads).toBe(1);
    expect(getComputedStyle).toHaveBeenCalledTimes(1);
    rectReads = 0;
    getComputedStyle.mockClear();
    for (let i = 0; i < 200; i++) {
      fire('pointermove', card, 10 + (i % 80), 5 + (i % 30));
      if (i % 4 === 0) step(1);
    }
    expect(rectReads).toBe(0);
    expect(getComputedStyle).not.toHaveBeenCalled();
    // The card plumps and leans while hovered.
    expect(card.hasAttribute('data-jelly-body')).toBe(true);
  });

  it('hover leaves only outside the rest rect + 4px, then sleeps clean', () => {
    install();
    const card = make('div', { cls: ['glass-fill'] });
    body.append(card);
    fire('pointerover', card, 50, 20);
    settle();
    fire('pointermove', card, 102, 20); // 2px outside: still hovering (hysteresis)
    settle();
    expect(card.hasAttribute('data-jelly-body')).toBe(true);
    fire('pointermove', body, 120, 20);
    expect(settle()).toBeLessThan(200);
    expect(inlineClean(card)).toBe(true);
  });

  it('no hover on coarse pointers', () => {
    fine = false;
    install();
    const card = make('div', { cls: ['glass-fill'] });
    body.append(card);
    fire('pointerover', card);
    expect(rafCalls).toBe(0);
  });

  it('caps the active set (12 fine, 6 coarse) by evicting nudged bodies', () => {
    for (const [isFine, cap] of [
      [true, 12],
      [false, 6],
    ] as const) {
      teardown();
      fine = isFine;
      setup();
      install();
      const els = Array.from({ length: 20 }, (_, i) =>
        make('div', {
          cls: ['glass-fill'],
          box: { left: i * 120, top: 0, width: 100, height: 40 },
        }),
      );
      body.append(...els);
      for (const el of els)
        jellyBus.emit('arc:strike', {
          el: el as unknown as Element,
          x: 0,
          y: 0,
          nx: 1,
          ny: 0,
          energy: 1,
          kind: 'click',
        });
      step(2);
      const active = els.filter((e) => e.hasAttribute('data-jelly-body')).length;
      expect(active).toBeGreaterThan(0);
      expect(active).toBeLessThanOrEqual(cap);
      settle();
      expect(els.every(inlineClean)).toBe(true);
    }
  });

  it('opt-outs and exclusions never move', () => {
    install();
    const scope = make('div', { attrs: { 'data-jelly-scope': 'off' } });
    const inScope = make('button');
    scope.append(inScope);
    const els = [
      make('button', { attrs: { 'data-jelly': 'off' } }),
      make('button', { attrs: { 'data-fluid-press': 'none' } }),
      make('button', { attrs: { disabled: '' } }),
      make('button', { attrs: { 'aria-disabled': 'true' } }),
      make('canvas', { attrs: { 'data-jelly': 'card' } }),
      make('div', { attrs: { 'data-gesture': 'pan' }, cls: ['glass-fill'] }),
      inScope,
    ];
    body.append(...els.filter((e) => e !== inScope), scope);
    for (const el of els) {
      fire('pointerdown', el);
      fire('pointerup', el);
    }
    expect(rafCalls).toBe(0);
    expect(els.every(inlineClean)).toBe(true);
  });

  it('composes with a Tailwind percentage translate and restores it at sleep', () => {
    install();
    const btn = make('button');
    btn.computed.translate = '-50% -50%';
    body.append(btn);
    fire('pointerdown', btn, 10, 5);
    step(6);
    expect(btn.style.translate).toMatch(/^calc\(-50% \+ -?[\d.]+px\) calc\(-50% \+ -?[\d.]+px\)$/);
    fire('pointerup', btn, 10, 5);
    settle();
    expect(btn.style.translate).toBe('');
  });

  it('yields to framer while its transform changes and resumes after two stable frames', () => {
    install();
    const btn = make('button');
    body.append(btn);
    fire('pointerdown', btn);
    step(15);
    expect(btn.style.scale).not.toBe('');
    for (let i = 0; i < 40; i++) {
      btn.style.transform = `translateY(${i}px)`;
      fire('pointermove', btn); // keep frames coming
      step(1);
    }
    // Headed to rest and handed back while framer animates.
    expect(btn.style.scale).toBe('');
    fire('pointermove', btn);
    step(1);
    fire('pointermove', btn);
    step(1);
    fire('pointermove', btn);
    step(6);
    expect(btn.style.scale).not.toBe('');
    fire('pointerup', btn);
    settle();
    expect(inlineClean(btn)).toBe(true);
  });

  it('drives the lattice of an admitted slab and never moves a pane host', () => {
    install();
    const pane = make('section', {
      cls: ['glass-pane'],
      attrs: { 'data-liquid-canvas': 'on' },
      box: { left: 100, top: 50, width: 400, height: 300 },
    });
    body.append(pane);
    fire('pointerdown', pane, 150, 60, { pointerType: 'touch' });
    step(1);
    expect(latticeDrive(pane as unknown as Element)).toEqual({ kind: 'press', x: 50, y: 10 });
    expect(pane.style.scale).toBe('');
    expect(pane.style.translate).toBe('');
    fire('pointerup', pane, 150, 60, { pointerType: 'touch' });
    settle();
    expect(latticeDrive(pane as unknown as Element)).toBeNull();
    expect(getComputedStyle).not.toHaveBeenCalled();
  });

  it('a non-admitted pane is not a body at all', () => {
    install();
    const pane = make('section', { cls: ['glass-pane'] });
    body.append(pane);
    fire('pointerdown', pane);
    expect(rafCalls).toBe(0);
  });

  it('announces a release and nudges up to 4 neighbours within 24px, translate only', () => {
    install();
    const releases: unknown[] = [];
    const off = jellyBus.on('body:release', (e) => releases.push(e));
    const row = make('div');
    const src = make('button', { box: { left: 200, top: 0, width: 100, height: 40 } });
    const near = [
      make('button', { box: { left: 310, top: 0, width: 100, height: 40 } }),
      make('button', { box: { left: 90, top: 0, width: 100, height: 40 } }),
    ];
    const far = make('button', { box: { left: 600, top: 0, width: 100, height: 40 } });
    row.append(near[1], src, near[0], far);
    body.append(row);
    fire('pointerdown', src, 250, 20, { pointerType: 'touch' });
    step(20);
    fire('pointerup', src, 250, 20, { pointerType: 'touch' });
    off();
    expect(releases).toHaveLength(1);
    const ev = releases[0] as { el: unknown; energy: number; x: number };
    expect(ev.el).toBe(src);
    expect(ev.x).toBe(250);
    expect(ev.energy).toBeGreaterThan(0);
    expect(ev.energy).toBeLessThanOrEqual(1);
    step(4);
    for (const n of near) {
      expect(n.hasAttribute('data-jelly-body')).toBe(true);
      expect(n.style.scale).toBe('1 1');
    }
    expect(far.hasAttribute('data-jelly-body')).toBe(false);
    settle();
    expect([src, far, ...near].every(inlineClean)).toBe(true);
  });

  it('no nudge right after a scroll, and a scroll-cancelled press announces nothing', () => {
    install();
    const releases: unknown[] = [];
    const off = jellyBus.on('body:release', (e) => releases.push(e));
    const row = make('div');
    const src = make('button', { box: { left: 200, top: 0, width: 100, height: 40 } });
    const nb = make('button', { box: { left: 310, top: 0, width: 100, height: 40 } });
    row.append(src, nb);
    body.append(row);
    fire('pointerdown', src, 250, 20, { pointerType: 'touch' });
    step(20);
    fire('scroll', null);
    fire('pointerup', src, 250, 20, { pointerType: 'touch' });
    step(4);
    expect(nb.hasAttribute('data-jelly-body')).toBe(false);
    // Slop cancel: the press is released silently.
    fire('pointerdown', src, 250, 20, { pointerType: 'touch' });
    step(5);
    releases.length = 0;
    fire('pointermove', src, 250, 60, { pointerType: 'touch' });
    expect(src.hasAttribute('data-jelly-active')).toBe(false);
    expect(releases).toHaveLength(0);
    off();
    settle();
  });

  it('an arc strike kicks the struck element by ≤ 1.5px and settles', () => {
    install();
    const card = make('div', { cls: ['glass-fill'] });
    body.append(card);
    jellyBus.emit('arc:strike', {
      el: card as unknown as Element,
      x: 0,
      y: 0,
      nx: 1,
      ny: 0,
      energy: 1,
      kind: 'click',
    });
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      step(1);
      const m = /^(-?[\d.]+)px/.exec(card.style.translate);
      if (m) peak = Math.max(peak, Math.abs(Number(m[1])));
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(1.5 + 1e-6);
    settle();
    expect(inlineClean(card)).toBe(true);
  });

  it('stacked strikes on an untouched neighbour still move it ≤ 1.5px in total', () => {
    install();
    const card = make('div', { cls: ['glass-fill'] });
    body.append(card);
    const hit = () =>
      jellyBus.emit('arc:strike', {
        el: card as unknown as Element,
        x: 0,
        y: 0,
        nx: 1,
        ny: 0,
        energy: 1,
        kind: 'click',
      });
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      if (i < 4) hit();
      step(1);
      const m = /^(-?[\d.]+)px(?: (-?[\d.]+)px)?/.exec(card.style.translate);
      if (m) peak = Math.max(peak, Math.hypot(Number(m[1]), Number(m[2] ?? 0)));
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx + 1e-6);
    settle();
    expect(inlineClean(card)).toBe(true);
  });

  it('drag owners: drag:start/drag:end on the bus and a scale-only stretch', () => {
    install();
    const events: string[] = [];
    const offs = [
      jellyBus.on('drag:start', () => events.push('start')),
      jellyBus.on('drag:end', () => events.push('end')),
    ];
    const sheet = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 0, width: 300, height: 300 },
    });
    body.append(sheet);
    sheet.style.translate = '0 40px'; // the owner's own translation
    for (let i = 0; i < 6; i++) {
      reportJellyDrag(sheet as unknown as HTMLElement, 0, 1800, 'move');
      step(1);
    }
    expect(sheet.style.translate).toBe('0 40px');
    const [sx, sy] = sheet.style.scale.split(' ').map(Number);
    expect(sy).toBeGreaterThan(1);
    expect(sx).toBeLessThan(1);
    reportJellyDrag(sheet as unknown as HTMLElement, 0, 0, 'end');
    settle();
    offs.forEach((f) => f());
    expect(events).toEqual(['start', 'end']);
    expect(sheet.style.scale).toBe('');
    expect(sheet.style.translate).toBe('0 40px');
  });

  it('hidden tab clears every body; teardown removes listeners and inline styles', () => {
    install();
    const a = make('button');
    const b = make('button');
    body.append(a, b);
    fire('pointerdown', a);
    step(5);
    doc.hidden = true;
    for (const fn of [...(docListeners.get('visibilitychange') ?? [])]) fn({});
    expect(inlineClean(a)).toBe(true);
    doc.hidden = false;
    for (const fn of [...(docListeners.get('visibilitychange') ?? [])]) fn({});
    fire('pointerdown', b, 50, 20, { pointerId: 2 });
    step(5);
    expect(b.hasAttribute('data-jelly-body')).toBe(true);
    teardown();
    teardown = () => {};
    expect(inlineClean(b)).toBe(true);
    for (const type of ['pointerdown', 'pointermove', 'pointerover', 'pointerup', 'scroll'])
      expect(docListeners.get(type)?.size ?? 0).toBe(0);
    for (const type of ['pointerdown', 'pointermove', 'pointerover', 'pointerup'])
      expect(winListeners.get(type)?.size ?? 0).toBe(0);
  });
});

// ── #989: dent, lens, plasma, Coulomb, the shared frame and pointer seams ──

describe('the press dent (#989)', () => {
  const card = () => {
    const el = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 0, width: 200, height: 100 },
    });
    body.append(el);
    return el;
  };
  const dent = (el: FakeEl) => dentOf(el as unknown as Element);

  it('sinks a Gaussian bowl at the contact point, host-local, easing to DENT.depthPx', () => {
    install();
    const el = card();
    fire('pointerdown', el, 60, 40);
    step(1);
    const first = dent(el)!;
    expect(first).not.toBeNull();
    expect(first.x).toBe(60);
    expect(first.y).toBe(40);
    expect(first.depth).toBeGreaterThan(0);
    expect(first.depth).toBeLessThan(DENT.depthPx);
    expect(first.radius).toBeCloseTo(
      Math.min(DENT.maxRadiusPx, Math.max(DENT.minRadiusPx, DENT.radiusFrac * 100)),
    );
    // Held and arrived (dent, squash and plasma): the driver sleeps until the pointer moves again.
    expect(settle()).toBeLessThan(200);
    const held = dent(el)!;
    expect(held.depth).toBeCloseTo(DENT.depthPx, 1);
    expect(held.stretchX).toBe(0);
    expect(el.hasAttribute('data-jelly-active')).toBe(true);
    fire('pointerup', el, 60, 40);
    settle();
  });

  it('slides with a mouse drag (a mouse press is not cancelled by the scroll slop)', () => {
    install();
    const el = card();
    fire('pointerdown', el, 60, 40);
    step(10);
    fire('pointermove', el, 150, 70);
    step(1);
    expect(el.hasAttribute('data-jelly-active')).toBe(true);
    expect(dent(el)).toMatchObject({ x: 150, y: 70 });
    fire('pointerup', el, 150, 70);
    settle();
    expect(dent(el)).toBeNull();
  });

  it('dragged off the element: rubber-band stretch capped at DENT.rubberMaxPx, host inside MOTION_BOUNDS', () => {
    install();
    const el = card();
    fire('pointerdown', el, 150, 50);
    step(10);
    let maxStretch = 0;
    for (const x of [230, 300, 600, 5000]) {
      fire('pointermove', el, x, 50);
      for (let i = 0; i < 30; i++) {
        step(1);
        const d = dent(el)!;
        expect(d.x).toBe(200);
        maxStretch = Math.max(maxStretch, Math.hypot(d.stretchX, d.stretchY));
        // The jelly part is capped at 3% around the legacy press anchor (0.96…1.028, envelope.ts §Caps).
        for (const v of el.style.scale.split(' ').map(Number)) {
          expect(v).toBeLessThanOrEqual(1.028 * (1 + MOTION_BOUNDS.maxScaleDelta) + 1e-9);
          expect(v).toBeGreaterThanOrEqual(0.96 * (1 - MOTION_BOUNDS.maxScaleDelta) - 1e-9);
        }
        const tx = Number(/^(-?[\d.]+)px/.exec(el.style.translate)?.[1] ?? 0);
        expect(Math.abs(tx)).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx / 2 + 1e-9);
      }
    }
    const d = dent(el)!;
    expect(d.stretchX).toBeGreaterThan(DENT.rubberMaxPx * 0.9);
    expect(maxStretch).toBeLessThanOrEqual(DENT.rubberMaxPx + 1e-6);
    expect(d.stretchY).toBeCloseTo(0, 6);
    // The envelope leans toward the stretch.
    expect(Number(/^(-?[\d.]+)px/.exec(el.style.translate)?.[1])).toBeGreaterThan(0.5);
    fire('pointerup', el, 5000, 50);
    settle();
    expect(dent(el)).toBeNull();
    expect(inlineClean(el)).toBe(true);
  });

  it('eases out on release, then setDent(el, null), and the lens is removed with the style restored', () => {
    const { lens, svgBody } = svgLens();
    install({ lens });
    const el = card();
    fire('pointerdown', el, 60, 40);
    step(20);
    expect(lens.host).toBe(el);
    expect(el.style.filter).toMatch(/^url\(#jelly-lens-\d+\)$/);
    expect(svgBody.children).toHaveLength(1);
    fire('pointerup', el, 60, 40);
    let prev = Infinity;
    while (frames.length) {
      step(1);
      const d = dent(el);
      if (!d) break;
      expect(d.depth).toBeLessThanOrEqual(prev + 1e-9);
      prev = d.depth;
    }
    settle();
    expect(dent(el)).toBeNull();
    expect(lens.host).toBeNull();
    expect(el.style.filter).toBe('');
    expect(inlineClean(el)).toBe(true);
  });

  it('the lens holds at most ONE host; a host with a filter of its own is never refracted', () => {
    const { lens } = svgLens();
    install({ lens });
    const a = card();
    const b = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 200, width: 200, height: 100 },
    });
    const c = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 400, width: 200, height: 100 },
    });
    c.computed.filter = 'drop-shadow(0 0 1px red)';
    body.append(b, c);
    fire('pointerdown', a, 60, 40, { pointerId: 1 });
    step(10);
    expect(lens.host).toBe(a);
    fire('pointerdown', b, 60, 240, { pointerId: 2 });
    step(10);
    expect(lens.host).toBe(b);
    expect(a.style.filter).toBe('');
    fire('pointerup', b, 60, 240, { pointerId: 2 });
    fire('pointerup', a, 60, 40, { pointerId: 1 });
    settle();
    fire('pointerdown', c, 60, 440, { pointerId: 3 });
    step(10);
    expect(dentOf(c as unknown as Element)).not.toBeNull();
    expect(lens.host).toBeNull();
    expect(c.style.filter).toBe('');
    fire('pointerup', c, 60, 440, { pointerId: 3 });
    settle();
    expect([a, b, c].every((e) => e.style.filter === '' && inlineClean(e))).toBe(true);
  });

  it('degrades: `still` keeps the dent (press feedback) without lens or stretch; a playing game has no dent', () => {
    const { lens } = svgLens();
    root.setAttribute('data-jelly-motion', 'still');
    install({ lens });
    const el = card();
    fire('pointerdown', el, 150, 50);
    step(10);
    fire('pointermove', el, 900, 50);
    step(20);
    expect(dent(el)!.depth).toBeGreaterThan(1);
    expect(dent(el)!.stretchX).toBe(0);
    expect(lens.host).toBeNull();
    fire('pointerup', el, 900, 50);
    settle();
    teardown();
    setup();
    root.setAttribute('data-game-state', 'playing');
    install();
    const g = card();
    fire('pointerdown', g, 60, 40);
    step(5);
    expect(dent(g)).toBeNull();
    expect(rafCalls).toBe(0);
  });

  it('drives the lattice of an admitted slab at the dent centre', () => {
    install();
    const pane = make('section', {
      cls: ['glass-pane'],
      attrs: { 'data-liquid-canvas': 'on' },
      box: { left: 100, top: 50, width: 400, height: 300 },
    });
    body.append(pane);
    fire('pointerdown', pane, 150, 60);
    step(2);
    fire('pointermove', pane, 300, 200);
    step(1);
    expect(latticeDrive(pane as unknown as Element)).toEqual({ kind: 'press', x: 200, y: 150 });
    expect(dentOf(pane as unknown as Element)).toMatchObject({ x: 200, y: 150 });
    fire('pointerup', pane, 300, 200);
    settle();
    expect(dentOf(pane as unknown as Element)).toBeNull();
    expect(latticeDrive(pane as unknown as Element)).toBeNull();
  });
});

describe('plasma:level (#989)', () => {
  const record = () => {
    const log: { el: unknown; level: number; frame: number }[] = [];
    let frame = 0;
    const off = jellyBus.on('plasma:level', ({ el, level }) => log.push({ el, level, frame }));
    return {
      log,
      off,
      step(n = 1) {
        for (let i = 0; i < n; i++) {
          frame++;
          step(1);
        }
      },
    };
  };

  it('wakes on hover, brightens on press, eases back, rests — stepped ≥ 0.02, once per frame', () => {
    install();
    const el = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 0, width: 200, height: 100 },
    });
    body.append(el);
    const r = record();
    fire('pointerover', el, 100, 50);
    r.step(60);
    expect(r.log.at(-1)!.level).toBe(PLASMA.wake);
    expect(Math.max(...r.log.map((e) => e.level))).toBe(PLASMA.wake);
    fire('pointerdown', el, 100, 50);
    r.step(60);
    expect(r.log.at(-1)!.level).toBe(PLASMA.press);
    fire('pointerup', el, 100, 50);
    r.step(60);
    expect(r.log.at(-1)!.level).toBe(PLASMA.wake);
    fire('pointermove', body, 900, 900);
    while (frames.length) r.step(1);
    r.off();
    expect(r.log.at(-1)!.level).toBe(PLASMA.rest);
    // Once per frame per element, and every step is ≥ 0.02 unless it is the arrival at a target.
    const frames_ = r.log.map((e) => e.frame);
    expect(new Set(frames_).size).toBe(frames_.length);
    const targets = new Set<number>([PLASMA.rest, PLASMA.wake, PLASMA.press]);
    for (let i = 1; i < r.log.length; i++) {
      const d = Math.abs(r.log[i].level - r.log[i - 1].level);
      if (!targets.has(r.log[i].level)) expect(d).toBeGreaterThanOrEqual(0.02);
    }
    expect(r.log.every((e) => e.el === el)).toBe(true);
  });

  it('plasmaEaseFactor is frame-rate independent: n steps of dt compose to one step of n·dt', () => {
    expect(plasmaEaseFactor(0)).toBe(0);
    expect(plasmaEaseFactor(-5)).toBe(0);
    expect(plasmaEaseFactor(Number.NaN)).toBe(0);
    expect(plasmaEaseFactor(3 * PLASMA.easeMs)).toBeGreaterThanOrEqual(0.95);
    for (const hz of [3, 10, 30, 60, 144]) {
      const dt = 1000 / hz;
      let level = 0;
      for (let t = 0; t + dt <= 3 * PLASMA.easeMs + 1e-9; t += dt)
        level += (1 - level) * plasmaEaseFactor(dt);
      const steps = Math.floor((3 * PLASMA.easeMs + 1e-9) / dt);
      expect(level).toBeCloseTo(plasmaEaseFactor(steps * dt), 10);
    }
  });

  /**
   * The e2e on software GL saw ~1.8 s to reach 0.95 against a 180 ms time constant: the level eased by the frame's
   * `dt`, which is capped at 250 ms and reads 1/60 s on the first frame after a wake, so slow frames stalled it. It now
   * eases by real elapsed time from the input: the level crosses 0.95 of its target at 3·easeMs of wall time at any
   * frame rate. The bus announces it in steps of ≥ 0.02, so the first ANNOUNCED level ≥ 0.95 may trail to ~0.97
   * (3.5·easeMs), plus at most one frame of quantization.
   */
  it.each([3, 10, 30, 60, 144])(
    'press reaches ≥ 0.95 of PLASMA.press within ~3·easeMs of real time at %i Hz',
    (hz) => {
      install();
      const el = make('div', {
        cls: ['glass-fill'],
        box: { left: 0, top: 0, width: 200, height: 100 },
      });
      body.append(el);
      const r = record();
      const ms = 1000 / hz;
      const t0 = clock;
      fire('pointerdown', el, 100, 50);
      let at = Infinity;
      while (clock - t0 < 10 * PLASMA.easeMs && frames.length) {
        step(1, ms);
        if ((r.log.filter((e) => e.el === el).at(-1)?.level ?? 0) >= 0.95 * PLASMA.press) {
          at = clock - t0;
          break;
        }
      }
      r.off();
      expect(at).toBeLessThanOrEqual(3.5 * PLASMA.easeMs + ms);
      // …and no faster than the time constant allows (no snap on the first frame, no skipped ease).
      expect(at).toBeGreaterThanOrEqual(3 * PLASMA.easeMs - ms);
      const first = r.log.find((e) => e.el === el)!.level;
      expect(first).toBeLessThanOrEqual(plasmaEaseFactor(ms) + 1e-9);
      fire('pointerup', el, 100, 50);
      while (frames.length) step(1, ms);
    },
  );

  it('keyboard focus-visible and click brighten to PLASMA.press, then rest; a pointer focus does not', () => {
    install();
    const btn = make('button');
    body.append(btn);
    const r = record();
    fire('keydown', null);
    fire('focusin', btn);
    r.step(60);
    expect(r.log.at(-1)!.level).toBe(PLASMA.press);
    fire('focusout', btn);
    while (frames.length) r.step(1);
    expect(r.log.at(-1)!.level).toBe(PLASMA.rest);
    r.log.length = 0;
    fire('click', btn);
    while (frames.length) r.step(1);
    expect(Math.max(...r.log.map((e) => e.level))).toBeGreaterThan(0.5);
    expect(r.log.at(-1)!.level).toBe(PLASMA.rest);
    r.log.length = 0;
    fire('pointerdown', body, 900, 900, { pointerType: 'touch' }); // pointer modality
    fire('focusin', btn);
    r.step(5);
    r.off();
    expect(r.log).toHaveLength(0);
  });

  it('no hover wake on a coarse pointer; disabled and opted-out hosts never wake', () => {
    fine = false;
    install();
    const card = make('div', { cls: ['glass-fill'] });
    const off = make('button', { attrs: { 'data-jelly': 'off' } });
    const dis = make('button', { attrs: { disabled: '' } });
    body.append(card, off, dis);
    const r = record();
    fire('pointerover', card);
    fire('click', off);
    fire('click', dis);
    r.step(10);
    r.off();
    expect(r.log).toHaveLength(0);
    expect(rafCalls).toBe(0);
  });
});

describe('charge:attract (#989 Coulomb)', () => {
  const pull = (el: FakeEl, force = 1) =>
    jellyBus.emit('charge:attract', { el: el as unknown as Element, nx: 1, ny: 0, force });

  it('a resting body passes it to its support: nothing moves, no frame', () => {
    install();
    const el = make('div', { cls: ['glass-fill'] });
    body.append(el);
    pull(el);
    expect(rafCalls).toBe(0);
    expect(inlineClean(el)).toBe(true);
  });

  it('an awake body gets a bounded translate toward the neighbour (≤ nudgePx), however often it is pulled', () => {
    install();
    const el = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 0, width: 200, height: 100 },
    });
    body.append(el);
    fire('pointerover', el, 100, 50); // centre: no lean
    settle();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      pull(el, 1);
      pull(el, 1);
      step(1);
      const tx = Number(/^(-?[\d.]+)px/.exec(el.style.translate)?.[1] ?? 0);
      peak = Math.max(peak, tx);
      expect(Math.abs(tx)).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx + 1e-6);
    }
    expect(peak).toBeGreaterThan(0.3);
    // Layout never changes: only `translate` moved, the scale stayed at the hover plump.
    fire('pointermove', body, 900, 900);
    settle();
    expect(inlineClean(el)).toBe(true);
  });
});

describe('one frame, one pointer listener set', () => {
  it('physics.ts never calls requestAnimationFrame itself', () => {
    const src = readFileSync(join(process.cwd(), 'lib/jelly/physics.ts'), 'utf8');
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/drive\(/);
    expect(src).toMatch(/onJellyPointer\(/);
    expect(src).not.toMatch(/addEventListener\('pointer/);
  });

  it('the frame driver sleeps at rest: no frame is pending once everything has settled', () => {
    install();
    const el = make('div', {
      cls: ['glass-fill'],
      box: { left: 0, top: 0, width: 200, height: 100 },
    });
    body.append(el);
    fire('pointerover', el, 100, 50);
    fire('pointerdown', el, 100, 50);
    step(30);
    fire('pointerup', el, 100, 50);
    fire('click', el);
    fire('pointermove', body, 900, 900);
    expect(settle()).toBeLessThan(600);
    expect(frames).toHaveLength(0);
    const before = rafCalls;
    fire('pointermove', body, 950, 950);
    fire('scroll', null);
    expect(rafCalls).toBe(before);
    expect(dentOf(el as unknown as Element)).toBeNull();
    expect(inlineClean(el)).toBe(true);
  });
});
