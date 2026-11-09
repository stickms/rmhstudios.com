/**
 * The refraction service's orchestration, with a fake document, registry, picture and layer: which hosts hold a layer,
 * how a layer is re-placed, and what it does when the picture goes away. (What a layer LOOKS like is proven in real
 * browsers by the Task 8 screenshots; `jelly-refract.test.ts` pins the source rules.)
 */
import { describe, expect, it, vi } from 'vitest';
import type { JellyRegistry } from '../../registry';
import {
  createHostMeasure,
  installRefraction,
  type HostMeasure,
  type RefractionDeps,
} from '../install';
import type { LayerView, RefractLayer } from '../layer';
import type { SceneImage } from '../scene-image';

class Host {
  isConnected = true;
  constructor(
    public name: string,
    public sel: string[] = ['.glass-fill'],
  ) {}
  matches(s: string) {
    return s.split(',').some((x) => this.sel.includes(x.trim()));
  }
  closest(s: string): Host | null {
    return this.matches(s) ? this : null;
  }
}

function rig(opts: { tier?: 'full' | 'coarse' | 'handheld' | 'off' } = {}) {
  const hosts: Host[] = [];
  const rects = new Map<Host, { left: number; top: number; width: number; height: number }>();
  const measures = new Map<Host, HostMeasure>();
  let visible: Host[] = [];
  const regListeners = new Set<() => void>();
  const registry = {
    scrolling: false,
    visible: () =>
      visible.map((el) => ({
        el,
        order: 0,
        visible: true,
        rect: rects.get(el) ?? { left: 0, top: 0, width: 300, height: 100 },
      })),
    onChange(fn: () => void) {
      regListeners.add(fn);
      return () => void regListeners.delete(fn);
    },
  } as unknown as JellyRegistry & { scrolling: boolean };
  const layers = new Map<Host, ReturnType<typeof fakeLayer>>();
  const fakeLayer = (host: Host) => {
    const l = {
      host,
      views: [] as LayerView[],
      destroyed: false,
      moving: false,
      isAttached: true,
      span: {} as HTMLElement,
      apply(v: LayerView) {
        l.views.push(v);
      },
      setMoving(m: boolean) {
        l.moving = m;
      },
      attached: () => l.isAttached,
      reattach() {
        l.isAttached = true;
      },
      destroy() {
        l.destroyed = true;
        layers.delete(host);
      },
      get last() {
        return l.views[l.views.length - 1];
      },
    };
    layers.set(host, l);
    return l;
  };
  const live = new Set<string>();
  const acquired: string[] = [];
  const acquireFilter: RefractionDeps['acquireFilter'] = (_doc, c) => {
    live.add(c.key);
    acquired.push(c.key);
    let done = false;
    return {
      id: `f-${c.key}`,
      release() {
        if (done) return;
        done = true;
        live.delete(c.key);
      },
    };
  };
  const imgListeners = new Set<() => void>();
  const image = {
    url: 'blob:scene' as string | null,
    version: 1,
    width: 1000,
    height: 800,
    scrollX: 0,
    scrollY: 0,
    originX: 0,
    originY: 0,
    onChange(fn: () => void) {
      imgListeners.add(fn);
      return () => void imgListeners.delete(fn);
    },
    dispose() {},
  } as unknown as SceneImage & { url: string | null; version: number; scrollY: number };
  const feed = { request: vi.fn(), release: vi.fn() };
  let scroll = { x: 0, y: 0 };
  let stamp = 'page-a';
  const queued: Array<() => void> = [];
  const scrollListeners: Array<() => void> = [];
  const doc = {
    defaultView: {
      innerWidth: 1000,
      innerHeight: 800,
      setTimeout: (fn: () => void, ms: number) =>
        globalThis.setTimeout(fn, ms) as unknown as number,
      clearTimeout: (h: number) => globalThis.clearTimeout(h),
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      getComputedStyle: () => ({ backgroundColor: 'rgb(0, 0, 0)' }),
    },
    documentElement: { scrollHeight: 3000 } as unknown as HTMLElement,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'scroll') scrollListeners.push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      if (type === 'scroll') scrollListeners.splice(scrollListeners.indexOf(fn), 1);
    },
  } as unknown as Document;

  const add = (
    name: string,
    m: Partial<HostMeasure> = {},
    rect = { left: 100, top: 100, width: 300, height: 100 },
  ) => {
    const h = new Host(name);
    hosts.push(h);
    rects.set(h, rect);
    measures.set(h, {
      w: 300,
      h: 100,
      radius: 24,
      left: 100,
      top: 100,
      fixed: false,
      tint: null,
      ...m,
    });
    visible.push(h);
    return h;
  };
  const flush = () => {
    while (queued.length) queued.shift()!();
  };
  const stop = installRefraction(doc, {
    registry,
    image,
    feed,
    tier: () => opts.tier ?? 'full',
    off: () => false,
    measure: (el) => measures.get(el as unknown as Host) ?? null,
    createLayer: (el) => fakeLayer(el as unknown as Host) as unknown as RefractLayer,
    acquireFilter,
    scroll: () => scroll,
    stamp: () => stamp,
    schedule: (fn) => {
      queued.push(fn);
      return () => {
        const i = queued.indexOf(fn);
        if (i >= 0) queued.splice(i, 1);
      };
    },
  });
  return {
    add,
    flush,
    stop,
    layers,
    live,
    acquired,
    image,
    feed,
    registry,
    measures,
    setVisible: (v: Host[]) => (visible = v),
    setScroll: (x: number, y: number) => (scroll = { x, y }),
    setStamp: (s: string) => (stamp = s),
    notifyRegistry: () => regListeners.forEach((f) => f()),
    notifyImage: () => imgListeners.forEach((f) => f()),
    scrollStart: () => scrollListeners.forEach((f) => f()),
    queued,
    imgListeners,
    regListeners,
    scrollListeners,
  };
}

describe('installRefraction', () => {
  it('gives a host exactly one layer, however many passes run', () => {
    const r = rig();
    const h = r.add('card');
    r.flush();
    r.notifyRegistry();
    r.flush();
    r.notifyRegistry();
    r.flush();
    expect(r.layers.size).toBe(1);
    expect(r.layers.get(h)!.last.cover).toBe(1);
    expect(r.layers.get(h)!.last.filterId).toMatch(/^f-/);
    expect(r.live.size).toBe(1);
  });

  it('gives an off-screen host none, and takes the layer from a host that leaves the screen', () => {
    const r = rig();
    const a = r.add('a');
    const b = r.add('b');
    r.setVisible([a]);
    r.flush();
    expect(r.layers.has(a)).toBe(true);
    expect(r.layers.has(b)).toBe(false);
    r.setVisible([b]);
    r.notifyRegistry();
    r.flush();
    expect(r.layers.has(a)).toBe(false);
    expect(r.layers.has(b)).toBe(true);
    expect(r.live.size).toBe(1);
  });

  it('keeps the budget: over it, the hosts farthest from the viewport centre keep the lit rim', () => {
    const r = rig({ tier: 'coarse' });
    const budget = 12;
    const hosts = [];
    for (let i = 0; i < 20; i++)
      hosts.push(r.add(`h${i}`, {}, { left: 350, top: i * 40, width: 300, height: 30 }));
    r.flush();
    expect(r.layers.size).toBe(budget);
    const kept = [...r.layers.keys()].map((h) => Number(h.name.slice(1)));
    // The viewport is 800 tall, so its centre row is 400: hosts around index 10 are nearest.
    expect(Math.min(...kept)).toBeGreaterThan(3);
    expect(Math.max(...kept)).toBeLessThan(17);
  });

  it('gives a handheld no layers (budget 0 until measured)', () => {
    const r = rig({ tier: 'handheld' });
    r.add('a');
    r.flush();
    expect(r.layers.size).toBe(0);
  });

  it('swaps the filter when a host grows into another size class, releasing the old one', () => {
    const r = rig();
    const h = r.add('card');
    r.flush();
    const first = [...r.live][0];
    r.measures.set(h, {
      w: 640,
      h: 100,
      radius: 24,
      left: 100,
      top: 100,
      fixed: false,
      tint: null,
    });
    r.notifyRegistry();
    r.flush();
    expect(r.live.size).toBe(1);
    expect([...r.live][0]).not.toBe(first);
    expect(r.layers.get(h)!.last.filterId).toBe(`f-${[...r.live][0]}`);
    // A one pixel change stays in its class: no churn.
    const before = r.acquired.length;
    r.measures.set(h, {
      w: 641,
      h: 100,
      radius: 24,
      left: 100,
      top: 100,
      fixed: false,
      tint: null,
    });
    r.notifyRegistry();
    r.flush();
    expect(r.acquired.length).toBe(before);
  });

  it('fades every layer to 0 when the scene is cleared (Review Focus 4)', () => {
    const r = rig();
    r.add('a');
    r.add('b', {}, { left: 500, top: 300, width: 300, height: 100 });
    r.flush();
    for (const l of r.layers.values()) expect(l.last.cover).toBe(1);
    r.image.url = null;
    r.notifyImage();
    for (const l of r.layers.values()) expect(l.last.cover).toBe(0);
    r.flush();
    for (const l of r.layers.values()) expect(l.last.cover).toBe(0);
    // A new picture brings them back.
    r.image.url = 'blob:scene2';
    (r.image as { version: number }).version = 2;
    r.notifyImage();
    r.flush();
    for (const l of r.layers.values()) expect(l.last.cover).toBe(1);
  });

  it('fades layers while the theme or the route differs from what the picture shows', () => {
    const r = rig();
    r.add('a');
    r.flush();
    r.setStamp('page-a graphite');
    r.notifyRegistry();
    r.flush();
    for (const l of r.layers.values()) expect(l.last.cover).toBe(0);
    // The next picture is of the new state.
    (r.image as { version: number }).version = 2;
    r.notifyImage();
    r.flush();
    for (const l of r.layers.values()) expect(l.last.cover).toBe(1);
  });

  it('places a fixed host by the scroll since the picture, 1:1, and an in-flow host not at all (Review Focus 5)', () => {
    const r = rig();
    const bar = r.add(
      'bar',
      { fixed: true, left: 0, top: 0, w: 1000, h: 64 },
      { left: 0, top: 0, width: 1000, height: 64 },
    );
    const card = r.add(
      'card',
      { fixed: false, left: 100, top: 300 },
      { left: 100, top: 300, width: 300, height: 100 },
    );
    r.flush();
    const bar0 = r.layers.get(bar)!.last.offsetY;
    const card0 = r.layers.get(card)!.last.offsetY;
    // The page scrolled 120px; the in-flow card moved up on screen with it, the bar did not.
    r.setScroll(0, 120);
    r.measures.set(card, {
      w: 300,
      h: 100,
      radius: 24,
      left: 100,
      top: 180,
      fixed: false,
      tint: null,
    });
    r.registry.scrolling = false;
    r.notifyRegistry();
    r.flush();
    expect(r.layers.get(bar)!.last.offsetY - bar0).toBe(-120);
    expect(r.layers.get(card)!.last.offsetY).toBe(card0);
  });

  it('adds back the body origin the capture lost, so the picture lines up with the live page', () => {
    const r = rig();
    const h = r.add(
      'card',
      { left: 100, top: 300 },
      { left: 100, top: 300, width: 300, height: 100 },
    );
    r.flush();
    const flat = r.layers.get(h)!.last.offsetY;
    // The picture drew the page 12px above where it is live, so the layer reads it 12px further down.
    (r.image as { originY: number }).originY = 12;
    (r.image as { version: number }).version = 2;
    r.notifyImage();
    r.flush();
    expect(r.layers.get(h)!.last.offsetY - flat).toBe(12);
  });

  it('does nothing while a scroll is in flight, fades fixed layers at its first event and re-places them at rest', () => {
    const r = rig();
    const bar = r.add('bar', { fixed: true, left: 0, top: 0, w: 1000, h: 64 });
    const card = r.add('card');
    r.flush();
    r.scrollStart();
    expect(r.layers.get(bar)!.moving).toBe(true);
    expect(r.layers.get(card)!.moving).toBe(false);
    (r.registry as { scrolling: boolean }).scrolling = true;
    const n = r.layers.get(bar)!.views.length;
    r.notifyRegistry();
    r.flush();
    expect(r.layers.get(bar)!.views.length).toBe(n);
    // Scroll end: the registry flips its flag and notifies.
    (r.registry as { scrolling: boolean }).scrolling = false;
    r.setScroll(0, 200);
    r.notifyRegistry();
    r.flush();
    expect(r.layers.get(bar)!.moving).toBe(false);
  });

  it('asks for a fresh picture at scroll rest only when the shifted picture no longer covers a fixed host', () => {
    const covered = rig();
    covered.add('bar', { fixed: true, left: 0, top: 0, w: 1000, h: 64 });
    covered.flush();
    covered.scrollStart();
    // 300px on, the picture (800px tall) still holds everything under the bar: exact for static content, no new picture.
    covered.setScroll(0, 300);
    covered.notifyRegistry();
    covered.flush();
    expect(covered.feed.request.mock.calls, 'covered').toEqual([]);

    const gone = rig();
    gone.add('bar', { fixed: true, left: 0, top: 0, w: 1000, h: 64 });
    gone.flush();
    gone.scrollStart();
    gone.setScroll(0, 900);
    gone.notifyRegistry();
    gone.flush();
    expect(gone.feed.request).toHaveBeenCalledWith('scroll-rest');

    const inFlow = rig();
    inFlow.add('card');
    inFlow.flush();
    inFlow.scrollStart();
    inFlow.setScroll(0, 900);
    inFlow.notifyRegistry();
    inFlow.flush();
    expect(inFlow.feed.request.mock.calls, 'inFlow').toEqual([]);
  });

  it('fades a host that moved or resized since the picture and asks for a new one only after things are quiet', () => {
    vi.useFakeTimers();
    try {
      const r = rig();
      const h = r.add('card');
      r.flush();
      expect(r.layers.get(h)!.last.cover).toBe(1);
      // Content above it grew: the host moved down 12px. Its picture no longer sits behind it.
      r.measures.set(h, {
        w: 300,
        h: 100,
        radius: 24,
        left: 100,
        top: 112,
        fixed: false,
        tint: null,
      });
      r.notifyRegistry();
      r.flush();
      expect(r.layers.get(h)!.last.cover).toBe(0);
      // Still changing: no request yet, and the timer restarts.
      vi.advanceTimersByTime(800);
      r.measures.set(h, {
        w: 300,
        h: 100,
        radius: 24,
        left: 100,
        top: 130,
        fixed: false,
        tint: null,
      });
      r.notifyRegistry();
      r.flush();
      vi.advanceTimersByTime(800);
      expect(r.feed.request).not.toHaveBeenCalledWith('resize');
      vi.advanceTimersByTime(600);
      expect(r.feed.request).toHaveBeenCalledWith('resize');
      // The new picture re-bases the host and the layer returns.
      (r.image as { version: number }).version = 2;
      r.notifyImage();
      r.flush();
      expect(r.layers.get(h)!.last.cover).toBe(1);
      r.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fades layers when the page is no longer the height the picture was taken at (a webfont reflowed it)', () => {
    vi.useFakeTimers();
    try {
      const r = rig();
      r.add('card');
      (r.image as { docHeight?: number }).docHeight = 3000;
      r.flush();
      for (const l of r.layers.values()) expect(l.last.cover).toBe(1);
      // The picture says 2988px tall; the page is 3000 now.
      (r.image as { docHeight?: number }).docHeight = 2988;
      r.notifyRegistry();
      r.flush();
      for (const l of r.layers.values()) expect(l.last.cover).toBe(0);
      vi.advanceTimersByTime(1300);
      expect(r.feed.request).toHaveBeenCalledWith('resize');
      r.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts back a layer React wiped out of its host', () => {
    const r = rig();
    const h = r.add('card');
    r.flush();
    r.layers.get(h)!.isAttached = false;
    r.notifyRegistry();
    r.flush();
    expect(r.layers.get(h)!.isAttached).toBe(true);
  });

  it('never refracts an excluded or opted-out host', () => {
    const r = rig();
    const opaque = r.add('opaque');
    opaque.sel = ['.glass-fill', '.glass-opaque'];
    const native = r.add('native');
    native.closest = (s: string) => (s.includes('.native-material') ? native : null);
    const ok = r.add('ok');
    r.flush();
    expect([...r.layers.keys()]).toEqual([ok]);
  });

  it('tears everything down: layers, filters, listeners, and leaves nothing queued', () => {
    const r = rig();
    r.add('a');
    r.add('b');
    r.flush();
    expect(r.layers.size).toBe(2);
    r.stop();
    expect(r.layers.size).toBe(0);
    expect(r.live.size).toBe(0);
    expect(r.regListeners.size).toBe(0);
    expect(r.imgListeners.size).toBe(0);
    expect(r.scrollListeners.length).toBe(0);
    expect(r.queued.length).toBe(0);
    r.notifyRegistry();
    expect(r.queued.length).toBe(0);
    r.stop(); // idempotent
  });

  it('lays the page ground under the picture', () => {
    const r = rig();
    const h = r.add('card');
    r.flush();
    expect(r.layers.get(h)!.last.ground).toBe('rgb(0, 0, 0)');
  });

  it('hands a host the picture does not hold its own tint to paint, and a host it holds none', () => {
    const r = rig();
    const bar = r.add('bar', { tint: 'rgb(10, 12, 20)' });
    const card = r.add('card', { tint: null }, { left: 500, top: 300, width: 300, height: 100 });
    r.flush();
    expect(r.layers.get(bar)!.last.tint).toBe('rgb(10, 12, 20)');
    expect(r.layers.get(card)!.last.tint).toBeNull();
  });
});

describe('createHostMeasure', () => {
  /** A host 300 x 100 at (100, 200) with a 1px border, as a fake element whose rect is what the squash does to it. */
  const host = (scale: number) => {
    const w = 300;
    const h = 100;
    const cx = 100 + w / 2;
    const cy = 200 + h / 2;
    return {
      matches: () => false,
      parentElement: null,
      clientLeft: 1,
      clientTop: 1,
      clientWidth: w - 2,
      clientHeight: h - 2,
      offsetWidth: w,
      offsetHeight: h,
      getBoundingClientRect: () => ({
        left: cx - (w * scale) / 2,
        top: cy - (h * scale) / 2,
        width: w * scale,
        height: h * scale,
      }),
    } as unknown as Element;
  };
  const win = {
    document: { documentElement: {} },
    getComputedStyle: () => ({
      display: 'block',
      position: 'relative',
      borderTopLeftRadius: '24px',
      backgroundColor: 'rgb(0, 0, 0)',
    }),
  } as unknown as Window & typeof globalThis;

  it('places a squashed host where it is laid out, not where the squash draws it (a press must not read as the page moving)', () => {
    const measure = createHostMeasure(win);
    const rest = measure(host(1))!;
    const pressed = measure(host(0.97))!;
    expect(rest.left).toBeCloseTo(101, 5);
    expect(rest.top).toBeCloseTo(201, 5);
    expect(pressed.left).toBeCloseTo(rest.left, 5);
    expect(pressed.top).toBeCloseTo(rest.top, 5);
    expect(pressed.w).toBe(rest.w);
  });
});
