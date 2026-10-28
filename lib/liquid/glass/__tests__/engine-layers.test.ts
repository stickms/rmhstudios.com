/**
 * The engine's injected nodes vs React (testing/e2e/jelly-interaction.mjs). React's `setTextContent` — a `<Button>`
 * whose children become a lone string — wipes every child of the host, the engine's rim canvas (and a haze canvas)
 * included, while the host stays tracked and admitted. The engine must put the SAME canvases back (their last frame
 * survives, so the rim never blinks), keep `data-liquid-canvas="on"` truthful, and never draw into a detached canvas.
 *
 * Runs in the node environment against a tiny fake DOM; the WebGL renderer, the page snapshot and the scene store
 * are mocked (they are not what is under test). Frames and microtasks run only when the test steps them.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks: everything that would touch WebGL or capture the page ─────────────

interface DrawRec {
  target: FakeEl;
  attached: boolean;
  /** #989: what the draw carried (rings copied — the engine reuses its buffer). */
  plasma: { level: number; rings: number[] } | null;
  dent: unknown;
}
const draws: DrawRec[] = [];
const hazeDraws: Omit<DrawRec, 'dent'>[] = [];
type PlasmaArg = { level: number; rings: Float32Array } | null | undefined;
const plasmaRec = (p: PlasmaArg) => (p ? { level: p.level, rings: [...p.rings] } : null);

vi.mock('../renderer', () => ({
  GlassRenderer: {
    create: () => ({
      ready: true,
      hazeReady: true,
      onChange: null,
      draw: (o: { plasma?: PlasmaArg; dent?: unknown }, target: FakeEl) => {
        draws.push({
          target,
          attached: target.parentNode !== null,
          plasma: plasmaRec(o.plasma),
          dent: o.dent ?? null,
        });
        return true;
      },
      drawHaze: (o: { plasma?: PlasmaArg }, _t: number, target: FakeEl) => {
        hazeDraws.push({
          target,
          attached: target.parentNode !== null,
          plasma: plasmaRec(o.plasma),
        });
        return true;
      },
      setScene: () => true,
      dispose: () => {},
    }),
  },
}));
vi.mock('../scene', () => ({
  createSceneProvider: () => ({ request() {}, reset() {}, dispose() {}, failures: 0 }),
}));
vi.mock('../scene-store', () => ({
  clearScene: () => {},
  publishScene: () => Promise.resolve(),
  currentScene: () => null,
  onSceneChange: () => () => {},
}));

import { jellyBus } from '@/lib/jelly/bus';
import { setDent } from '@/lib/jelly/lattice-inputs';
import { installJellyRegistry } from '@/lib/jelly/registry';
import { CHARGE, PLASMA } from '@/lib/jelly/tiers';
import { ringLifetimeMs } from '../policy';
import { installLiquidGlass, pulse } from '../engine';

// ── A tiny fake DOM ───────────────────────────────────────────────────────────

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

/** tag, .class, [attr], [attr="v"], [attr~="v"], :disabled, :not(...) — enough for the engine and tiers selectors. */
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
      if (!el.classes.has(m[1]!)) return false;
    } else if ((m = /^\[([\w-]+)(?:(~?)="([^"]*)")?\]/.exec(rest))) {
      const v = el.getAttribute(m[1]!);
      if (v === null) return false;
      if (m[3] !== undefined) {
        if (m[2] === '~' ? !v.split(/\s+/).includes(m[3]) : v !== m[3]) return false;
      }
    } else if ((m = /^:not\((.+?)\)/.exec(rest))) {
      if (matchCompound(el, m[1]!)) return false;
    } else if ((m = /^:disabled/.exec(rest))) {
      if (!el.attrs.has('disabled')) return false;
    } else throw new Error(`fake DOM cannot match "${sel}"`);
    rest = rest.slice(m[0].length);
  }
  return true;
}

function matchOne(el: FakeEl, sel: string): boolean {
  // Descendant combinator: `A B`.
  const parts = sel.trim().split(/\s+/);
  if (!matchCompound(el, parts.pop()!)) return false;
  let anc = el.parentNode;
  for (let i = parts.length - 1; i >= 0; i--) {
    while (anc && !matchCompound(anc, parts[i]!)) anc = anc.parentNode;
    if (!anc) return false;
    anc = anc.parentNode;
  }
  return true;
}

class FakeStyle {
  cssText = '';
  props = new Map<string, string>();
  setProperty(k: string, v: string) {
    this.props.set(k, v);
  }
  removeProperty(k: string) {
    this.props.delete(k);
  }
  getPropertyValue(k: string) {
    return this.props.get(k) ?? '';
  }
}

class FakeEl {
  nodeType = 1;
  parentNode: FakeEl | null = null;
  childNodes: FakeEl[] = [];
  attrs = new Map<string, string>();
  classes = new Set<string>();
  style = new FakeStyle();
  isText = false;
  /** Custom properties the host's computed style reports (the jelly knobs). */
  vars: Record<string, string> = {};
  constructor(public tag: string) {}
  get tagName() {
    return this.tag.toUpperCase();
  }
  set className(v: string) {
    this.classes = new Set(v.split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this.classes].join(' ');
  }
  get classList() {
    return { contains: (c: string) => this.classes.has(c) };
  }
  get isConnected(): boolean {
    return this === docRoot || (this.parentNode?.isConnected ?? false);
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get children() {
    return this.childNodes.filter((c) => !c.isText);
  }
  get childElementCount() {
    return this.children.length;
  }
  get clientWidth() {
    return 120;
  }
  get clientHeight() {
    return 44;
  }
  clientLeft = 0;
  clientTop = 0;
  getAttribute(k: string) {
    if (k === 'class') return this.className || null;
    return this.attrs.get(k) ?? null;
  }
  setAttribute(k: string, v: string) {
    if (k === 'class') this.className = v;
    else this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.getAttribute(k) !== null;
  }
  matches(sel: string) {
    if (this.isText) return false;
    return splitList(sel).some((s) => matchOne(this, s));
  }
  closest(sel: string): FakeEl | null {
    if (this.matches(sel)) return this;
    return this.parentNode?.closest(sel) ?? null;
  }
  contains(o: FakeEl | null): boolean {
    let n = o;
    while (n) {
      if (n === this) return true;
      n = n.parentNode;
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
  querySelector(sel: string) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  append(...kids: FakeEl[]) {
    for (const k of kids) this.insertBefore(k, null);
  }
  insertBefore(node: FakeEl, ref: FakeEl | null) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    record(this, [node], []);
    return node;
  }
  removeChild(node: FakeEl) {
    this.childNodes = this.childNodes.filter((c) => c !== node);
    node.parentNode = null;
    record(this, [], [node]);
    return node;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  /** React's setTextContent: every child goes, one text node comes. */
  set textContent(v: string) {
    const gone = [...this.childNodes];
    for (const c of gone) {
      c.parentNode = null;
    }
    const t = new FakeEl('#text');
    t.isText = true;
    t.nodeType = 3;
    void v;
    t.parentNode = this;
    this.childNodes = [t];
    record(this, [t], gone);
  }
  getBoundingClientRect() {
    return { left: 10, top: 10, right: 130, bottom: 54, width: 120, height: 44 };
  }
}

// ── Observers and the window ──────────────────────────────────────────────────

type Rec = { type: string; target: FakeEl; addedNodes: FakeEl[]; removedNodes: FakeEl[] };
let mutationObservers: { cb: (r: Rec[]) => void; childList: boolean; queue: Rec[] }[] = [];
let intersectionObservers: { cb: (r: unknown[]) => void; observed: Set<FakeEl> }[] = [];
let rafQueue: Array<(t: number) => void> = [];
let resizeQueue: Array<() => void> = [];
let clock = 0;
let docRoot: FakeEl;
let body: FakeEl;
let win: Record<string, unknown>;
let doc: Record<string, unknown>;

function record(target: FakeEl, added: FakeEl[], removed: FakeEl[]) {
  if (!target.isConnected && !removed.length) return;
  for (const o of mutationObservers)
    if (o.childList)
      o.queue.push({ type: 'childList', target, addedNodes: added, removedNodes: removed });
}

/** Deliver queued mutation records (what the browser does at the microtask checkpoint), then run microtasks. */
async function flush() {
  for (let i = 0; i < 4; i++) {
    const sized = resizeQueue;
    resizeQueue = [];
    for (const fn of sized) fn();
    for (const o of mutationObservers) {
      if (!o.queue.length) continue;
      const q = o.queue;
      o.queue = [];
      o.cb(q);
    }
    await Promise.resolve();
    vi.advanceTimersByTime(40); // the registry's 32ms mutation settle
    await Promise.resolve();
  }
}

/** Run queued animation frames, `ms` apart. */
async function frames(n = 3, ms = 33) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue;
    rafQueue = [];
    clock += ms;
    for (const cb of q) cb(clock);
    await flush();
  }
}

/** Every observed element is on screen. */
function showAll() {
  for (const io of intersectionObservers)
    io.cb(
      [...io.observed].map((el) => ({
        target: el,
        isIntersecting: true,
        boundingClientRect: el.getBoundingClientRect(),
      })),
    );
}

function setup() {
  mutationObservers = [];
  intersectionObservers = [];
  rafQueue = [];
  resizeQueue = [];
  clock = 1000;
  draws.length = 0;
  hazeDraws.length = 0;
  docRoot = new FakeEl('html');
  body = new FakeEl('body');
  docRoot.childNodes.push(body);
  body.parentNode = docRoot;
  const listeners = { addEventListener() {}, removeEventListener() {} };
  class MO {
    rec = { cb: (_r: Rec[]) => {}, childList: false, queue: [] as Rec[] };
    constructor(cb: (r: Rec[]) => void) {
      this.rec.cb = cb;
      mutationObservers.push(this.rec);
    }
    observe(_t: unknown, opts: { childList?: boolean }) {
      this.rec.childList = !!opts?.childList;
    }
    disconnect() {
      this.rec.childList = false;
    }
  }
  class IO {
    rec = { cb: (_r: unknown[]) => {}, observed: new Set<FakeEl>() };
    constructor(cb: (r: unknown[]) => void) {
      this.rec.cb = cb;
      intersectionObservers.push(this.rec);
    }
    observe(el: FakeEl) {
      this.rec.observed.add(el);
    }
    unobserve(el: FakeEl) {
      this.rec.observed.delete(el);
    }
    disconnect() {
      this.rec.observed.clear();
    }
  }
  /** Like the browser: an observed element reports its size once, at the next checkpoint. */
  class RO {
    constructor(private cb: (r: { target: FakeEl }[]) => void) {}
    observe(el: FakeEl) {
      resizeQueue.push(() => this.cb([{ target: el }]));
    }
    unobserve() {}
    disconnect() {}
  }
  win = {
    ...listeners,
    WebGL2RenderingContext: class {},
    HTMLElement: FakeEl,
    IntersectionObserver: IO,
    ResizeObserver: RO,
    MutationObserver: MO,
    navigator: { hardwareConcurrency: 8 },
    location: { pathname: '/', search: '' },
    innerWidth: 1000,
    innerHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    performance: { now: () => clock },
    matchMedia: (q: string) => ({
      matches: q === '(hover: hover) and (pointer: fine)',
      addEventListener() {},
      removeEventListener() {},
    }),
    requestAnimationFrame: (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancelAnimationFrame: () => {},
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    getComputedStyle: (el: FakeEl) => ({
      position: 'relative',
      borderTopWidth: '1px',
      borderTopLeftRadius: '12px',
      backgroundColor: 'rgba(255, 255, 255, 0.4)',
      getPropertyValue: (k: string) => el.vars?.[k] ?? '',
    }),
  };
  doc = {
    ...listeners,
    defaultView: win,
    documentElement: docRoot,
    body,
    hidden: false,
    hasFocus: () => true,
    createElement: (tag: string) => new FakeEl(tag),
    querySelector: (sel: string) => docRoot.querySelector(sel),
  };
}

let stops: Array<() => void> = [];

async function install() {
  stops.push(installJellyRegistry(doc as unknown as Document));
  stops.push(installLiquidGlass(doc as unknown as Document));
  await flush();
  showAll();
  await flush();
  await frames();
}

const rimOf = (el: FakeEl) => el.children.find((c) => c.matches('canvas[data-liquid-glass]'));
const hazeOf = (el: FakeEl) => el.children.find((c) => c.classes.has('jelly-haze-canvas'));

beforeEach(() => {
  vi.useFakeTimers();
  setup();
});
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
  vi.useRealTimers();
});

describe('engine layers vs React setTextContent', () => {
  it('a flat tab group admits its track, never separate rims for its opted-out members', async () => {
    const group = new FakeEl('div');
    group.className = 'glass-inset';
    const nav = new FakeEl('nav');
    nav.setAttribute('data-jelly-scope', 'off');
    const tab = new FakeEl('div');
    tab.setAttribute('data-evert', '');
    const button = new FakeEl('button');
    button.setAttribute('data-slot', 'button');
    nav.append(tab);
    tab.append(button);
    group.append(nav);
    body.append(group);
    await install();
    expect(rimOf(group)).toBeDefined();
    expect(rimOf(tab)).toBeUndefined();
    expect(rimOf(button)).toBeUndefined();
  });

  it('a static control keeps its positioning ownership when a theme re-measures the material', async () => {
    const logo = new FakeEl('div');
    logo.className = 'glass-inset';
    body.append(logo);
    const original = win.getComputedStyle as (el: FakeEl) => Record<string, unknown>;
    win.getComputedStyle = (el: FakeEl) => ({
      ...original(el),
      position: el === logo && !logo.hasAttribute('data-liquid-static') ? 'static' : 'relative',
    });
    await install();
    expect(logo.hasAttribute('data-liquid-static')).toBe(true);
    for (let i = 0; i < 3; i++) {
      for (const observer of mutationObservers) observer.cb([]);
      await frames();
      expect(logo.hasAttribute('data-liquid-static')).toBe(true);
      expect(rimOf(logo)?.parentNode).toBe(logo);
    }
  });

  it('a <Button> whose text is replaced gets its SAME rim canvas back and never draws into a detached one', async () => {
    const btn = new FakeEl('button');
    btn.setAttribute('data-slot', 'button');
    body.append(btn);
    btn.textContent = 'Save';
    await install();
    const rim = rimOf(btn);
    expect(rim).toBeDefined();
    expect(btn.getAttribute('data-liquid-canvas')).toBe('on');

    // "Save" → "Saved", icon → text, text → text: each wipes every child, ours included.
    for (const label of ['Saved', 'Save', 'Done']) {
      btn.textContent = label;
      expect(rimOf(btn)).toBeUndefined();
      await flush();
      expect(rimOf(btn)).toBe(rim); // the same node: its last frame survives, no blink
      expect(btn.getAttribute('data-liquid-canvas')).toBe('on');
      expect(btn.childNodes.at(-1)).toBe(rim); // still the host's last child
    }
    draws.length = 0;
    // A pointer move asks for a rim frame: it must land in the attached canvas.
    await frames();
    expect(draws.every((d) => d.attached)).toBe(true);
  });

  it('a frame that lands before the repair never draws into the detached canvas, and schedules the repair', async () => {
    const btn = new FakeEl('button');
    btn.setAttribute('data-slot', 'button');
    body.append(btn);
    btn.append(new FakeEl('span'));
    await install();
    const rim = rimOf(btn)!;
    btn.textContent = 'Text';
    // Lose the observer's records (defence in depth: the draw itself must not trust the canvas is attached).
    for (const o of mutationObservers) o.queue = [];
    draws.length = 0;
    pulse(btn as unknown as Element, 1); // asks for a rim frame that redraws this slab
    expect(rafQueue.length).toBeGreaterThan(0);
    const q = rafQueue;
    rafQueue = [];
    clock += 33;
    for (const cb of q) cb(clock);
    expect(draws.filter((d) => d.target === rim)).toHaveLength(0);
    await Promise.resolve(); // the reconcile the skipped draw scheduled
    expect(rim.parentNode).toBe(btn);
    expect(btn.getAttribute('data-liquid-canvas')).toBe('on');
    await frames();
    expect(draws.some((d) => d.target === rim && d.attached)).toBe(true);
    expect(draws.every((d) => d.attached)).toBe(true);
  });

  it('a pane whose children are wiped gets its haze canvas and rim back, haze before rim', async () => {
    const pane = new FakeEl('section');
    pane.className = 'glass-pane';
    pane.vars = { '--jelly-haze-a': '0.2', '--jelly-plasma-k': '0.3' };
    body.append(pane);
    pane.append(new FakeEl('p'));
    await install();
    const rim = rimOf(pane);
    const haze = hazeOf(pane);
    expect(rim).toBeDefined();
    expect(haze).toBeDefined();
    expect(pane.getAttribute('data-jelly-haze')).toBe('on');
    pane.textContent = 'plain text now';
    await flush();
    expect(hazeOf(pane)).toBe(haze);
    expect(rimOf(pane)).toBe(rim);
    const kids = pane.childNodes;
    expect(kids.indexOf(haze!)).toBeLessThan(kids.indexOf(rim!));
    hazeDraws.length = 0;
    await frames();
    expect(hazeDraws.every((d) => d.attached)).toBe(true);
  });

  it('a host removed from the document is deactivated, not repaired', async () => {
    const btn = new FakeEl('button');
    btn.setAttribute('data-slot', 'button');
    const wrap = new FakeEl('div');
    wrap.append(btn);
    body.append(wrap);
    btn.textContent = 'Go';
    await install();
    expect(rimOf(btn)).toBeDefined();
    wrap.remove();
    await flush();
    expect(rimOf(btn)).toBeUndefined();
    expect(btn.hasAttribute('data-liquid-canvas')).toBe(false);
  });
});

// ── #989 layers: dormant plasma, charge rings, the dent ──────────────────────

const lastDrawOf = (el: FakeEl) => {
  const rim = rimOf(el);
  return [...draws].reverse().find((d) => d.target === rim);
};
const lastHazeOf = (el: FakeEl) => {
  const haze = hazeOf(el);
  return [...hazeDraws].reverse().find((d) => d.target === haze);
};
async function button() {
  const btn = new FakeEl('button');
  btn.setAttribute('data-slot', 'button');
  body.append(btn);
  btn.append(new FakeEl('span'));
  await install();
  return btn;
}
/** Run frames until the driver stops asking (or `max` frames). */
async function settle(max = 80) {
  for (let i = 0; i < max && rafQueue.length; i++) await frames(1);
}

describe('#989 dormant plasma', () => {
  it('is 0 (nothing uploaded) at rest, eases up on a level, and back to nothing at rest', async () => {
    const btn = await button();
    expect(draws.filter((d) => d.target === rimOf(btn)).every((d) => d.plasma === null)).toBe(true);
    jellyBus.emit('plasma:level', { el: btn as unknown as Element, level: 1 });
    await frames(1);
    const first = lastDrawOf(btn)!.plasma!.level;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.5); // eased, not stepped
    await frames(1);
    expect(lastDrawOf(btn)!.plasma!.level).toBeGreaterThan(first);
    await settle();
    expect(lastDrawOf(btn)!.plasma!.level).toBe(1);
    expect(rafQueue).toHaveLength(0); // settled: no frames at a steady level
    jellyBus.emit('plasma:level', { el: btn as unknown as Element, level: 0 });
    await settle();
    expect(lastDrawOf(btn)!.plasma).toBeNull();
    expect(rafQueue).toHaveLength(0);
  });

  /**
   * Frame-rate independence (F2): the engine caps its frame `dt` at 50 ms, and on software GL frames take far longer,
   * so easing by `dt` stalled the plasma several-fold. It eases by real elapsed time since the level last advanced
   * (or since the bus level arrived), so it crosses 0.95 of the target by 3·easeMs of wall time at any frame rate.
   */
  it.each([3, 10, 30, 60, 144])('reaches 0.95 of a bus level by ~3·easeMs at %i Hz', async (hz) => {
    const btn = await button();
    const ms = 1000 / hz;
    const t0 = clock;
    jellyBus.emit('plasma:level', { el: btn as unknown as Element, level: 1 });
    let at = Infinity;
    for (let i = 0; i < 400 && rafQueue.length; i++) {
      await frames(1, ms);
      if ((lastDrawOf(btn)?.plasma?.level ?? 0) >= 0.95) {
        at = clock - t0;
        break;
      }
    }
    expect(at).toBeLessThanOrEqual(3 * PLASMA.easeMs + ms);
    expect(at).toBeGreaterThanOrEqual(3 * PLASMA.easeMs - ms);
  });

  it('a haze slot draws its plasma in the haze program, not the rim', async () => {
    const pane = new FakeEl('section');
    pane.className = 'glass-pane';
    pane.vars = { '--jelly-haze-a': '0.2', '--jelly-plasma-k': '0.3' };
    body.append(pane);
    pane.append(new FakeEl('p'));
    await install();
    expect(hazeOf(pane)).toBeDefined();
    expect(lastHazeOf(pane)!.plasma).toBeNull();
    jellyBus.emit('plasma:level', { el: pane as unknown as Element, level: 0.35 });
    await frames(3);
    expect(lastHazeOf(pane)!.plasma!.level).toBeGreaterThan(0);
    expect(draws.filter((d) => d.target === rimOf(pane)).every((d) => d.plasma === null)).toBe(
      true,
    );
  });
});

describe('#989 charge rings', () => {
  it('a charge:pulse rings through the slab, then is gone within its bounded lifetime', async () => {
    const btn = await button();
    // Viewport (70, 32) is the centre of the fake host (rect 10,10 → 130,54).
    jellyBus.emit('charge:pulse', { el: btn as unknown as Element, x: 70, y: 32, q: 1 });
    await frames(1);
    const rings = lastDrawOf(btn)!.plasma!.rings;
    expect(rings[0]).toBeCloseTo(60);
    expect(rings[1]).toBeCloseTo(22);
    expect(rings[3]).toBeGreaterThan(0);
    expect(rings[3]).toBeLessThanOrEqual(1);
    await frames(1);
    const later = lastDrawOf(btn)!.plasma!.rings;
    expect(later[2]).toBeGreaterThan(rings[2]!); // the front travels outward
    expect(later[3]).toBeLessThan(rings[3]!); // and decays
    const t0 = clock;
    await settle(120);
    expect(rafQueue).toHaveLength(0);
    expect(clock - t0).toBeLessThanOrEqual(ringLifetimeMs(1) + 100);
    expect(lastDrawOf(btn)!.plasma).toBeNull();
  });

  it('keeps at most three rings per surface however fast charges land', async () => {
    const btn = await button();
    for (let i = 0; i < 10; i++) {
      jellyBus.emit('charge:pulse', { el: btn as unknown as Element, x: 15 + i * 10, y: 20, q: 1 });
      clock += 70; // not twins
    }
    await frames(1);
    const r = lastDrawOf(btn)!.plasma!.rings;
    const live = [0, 1, 2, 3].filter((i) => r[i * 4 + 3]! > 0).length;
    expect(live).toBeLessThanOrEqual(3);
    expect(CHARGE.pulseTauMs).toBeGreaterThan(0);
  });
});

describe('#989 dent', () => {
  it('dent uniforms are set only while dentOf is non-null', async () => {
    const btn = await button();
    expect(draws.filter((d) => d.target === rimOf(btn)).every((d) => d.dent === null)).toBe(true);
    const dent = { x: 40, y: 20, depth: 3, radius: 14, stretchX: 0, stretchY: 0 };
    setDent(btn as unknown as Element, dent);
    await frames(1);
    expect(lastDrawOf(btn)!.dent).toMatchObject({ x: 40, y: 20, radius: 14, depth: 0.5 });
    setDent(btn as unknown as Element, null);
    await frames(1);
    expect(lastDrawOf(btn)!.dent).toBeNull();
    const n = draws.length;
    await settle();
    expect(draws.slice(n).every((d) => d.dent === null)).toBe(true);
  });
});
