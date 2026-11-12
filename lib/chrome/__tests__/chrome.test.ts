// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ENV_MAX_PX,
  ENV_SCALE,
  envWindowFor,
  isSkipped,
  windowCovers,
  type Viewport,
} from '../environment';
import { ChromeRenderer, type Host } from '../renderer';

const view = (over: Partial<Viewport> = {}): Viewport => ({
  scrollX: 0,
  scrollY: 0,
  width: 1280,
  height: 800,
  pageWidth: 1280,
  pageHeight: 3000,
  ...over,
});

describe('environment window (V7)', () => {
  it('covers the whole page when it fits the cap', () => {
    expect(envWindowFor(view())).toEqual({ x: 0, y: 0, width: 1280, height: 3000 });
  });

  it('takes a window round the viewport on a page taller than the cap, and scrolling inside it repaints nothing', () => {
    const tall = view({ pageHeight: 60_000, scrollY: 30_000 });
    const win = envWindowFor(tall);
    expect(win.height).toBe(ENV_MAX_PX / ENV_SCALE);
    expect(windowCovers(win, tall)).toBe(true);
    expect(windowCovers(win, { ...tall, scrollY: 30_000 + 2000 })).toBe(true);
    expect(windowCovers(win, { ...tall, scrollY: 30_000 + 12_000 })).toBe(false);
  });

  it('respects a GPU texture limit below the cap', () => {
    expect(envWindowFor(view({ pageHeight: 60_000 }), 4096).height).toBe(4096 / ENV_SCALE);
  });

  it('a page that grew past the window is stale', () => {
    const win = envWindowFor(view({ pageHeight: 1000 }));
    expect(windowCovers(win, view({ pageHeight: 5000, scrollY: 900 }))).toBe(false);
  });
});

describe('what a reflection leaves out (V6)', () => {
  const el = (attrs: string[]) =>
    ({ hasAttribute: (n: string) => attrs.includes(n) }) as unknown as Element;
  const style = (o: Partial<CSSStyleDeclaration>) =>
    ({ display: 'block', visibility: 'visible', opacity: '1', ...o }) as CSSStyleDeclaration;
  it('skips chrome elements, hidden subtrees and opacity 0', () => {
    expect(isSkipped(el(['data-chrome']), style({}))).toBe(true);
    expect(isSkipped(el(['data-chrome-skip']), style({}))).toBe(true);
    expect(isSkipped(el([]), style({ opacity: '0' }))).toBe(true);
    expect(isSkipped(el([]), style({ display: 'none' }))).toBe(true);
    expect(isSkipped(el([]), style({}))).toBe(false);
  });
});

/** A browser small enough to count frames, contexts and copies in. */
function fakeBrowser(thumbs: Array<{ c: number }>) {
  const frames: Array<() => void> = [];
  const listeners = new Map<string, EventListener[]>();
  let contexts = 0;
  const copies: number[] = thumbs.map(() => 0);
  const gl = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true;
      if (prop === 'getParameter') return () => 8192;
      if (prop === 'getExtension') return () => null;
      if (prop === 'getAttribLocation') return () => 0;
      if (typeof prop === 'string' && /^[A-Z_0-9]+$/.test(prop)) return 1;
      return () => ({});
    },
  });
  const makeCanvas = (index: number | null) => ({
    width: 0,
    height: 0,
    style: { cssText: '', opacity: '', display: '' },
    setAttribute() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    getContext: (kind: string) => {
      if (kind === 'webgl') {
        contexts++;
        return gl;
      }
      return {
        clearRect() {},
        fillRect() {},
        setTransform() {},
        fillText() {},
        beginPath() {},
        fill() {},
        roundRect() {},
        drawImage() {
          if (index !== null) copies[index]++;
        },
      };
    },
  });
  let nextCanvasIndex = 0;
  const elements = thumbs.map((thumb) => ({
    dataset: { chrome: 'pill' },
    thumb,
    appendChild() {},
    getBoundingClientRect: () => ({
      left: 100,
      top: 100,
      right: 122,
      bottom: 112,
      width: 22,
      height: 12,
    }),
  }));
  const body = {
    tagName: 'BODY',
    firstChild: null,
    hasAttribute: () => false,
    ownerDocument: null as unknown,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 3000 }),
  };
  const add = (type: string, fn: EventListener) =>
    listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  const document = {
    documentElement: {
      classList: { contains: () => false },
      scrollWidth: 1280,
      scrollHeight: 3000,
    },
    body,
    fonts: undefined,
    querySelectorAll: () => elements,
    createElement: () => makeCanvas(nextCanvasIndex++),
    createRange: () => ({}),
    addEventListener: add,
    removeEventListener() {},
    defaultView: null as unknown,
  };
  let now = 0;
  const window = {
    scrollX: 0,
    scrollY: 0,
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    performance: { now: () => now },
    getComputedStyle: (el: unknown) => ({
      backgroundColor: 'rgb(250, 250, 250)',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      overflow: 'visible',
      borderTopWidth: '0',
      borderBottomWidth: '0',
      borderLeftWidth: '0',
      borderRightWidth: '0',
      borderTopLeftRadius: '0',
      getPropertyValue: () => String((el as { thumb?: { c: number } }).thumb?.c ?? 0),
    }),
    addEventListener: add,
    removeEventListener() {},
  };
  document.defaultView = window;
  body.ownerDocument = document;
  const host = {
    window,
    document,
    requestFrame: (fn: () => void) => frames.push(fn),
    cancelFrame() {},
    requestIdle: (fn: () => void) => fn(),
    createGlCanvas: () => makeCanvas(null),
    createEnvCanvas: () => makeCanvas(null),
  } as unknown as Host;
  return {
    host,
    copies,
    contexts: () => contexts,
    fire: (type: string, event: object = {}) =>
      listeners.get(type)?.forEach((fn) => fn(event as Event)),
    /** Run scheduled frames until none is pending; returns how many ran. */
    settle(limit = 50) {
      let ran = 0;
      while (frames.length && ran < limit) {
        now += 16;
        frames.shift()!();
        ran++;
      }
      return ran;
    },
  };
}

describe('the chrome renderer', () => {
  it('holds one WebGL context and leaves no frame pending once input stops (V1, V9, R5)', () => {
    const b = fakeBrowser([{ c: 1 }, { c: 1 }]);
    const r = new ChromeRenderer(b.host);
    expect(r.start()).toBe(true);
    expect(b.settle()).toBeLessThan(10);
    expect(r.pending).toBe(false);
    expect(r.contexts).toBe(1);
    expect(b.contexts()).toBe(1);

    // A burst of pointer moves is one frame, and then rest again.
    for (let i = 0; i < 20; i++) b.fire('pointermove', { pageX: i, pageY: i });
    expect(b.settle()).toBe(1);
    expect(r.pending).toBe(false);
  });

  it('does not draw a thumb whose --c is 0 (V3)', () => {
    const b = fakeBrowser([{ c: 0 }, { c: 1 }]);
    const r = new ChromeRenderer(b.host);
    r.start();
    b.settle();
    expect(b.copies[0]).toBe(0);
    expect(b.copies[1]).toBeGreaterThan(0);
  });

  it('keeps drawing while a thumb is fading, and stops when it settles', () => {
    const thumb = { c: 0.5 };
    const b = fakeBrowser([thumb]);
    const r = new ChromeRenderer(b.host);
    r.start();
    expect(b.settle(8)).toBe(8); // mid-fade: every frame asks for the next
    expect(r.pending).toBe(true);
    thumb.c = 1;
    b.settle();
    expect(r.pending).toBe(false);
  });

  it('a --c transition that starts with no pointer event still gets drawn', () => {
    const thumb = { c: 0 };
    const b = fakeBrowser([thumb]);
    const r = new ChromeRenderer(b.host);
    r.start();
    b.settle();
    expect(r.pending).toBe(false);
    b.fire('transitionrun', { propertyName: '--c', elapsedTime: 0 });
    expect(r.pending).toBe(true);
    b.fire('transitionrun', { propertyName: 'opacity', elapsedTime: 0 });
    thumb.c = 1;
    expect(b.settle(40)).toBeLessThan(40); // about 320 ms of frames, then rest
    expect(r.pending).toBe(false);
  });
});

describe('hydration (a canvas appended before React reaches the element is error 418)', () => {
  it('gives an element no canvas until the host says it is ready, and stops asking after a bounded wait', () => {
    const b = fakeBrowser([{ c: 1 }]);
    let ready = false;
    let appended = 0;
    const el = (
      b.host.document.querySelectorAll('[data-chrome]') as unknown as Array<{ appendChild: () => void }>
    )[0]!;
    el.appendChild = () => void appended++;
    const r = new ChromeRenderer({ ...b.host, ready: () => ready });
    r.start();
    // Bounded: it looks again a fixed number of times and then rests with nothing pending.
    expect(b.settle(200)).toBeLessThan(40);
    expect(r.pending).toBe(false);
    expect(appended).toBe(0);

    ready = true;
    r.invalidate();
    b.settle();
    expect(appended).toBe(1);
    expect(r.pending).toBe(false);
  });

  it('reads "hydrated" from the last node inside the element', async () => {
    const { hydrated } = await import('../index');
    const node = (children: object[] = [], stamped = false, nodeType = 1) => {
      const n: Record<string, unknown> = { nodeType };
      children.forEach((c, i) => {
        (c as Record<string, unknown>).previousSibling = children[i - 1] ?? null;
      });
      Object.defineProperty(n, 'lastChild', { value: children.at(-1) ?? null, enumerable: false });
      if (stamped) n['__reactFiber$abc'] = {};
      return n;
    };
    // A leaf React has reached.
    expect(hydrated(node([], true) as unknown as Element)).toBe(true);
    // Server markup React has not reached.
    expect(hydrated(node() as unknown as Element)).toBe(false);
    // Begun (the element is stamped) but its last child is not: still hydrating.
    expect(hydrated(node([node([], true), node()], true) as unknown as Element)).toBe(false);
    expect(hydrated(node([node(), node([], true)], true) as unknown as Element)).toBe(true);
    // A trailing Suspense marker carries no fiber: the node before it decides.
    expect(hydrated(node([node([], true), node([], false, 8)], true) as unknown as Element)).toBe(true);
  });
});
