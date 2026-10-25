/**
 * The carrier service's contract: the W1-D DOM shape (first child, aria-hidden, per-host phase, two spans, rim-only
 * on field wrappers), the budget (count, animated area, haze canvases excluded), offscreen park-then-detach, the
 * still/degraded detach, the wide-host speed cap, React safety (no carrier on text-only hosts, self-heal), the
 * `html[data-scrolling]` ownership rule, and a teardown that leaves nothing behind. No rAF anywhere.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJellyBus, type JellyBus } from '../bus';
import {
  OFFSCREEN_DETACH_MS,
  cappedFlowSpeed,
  CARRIER_IDLE_ATTR,
  CARRIER_MAX_SPEED,
  CARRIER_MIN_DRIFT_PX_S,
  driftPerSpeed,
  installJellyFlow,
  phaseFor,
} from '../flow-carriers';
import type { JellyEntry, JellyRegistry, JellyRole } from '../registry';
import { AMBIENT_BOUNDS, IDLE_AFTER_MS, JELLY_BUDGETS, type JellyBudget } from '../tiers';

// ── A tiny fake DOM ─────────────────────────────────────────────────────────

/** Matches comma lists of compound simple selectors: tag, .class, [attr], [attr="v"]. */
function matchesCompound(el: FakeEl, compound: string): boolean {
  const re = /(\.[\w-]+)|(\[[^\]]+\])|(^[a-z][\w-]*)/g;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(compound))) {
    any = true;
    if (m[1]) {
      if (!el.classes.has(m[1].slice(1))) return false;
    } else if (m[2]) {
      const body = m[2].slice(1, -1);
      const eq = body.indexOf('=');
      if (eq < 0) {
        if (!el.attrs.has(body)) return false;
      } else {
        const name = body.slice(0, eq);
        const value = body.slice(eq + 1).replace(/^["']|["']$/g, '');
        if (el.attrs.get(name) !== value) return false;
      }
    } else if (m[3]) {
      if (el.tagName.toLowerCase() !== m[3]) return false;
    }
  }
  return any;
}

class FakeStyle {
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
  position = 'relative';
  isText = false;
  constructor(
    public tagName: string,
    cls: string[] = [],
    attrs: Record<string, string> = {},
  ) {
    cls.forEach((c) => this.classes.add(c));
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
  }
  set className(v: string) {
    this.classes = new Set(v.split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this.classes].join(' ');
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
  get hidden() {
    return this.attrs.has('hidden');
  }
  set hidden(v: boolean) {
    if (v) this.attrs.set('hidden', '');
    else this.attrs.delete('hidden');
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  matches(sel: string) {
    return sel.split(',').some((s) => matchesCompound(this, s.trim()));
  }
  append(...kids: FakeEl[]) {
    for (const k of kids) this.insertBefore(k, null);
  }
  insertBefore(node: FakeEl, ref: FakeEl | null) {
    node.remove();
    node.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    return node;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
    this.parentNode = null;
  }
  /** React's setTextContent: wipes every child. */
  set textContent(v: string) {
    for (const c of [...this.childNodes]) c.remove();
    const t = new FakeEl('#text');
    t.isText = true;
    t.nodeType = 3;
    void v;
    this.insertBefore(t, null);
  }
  scrollHeight = 0;
  clientHeight = 0;
  scrollWidth = 0;
  clientWidth = 0;
}

let docRoot: FakeEl;
let body: FakeEl;
let doc: Document;
let docListeners: Map<string, Set<(e: Event) => void>>;
let budget: JellyBudget;
let bus: JellyBus;

function makeDoc() {
  docRoot = new FakeEl('html');
  body = new FakeEl('body');
  docRoot.append(body);
  docListeners = new Map();
  class MO {
    observe() {}
    disconnect() {}
  }
  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    MutationObserver: MO,
    getComputedStyle: (el: FakeEl) => ({ position: el.position }),
  };
  const d = {
    hidden: false,
    documentElement: docRoot,
    body,
    defaultView: win,
    createElement: (tag: string) => new FakeEl(tag.toUpperCase()),
    querySelector: () => null,
    addEventListener: (t: string, fn: (e: Event) => void) => {
      if (!docListeners.has(t)) docListeners.set(t, new Set());
      docListeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: (e: Event) => void) => docListeners.get(t)?.delete(fn),
  };
  doc = d as unknown as Document;
}

const fireDoc = (type: string, target: unknown) =>
  docListeners.get(type)?.forEach((fn) => fn({ target } as unknown as Event));

// ── A fake registry ─────────────────────────────────────────────────────────

class FakeRegistry {
  entries: JellyEntry[] = [];
  listeners = new Set<() => void>();
  scrolling = false;
  epoch = 0;
  visible() {
    return this.entries.filter((e) => e.visible);
  }
  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  change() {
    this.listeners.forEach((fn) => fn());
  }
}
let registry: FakeRegistry;
let order = 0;

function host(
  opts: {
    cls?: string[];
    attrs?: Record<string, string>;
    tag?: string;
    role?: JellyRole;
    rect?: { left: number; top: number; width: number; height: number };
    visible?: boolean;
    textOnly?: boolean;
  } = {},
) {
  const el = new FakeEl((opts.tag ?? 'div').toUpperCase(), opts.cls ?? ['glass-fill'], opts.attrs);
  if (opts.textOnly) el.textContent = 'Save';
  else el.append(new FakeEl('SPAN'));
  body.append(el);
  const entry: JellyEntry = {
    el: el as unknown as Element,
    role: opts.role ?? 'fill',
    order: order++,
    visible: opts.visible ?? true,
    rect: opts.rect ?? { left: 100, top: 100, width: 200, height: 100 },
  };
  registry.entries.push(entry);
  return { el, entry };
}

const carrierOf = (el: FakeEl) => el.childNodes.find((c) => c.classes.has('jelly-flow')) ?? null;

let stop: () => void = () => {};
function install() {
  stop = installJellyFlow(doc, {
    registry: registry as unknown as JellyRegistry,
    bus,
    budget: () => budget,
  });
  vi.advanceTimersByTime(1);
}
const settle = () => vi.advanceTimersByTime(1);

beforeEach(() => {
  vi.useFakeTimers();
  makeDoc();
  registry = new FakeRegistry();
  bus = createJellyBus();
  budget = { ...JELLY_BUDGETS.full };
  order = 0;
});
afterEach(() => {
  stop();
  stop = () => {};
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('carrier DOM contract (W1-D)', () => {
  it('injects one aria-hidden .jelly-flow as the FIRST child with a phase and two spans', () => {
    const { el } = host();
    install();
    const c = el.childNodes[0]!;
    expect(c.classes.has('jelly-flow')).toBe(true);
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(c.style.getPropertyValue('--jelly-phase')).toMatch(/^-\d+(\.\d+)?s$/);
    expect(c.childNodes.map((s) => s.className)).toEqual([
      'jelly-flow__drift',
      'jelly-flow__current',
    ]);
    expect(el.getAttribute('data-jelly-flow')).toBe('on');
  });

  it('seeds distinct phases from discovery order', () => {
    const a = host();
    const b = host();
    install();
    expect(carrierOf(a.el)!.style.getPropertyValue('--jelly-phase')).toBe(phaseFor(0));
    expect(carrierOf(b.el)!.style.getPropertyValue('--jelly-phase')).toBe(phaseFor(1));
    expect(phaseFor(0)).not.toBe(phaseFor(1));
    for (let i = 0; i < 50; i++) {
      const s = parseFloat(phaseFor(i));
      expect(s).toBeLessThanOrEqual(0);
      expect(s).toBeGreaterThan(-22);
    }
  });

  it('marks field wrappers rim-only and never touches input/textarea/void elements', () => {
    const field = host({ cls: ['glass-inset'], role: 'control' });
    const input = host({ tag: 'input', cls: [], attrs: { 'data-slot': 'input' }, role: 'control' });
    const textarea = host({
      tag: 'textarea',
      cls: [],
      attrs: { 'data-slot': 'textarea' },
      role: 'control',
    });
    const img = host({ tag: 'img', cls: ['glass-fill'] });
    install();
    expect(carrierOf(field.el)!.classes.has('jelly-flow--rim-only')).toBe(true);
    expect(carrierOf(input.el)).toBeNull();
    expect(carrierOf(textarea.el)).toBeNull();
    expect(carrierOf(img.el)).toBeNull();
  });

  it('skips ghost/link buttons, static hosts and data-jelly-flow="off"', () => {
    const ghost = host({ cls: [], attrs: { 'data-slot': 'button', 'data-variant': 'ghost' } });
    const off = host({ attrs: { 'data-jelly-flow': 'off' } });
    const stat = host();
    stat.el.position = 'static';
    install();
    expect(carrierOf(ghost.el)).toBeNull();
    expect(carrierOf(off.el)).toBeNull();
    expect(carrierOf(stat.el)).toBeNull();
  });
});

describe('React safety', () => {
  it('never gives a carrier to a text-only host (React setTextContent would wipe it)', () => {
    const { el } = host({ textOnly: true });
    install();
    expect(carrierOf(el)).toBeNull();
  });

  it('a <Button> going element → text → element: the wipe clears data-jelly-flow, the return re-attaches', () => {
    // Regression (testing/e2e/jelly-interaction.mjs): React's setTextContent deleted the carrier and the host kept
    // `data-jelly-flow="on"` (the floor stayed hidden behind a carrier that no longer existed). The registry now
    // notifies on a removed layer (registry.test.ts); the next pass must clear the attribute and forget the carrier.
    const { el } = host({ attrs: { 'data-slot': 'button' }, role: 'control' });
    install();
    expect(carrierOf(el)).not.toBeNull();
    expect(el.getAttribute('data-jelly-flow')).toBe('on');
    el.textContent = 'Saved'; // React: children became a lone string
    registry.change(); // the registry's lost-layer notification
    settle();
    expect(carrierOf(el)).toBeNull();
    expect(el.hasAttribute('data-jelly-flow')).toBe(false);
    expect(el.style.getPropertyValue('--jelly-flow-speed')).toBe('');
    // Text → element children (resetTextContent, then append): eligible again, one carrier, first child.
    el.textContent = '';
    for (const c of [...el.childNodes]) c.remove();
    el.append(new FakeEl('SPAN'));
    registry.change();
    settle();
    expect(el.childNodes.filter((c) => c.classes.has('jelly-flow'))).toHaveLength(1);
    expect(el.childNodes[0]!.classes.has('jelly-flow')).toBe(true);
    expect(el.getAttribute('data-jelly-flow')).toBe('on');
  });

  it("a text-only host holding only the engine's rim canvas is still text-only (no carrier)", () => {
    // Regression (testing/e2e/jelly-interaction.mjs): once the engine re-attaches its rim canvas after a React text
    // wipe, the canvas made `childElementCount` 1 and the next pass injected a carrier React would wipe again.
    const { el } = host({ attrs: { 'data-slot': 'button' }, role: 'control', textOnly: true });
    const rim = new FakeEl('CANVAS', ['liquid-glass-canvas'], { 'data-liquid-glass': '' });
    const haze = new FakeEl('CANVAS', ['jelly-haze-canvas']);
    el.append(haze, rim);
    install();
    expect(carrierOf(el)).toBeNull();
    expect(el.hasAttribute('data-jelly-flow')).toBe(false);
    // Real content arrives: now it carries one.
    el.insertBefore(new FakeEl('SPAN'), rim);
    registry.change();
    settle();
    expect(carrierOf(el)).not.toBeNull();
  });

  it('re-inserts a carrier removed from under it on the next pass', () => {
    const { el } = host();
    install();
    const c = carrierOf(el)!;
    c.remove();
    registry.change();
    settle();
    expect(el.childNodes[0]).toBe(c);
  });
});

describe('budget', () => {
  it('caps the live set at budget.carriers, ranked by role', () => {
    budget = { ...budget, carriers: 2 };
    const fill = host({ role: 'fill' });
    const overlay = host({ cls: ['glass-overlay'], role: 'overlay' });
    const chrome = host({ cls: ['glass-chrome'], role: 'chrome' });
    install();
    expect(carrierOf(overlay.el)).not.toBeNull();
    expect(carrierOf(chrome.el)).not.toBeNull();
    expect(carrierOf(fill.el)).toBeNull();
  });

  it('caps the animated area, counting haze canvases against it', () => {
    // Viewport 1000×800 = 800k px²; 1 viewport allowed.
    budget = { ...budget, animatedViewports: 1 };
    const haze = host({
      attrs: { 'data-jelly-haze': 'on' },
      rect: { left: 0, top: 0, width: 1000, height: 500 },
      role: 'pane',
    });
    const big = host({ rect: { left: 0, top: 0, width: 1000, height: 400 } });
    const small = host({ rect: { left: 0, top: 0, width: 300, height: 300 } });
    install();
    expect(carrierOf(haze.el)).toBeNull();
    expect(carrierOf(big.el)).toBeNull(); // 500k + 400k > 800k
    expect(carrierOf(small.el)).not.toBeNull(); // 500k + 90k fits
  });

  it('zero carriers (lite / still / game) attaches nothing', () => {
    budget = { ...JELLY_BUDGETS.lite };
    const { el } = host();
    install();
    expect(carrierOf(el)).toBeNull();
  });

  it('a haze:change hand-over detaches that host at once', () => {
    const { el } = host();
    install();
    expect(carrierOf(el)).not.toBeNull();
    el.setAttribute('data-jelly-haze', 'on');
    bus.emit('haze:change', { el: el as unknown as Element, on: true });
    expect(carrierOf(el)).toBeNull();
    expect(el.getAttribute('data-jelly-flow')).toBeNull();
    el.removeAttribute('data-jelly-haze');
    bus.emit('haze:change', { el: el as unknown as Element, on: false });
    settle();
    expect(carrierOf(el)).not.toBeNull();
  });

  it('does not attach while a scroll is in flight; scroll end re-ranks', () => {
    registry.scrolling = true;
    const { el } = host();
    install();
    expect(carrierOf(el)).toBeNull();
    registry.scrolling = false;
    registry.change();
    settle();
    expect(carrierOf(el)).not.toBeNull();
  });
});

describe('offscreen', () => {
  it('hides at once, detaches after 2 s, and reuses the node if it returns in time', () => {
    const { el, entry } = host();
    install();
    const c = carrierOf(el)!;
    entry.visible = false;
    registry.change();
    settle();
    expect(c.hidden).toBe(true);
    expect(el.getAttribute('data-jelly-flow')).toBeNull();
    vi.advanceTimersByTime(OFFSCREEN_DETACH_MS / 2);
    entry.visible = true;
    registry.change();
    settle();
    expect(carrierOf(el)).toBe(c);
    expect(c.hidden).toBe(false);

    entry.visible = false;
    registry.change();
    settle();
    vi.advanceTimersByTime(OFFSCREEN_DETACH_MS + 1);
    expect(carrierOf(el)).toBeNull();
  });
});

describe('ambient off', () => {
  it('detaches everything when jellyMotion becomes still', () => {
    const { el } = host();
    install();
    expect(carrierOf(el)).not.toBeNull();
    // jellyMode reads the attribute; the env watcher is a MutationObserver we cannot fire, so re-run via a pass.
    docRoot.setAttribute('data-jelly-motion', 'still');
    stop();
    stop = installJellyFlow(doc, {
      registry: registry as unknown as JellyRegistry,
      bus,
      budget: () => budget,
    });
    settle();
    expect(carrierOf(el)).toBeNull();
  });
});

describe('wide-host speed cap', () => {
  it('matches the CSS keyframes: ~10.5 px/s at 300 × 150, ~20.2 px/s at 600 × 200', () => {
    expect(driftPerSpeed(300, 150)).toBeCloseTo(10.5, 1);
    expect(driftPerSpeed(600, 200)).toBeCloseTo(20.2, 1);
  });

  it('leaves narrow hosts alone and caps wide ones to ≤ 12 px/s', () => {
    expect(cappedFlowSpeed(300, 150, 1)).toBeNull();
    const s = cappedFlowSpeed(1200, 300, 1)!;
    expect(s).toBeLessThan(1);
    expect(driftPerSpeed(1200, 300) * s).toBeLessThanOrEqual(AMBIENT_BOUNDS.maxDriftPxPerSecond);
    const tall = cappedFlowSpeed(800, 4000, 1)!;
    expect(driftPerSpeed(800, 4000) * tall).toBeLessThanOrEqual(AMBIENT_BOUNDS.maxDriftPxPerSecond);
  });

  it('speeds small hosts up to the drift floor, within the cap and the bound', () => {
    // A 110 × 40 button at its role speed (1.2) drifts ~4.4 px/s: lifted to the floor.
    const btn = cappedFlowSpeed(110, 40, 1.2)!;
    expect(btn).toBeGreaterThan(1.2);
    expect(driftPerSpeed(110, 40) * btn).toBeGreaterThanOrEqual(CARRIER_MIN_DRIFT_PX_S);
    expect(driftPerSpeed(110, 40) * btn).toBeLessThanOrEqual(AMBIENT_BOUNDS.maxDriftPxPerSecond);
    // A 24 px chip would need more than the cap: it stops at the cap (periods stay ≥ 6 s).
    expect(cappedFlowSpeed(24, 24, 1)).toBe(CARRIER_MAX_SPEED);
    expect(22 / CARRIER_MAX_SPEED).toBeGreaterThanOrEqual(AMBIENT_BOUNDS.minLuminancePeriodSeconds);
  });

  it('leaves mid-size hosts alone, writes --jelly-flow-speed on wide ones, removes it on detach', () => {
    const wide = host({
      cls: ['glass-pane'],
      role: 'pane',
      rect: { left: 0, top: 0, width: 1400, height: 300 },
    });
    const narrow = host();
    install();
    expect(wide.el.style.getPropertyValue('--jelly-flow-speed')).not.toBe('');
    expect(narrow.el.style.getPropertyValue('--jelly-flow-speed')).toBe('');
    stop();
    stop = () => {};
    expect(wide.el.style.getPropertyValue('--jelly-flow-speed')).toBe('');
  });
});

describe('idle cadence (R7: ≤ the idle clock at rest, never vsync)', () => {
  const withAnimation = (el: FakeEl, currentTime = 1000) => {
    const anim = { currentTime: currentTime as number | null };
    (carrierOf(el) as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [anim];
    return anim;
  };

  it('stamps html[data-jelly-idle] after IDLE_AFTER_MS and steps the paused carriers at the idle clock', () => {
    const a = host();
    install();
    const anim = withAnimation(a.el);
    vi.advanceTimersByTime(IDLE_AFTER_MS - 10);
    expect(docRoot.hasAttribute(CARRIER_IDLE_ATTR)).toBe(false);
    vi.advanceTimersByTime(20);
    expect(docRoot.hasAttribute(CARRIER_IDLE_ATTR)).toBe(true);
    // One second idle: the carriers keep moving at their real speed (each step adds the elapsed time) ...
    vi.advanceTimersByTime(1000);
    expect(anim.currentTime).toBeGreaterThan(1000 + 900);
    expect(anim.currentTime).toBeLessThanOrEqual(1000 + 1000 + 1);
  });

  it('steps at most idleClockHz times a second', () => {
    const a = host();
    install();
    const writes: number[] = [];
    const anim = {
      get currentTime() {
        return 0;
      },
      set currentTime(v: number) {
        writes.push(v);
      },
    };
    (carrierOf(a.el) as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [anim];
    vi.advanceTimersByTime(IDLE_AFTER_MS + 10);
    writes.length = 0;
    vi.advanceTimersByTime(1000);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.length).toBeLessThanOrEqual(JELLY_BUDGETS.full.idleClockHz);
  });

  it("rides the engine's ambient tick instead of a second clock", () => {
    const a = host();
    install();
    const anim = withAnimation(a.el, 0);
    vi.advanceTimersByTime(IDLE_AFTER_MS + 10);
    let writes = 0;
    let t = anim.currentTime as number;
    Object.defineProperty(anim, 'currentTime', {
      get: () => t,
      set: (v: number) => {
        writes++;
        t = v;
      },
    });
    // The engine ticks at the same rate; the carriers step on its frames and their own timer stands down.
    const hz = JELLY_BUDGETS.full.idleClockHz;
    for (let i = 0; i < hz; i++) {
      vi.advanceTimersByTime(1000 / hz);
      bus.emit('ambient:tick', {});
    }
    expect(writes).toBeGreaterThanOrEqual(hz);
    expect(writes).toBeLessThanOrEqual(hz + 1);
  });

  it('any input clears the stamp and stops the steps; teardown removes it', () => {
    const a = host();
    install();
    const anim = withAnimation(a.el);
    vi.advanceTimersByTime(IDLE_AFTER_MS + 10);
    expect(docRoot.hasAttribute(CARRIER_IDLE_ATTR)).toBe(true);
    fireDoc('keydown', body);
    expect(docRoot.hasAttribute(CARRIER_IDLE_ATTR)).toBe(false);
    const at = anim.currentTime;
    vi.advanceTimersByTime(500);
    expect(anim.currentTime).toBe(at);
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(docRoot.hasAttribute(CARRIER_IDLE_ATTR)).toBe(true);
    stop();
    stop = () => {};
    expect(docRoot.hasAttribute(CARRIER_IDLE_ATTR)).toBe(false);
  });

  it('the CSS pauses carriers under the stamp (the steps are what moves them)', () => {
    const css = readFileSync(join(process.cwd(), 'app', 'jelly-material.css'), 'utf8');
    expect(css).toMatch(
      /html\[data-jelly-idle\] \.jelly-flow > span,[\s\S]*?animation-play-state: paused;/,
    );
  });
});

describe('html[data-scrolling]', () => {
  it('stamps the root for inner scrollers and clears it at scroll end', () => {
    install();
    const scroller = new FakeEl('DIV');
    body.append(scroller);
    fireDoc('scroll', scroller);
    expect(docRoot.hasAttribute('data-scrolling')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(docRoot.hasAttribute('data-scrolling')).toBe(false);
  });

  it('leaves the root alone when it overflows (its thumb would show)', () => {
    docRoot.scrollHeight = 3000;
    docRoot.clientHeight = 800;
    install();
    fireDoc('scroll', new FakeEl('DIV'));
    expect(docRoot.hasAttribute('data-scrolling')).toBe(false);
  });

  it('never removes a stamp scrollbar-reveal set for a document scroll', () => {
    install();
    docRoot.setAttribute('data-scrolling', ''); // scrollbar-reveal, first listener
    fireDoc('scroll', doc);
    vi.advanceTimersByTime(500);
    expect(docRoot.hasAttribute('data-scrolling')).toBe(true);
  });
});

describe('teardown and cost rules', () => {
  it('removes every carrier, attribute and listener', () => {
    const { el } = host();
    install();
    stop();
    stop = () => {};
    expect(carrierOf(el)).toBeNull();
    expect(el.getAttribute('data-jelly-flow')).toBeNull();
    expect(registry.listeners.size).toBe(0);
    expect(bus.listenerCount('haze:change')).toBe(0);
    expect(docListeners.get('scroll')?.size ?? 0).toBe(0);
  });

  it('is a no-op without a registry or a window', () => {
    expect(() => installJellyFlow(doc, { registry: null })()).not.toThrow();
  });

  it('never runs a frame', () => {
    const src = readFileSync(join(__dirname, '..', 'flow-carriers.ts'), 'utf8');
    expect(src).not.toMatch(/requestAnimationFrame\s*\(/);
  });
});
