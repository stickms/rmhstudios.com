/**
 * A minimal fake DOM for the arc renderer/runtime tests (the suite runs in `node`; there is no jsdom). It implements
 * exactly what the arc modules touch: a canvas with a recording 2D context, a manual rAF queue, attribute/class reads
 * on `<html>`, listener maps, MutationObserver instances the test can fire, and `matchMedia`.
 *
 * An event dispatched on the document reaches the window's capture listeners first (`docListeners.parent`), as a
 * real capture-phase event does — the jelly pointer hub (`lib/jelly/pointer.ts`) listens on the window — and carries
 * its `type`, which the hub dispatches on.
 */
import { FINE_POINTER_QUERY, JELLY_SELECTOR } from '../../tiers';
import { HUB_OR_EVERSION_SELECTOR } from '../runtime';

type Fn = (...args: never[]) => unknown;

export class Listeners {
  map = new Map<string, Set<Fn>>();
  /** Listeners that see the event before these (the window, for the document). */
  parent: Listeners | null = null;
  addEventListener = (type: string, fn: Fn) => {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
  };
  removeEventListener = (type: string, fn: Fn) => {
    this.map.get(type)?.delete(fn);
  };
  dispatch(type: string, event: object = {}) {
    const e = { type, ...event };
    this.parent?.dispatchOwn(type, e);
    this.dispatchOwn(type, e);
  }
  dispatchOwn(type: string, e: object) {
    for (const fn of [...(this.map.get(type) ?? [])]) (fn as (ev: object) => void)(e);
  }
  count(type: string) {
    return this.map.get(type)?.size ?? 0;
  }
}

export function stubContext() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      createRadialGradient: () => ({ addColorStop: () => {} }),
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        return (..._args: unknown[]) => {
          calls.push(prop);
        };
      },
      set(target, prop: string, value) {
        target[prop] = value;
        if (prop === 'globalCompositeOperation') calls.push(`composite:${String(value)}`);
        return true;
      },
    },
  );
  return { ctx, calls };
}

export class FakeEl extends Listeners {
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  style: Record<string, string> = {};
  className = '';
  width = 0;
  height = 0;
  ctx = stubContext();
  constructor(
    public tag = 'div',
    public box = { left: 0, top: 0, width: 100, height: 40 },
    public jelly = false,
  ) {
    super();
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  appendChild(c: FakeEl) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  contains(other: FakeEl): boolean {
    return other === this || this.children.some((c) => c.contains(other));
  }
  matches() {
    return false;
  }
  closest(sel: string) {
    return sel === JELLY_SELECTOR && this.jelly ? this : null;
  }
  getBoundingClientRect() {
    const b = this.box;
    return { ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top };
  }
  getContext() {
    return this.ctx.ctx;
  }
}

export interface FakeEnv {
  doc: Document;
  win: Window;
  body: FakeEl;
  root: FakeEl & { classes: Set<string> };
  docListeners: Listeners;
  /** The window's listeners (the jelly pointer hub, resize). */
  winListeners: Listeners;
  state: { hub: boolean; hidden: boolean; hit: FakeEl | null; dark: boolean; fine: boolean };
  observers: { cb: () => void; on: boolean }[];
  /** Pending rAF callbacks. */
  rafQueue: Map<number, (t: number) => void>;
  rafCalls: number;
  /** Run one frame's callbacks. */
  frame(): number;
  /** Fire every live MutationObserver (an attribute/DOM change). */
  mutate(): void;
  canvas(): FakeEl | undefined;
}

export function fakeEnv(opts: { cores?: number } = {}): FakeEnv {
  const state = { hub: false, hidden: false, hit: null as FakeEl | null, dark: false, fine: true };
  const docListeners = new Listeners();
  const winListeners = new Listeners();
  docListeners.parent = winListeners;
  const body = new FakeEl('body');
  const root = Object.assign(new FakeEl('html'), { classes: new Set<string>() });
  root.matches = ((sel: string) =>
    sel
      .split(',')
      .some((s) => s.trim().startsWith('.') && root.classes.has(s.trim().slice(1)))) as never;
  const observers: { cb: () => void; on: boolean }[] = [];
  const rafQueue = new Map<number, (t: number) => void>();
  let rafId = 0;

  class MO {
    rec: { cb: () => void; on: boolean };
    constructor(cb: () => void) {
      this.rec = { cb, on: false };
      observers.push(this.rec);
    }
    observe() {
      this.rec.on = true;
    }
    disconnect() {
      this.rec.on = false;
    }
  }

  const env: FakeEnv = {
    doc: null as never,
    win: null as never,
    body,
    root,
    docListeners,
    winListeners,
    state,
    observers,
    rafQueue,
    rafCalls: 0,
    frame() {
      const cbs = [...rafQueue.values()];
      rafQueue.clear();
      for (const cb of cbs) cb(Date.now());
      return cbs.length;
    },
    mutate() {
      for (const o of [...observers]) if (o.on) o.cb();
    },
    canvas: () => body.children.find((c) => c.className === 'jelly-arc-layer'),
  };

  const win = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2,
    navigator: { hardwareConcurrency: opts.cores ?? 8 },
    performance: { now: () => Date.now() },
    MutationObserver: MO,
    matchMedia: (q: string) => ({
      get matches() {
        return q === FINE_POINTER_QUERY ? state.fine : false;
      },
      addEventListener() {},
      removeEventListener() {},
    }),
    getComputedStyle: (el: FakeEl) => {
      const token = el.style.color ?? '';
      const color = token.includes('--site-bg')
        ? state.dark
          ? 'rgb(12, 12, 16)'
          : 'rgb(250, 250, 248)'
        : token.includes('--site-arc-core')
          ? 'rgb(91, 63, 214)'
          : 'rgba(124, 108, 255, 0.6)';
      return {
        color,
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        borderBottomRightRadius: '8px',
        borderBottomLeftRadius: '8px',
      };
    },
    requestAnimationFrame: (cb: (t: number) => void) => {
      env.rafCalls++;
      rafQueue.set(++rafId, cb);
      return rafId;
    },
    cancelAnimationFrame: (id: number) => {
      rafQueue.delete(id);
    },
    addEventListener: winListeners.addEventListener,
    removeEventListener: winListeners.removeEventListener,
  };

  const doc = {
    defaultView: win,
    documentElement: root,
    body,
    activeElement: null,
    get hidden() {
      return state.hidden;
    },
    createElement: (tag: string) => new FakeEl(tag),
    addEventListener: docListeners.addEventListener,
    removeEventListener: docListeners.removeEventListener,
    querySelector: (sel: string) => (sel === HUB_OR_EVERSION_SELECTOR && state.hub ? {} : null),
    querySelectorAll: () => [],
    getSelection: () => ({ rangeCount: 0, isCollapsed: true }),
    elementFromPoint: () => state.hit,
    fullscreenElement: null,
  };
  env.doc = doc as unknown as Document;
  env.win = win as unknown as Window;
  return env;
}
