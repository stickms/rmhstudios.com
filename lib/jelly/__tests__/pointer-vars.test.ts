/**
 * The pointer variable (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3).
 *
 * One tiny service writes `--px` / `--py` (the pointer's position as a percentage of the host box) on the SINGLE
 * jelly host under a fine pointer, which positions the plasma wake and the dent's light dot in CSS. What must hold:
 *  - it subscribes through the one pointer hub (`lib/jelly/pointer.ts`) and adds no pointer listener of its own;
 *  - a move over a host writes both variables on that host only, coalesced to one write per animation frame, and a
 *    frame is requested only while the pointer is over a host;
 *  - the host rect is read once per host change, never per move (a scroll invalidates it);
 *  - pointercancel, and pointerout to outside the window, clear both; moving to another host moves them;
 *  - opted-out hosts are skipped (to the next host up), opt-out scopes (play-fields) and native-material / in-play
 *    roots write nothing;
 *  - a `(hover: none)` pointer writes nothing and attaches no listener at all.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const hub = vi.hoisted(() => {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  return {
    handlers,
    subscribe: 0,
    fire(type: string, e: Record<string, unknown>) {
      for (const fn of [...(handlers.get(type) ?? [])]) fn({ type, ...e });
    },
  };
});
vi.mock('../pointer', () => ({
  onJellyPointer: (type: string, fn: (e: unknown) => void) => {
    hub.subscribe++;
    if (!hub.handlers.has(type)) hub.handlers.set(type, new Set());
    hub.handlers.get(type)!.add(fn);
    return () => hub.handlers.get(type)?.delete(fn);
  },
}));

import { installPointerVars } from '../pointer-vars';

// ── Fake DOM ──────────────────────────────────────────────────────────────

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

/** Split a complex selector on top-level whitespace (descendant combinators only). */
function splitDescendants(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel.trim()) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function matchCompound(el: FakeEl, sel: string): boolean {
  let rest = sel;
  const tag = /^[a-z][a-z0-9]*/i.exec(rest);
  if (tag) {
    if (el.tag !== tag[0].toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest.length) {
    let m: RegExpExecArray | null;
    if ((m = /^\.([\w-]+)/.exec(rest))) {
      if (!el.classes.has(m[1])) return false;
    } else if ((m = /^\[([\w-]+)(~?)=?(?:"([^"]*)")?\]/.exec(rest))) {
      const v = el.getAttribute(m[1]);
      if (v === null) return false;
      if (m[3] !== undefined) {
        if (m[2] === '~' ? !v.split(/\s+/).includes(m[3]) : v !== m[3]) return false;
      }
    } else if ((m = /^\*/.exec(rest))) {
      // universal
    } else throw new Error(`fake DOM cannot match "${sel}"`);
    rest = rest.slice(m[0].length);
  }
  return true;
}

function matchComplex(el: FakeEl, sel: string): boolean {
  const parts = splitDescendants(sel);
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let i = parts.length - 2;
  let n = el.parentElement;
  while (i >= 0 && n) {
    if (matchCompound(n, parts[i])) i--;
    n = n.parentElement;
  }
  return i < 0;
}

let rectReads = 0;

class FakeEl {
  attrs = new Map<string, string>();
  classes = new Set<string>();
  parentElement: FakeEl | null = null;
  props = new Map<string, string>();
  writes = 0;
  style = {
    setProperty: (k: string, v: string) => {
      this.writes++;
      this.props.set(k, v);
    },
    removeProperty: (k: string) => {
      this.props.delete(k);
      return '';
    },
    getPropertyValue: (k: string) => this.props.get(k) ?? '',
  };
  constructor(
    public tag: string,
    public box = { left: 0, top: 0, width: 200, height: 100 },
  ) {}
  get isConnected(): boolean {
    return this.parentElement ? this.parentElement.isConnected : this === html;
  }
  getAttribute(n: string) {
    if (n === 'class') return [...this.classes].join(' ') || null;
    return this.attrs.has(n) ? this.attrs.get(n)! : null;
  }
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  matches(sel: string) {
    return splitList(sel).some((s) => matchComplex(this, s));
  }
  closest(sel: string): FakeEl | null {
    if (this.matches(sel)) return this;
    for (let n = this.parentElement; n; n = n.parentElement) if (n.matches(sel)) return n;
    return null;
  }
  getBoundingClientRect() {
    rectReads++;
    const b = this.box;
    return { ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top };
  }
  get classList() {
    const c = this.classes;
    return { contains: (n: string) => c.has(n) };
  }
}

let html: FakeEl;

function el(
  tag: string,
  parent: FakeEl,
  opts: { cls?: string[]; attrs?: Record<string, string>; box?: FakeEl['box'] } = {},
): FakeEl {
  const e = new FakeEl(tag, opts.box);
  for (const c of opts.cls ?? []) e.classes.add(c);
  for (const [k, v] of Object.entries(opts.attrs ?? {})) e.attrs.set(k, v);
  e.parentElement = parent;
  return e;
}

function setup(fine = true) {
  hub.handlers.clear();
  hub.subscribe = 0;
  rectReads = 0;
  html = new FakeEl('html');
  const body = el('body', html);
  const frames: FrameRequestCallback[] = [];
  const docListeners = new Map<string, Set<EventListener>>();
  const win = {
    matchMedia: vi.fn((q: string) => ({
      matches: fine && q.includes('hover: hover'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }),
    cancelAnimationFrame: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const doc = {
    defaultView: win,
    documentElement: html,
    body,
    addEventListener: vi.fn((t: string, fn: EventListener) => {
      if (!docListeners.has(t)) docListeners.set(t, new Set());
      docListeners.get(t)!.add(fn);
    }),
    removeEventListener: vi.fn((t: string, fn: EventListener) => docListeners.get(t)?.delete(fn)),
  };
  const frame = (now = 16) => {
    const due = frames.splice(0);
    for (const cb of due) cb(now);
  };
  const docFire = (t: string) => {
    for (const fn of [...(docListeners.get(t) ?? [])]) fn({ type: t } as Event);
  };
  return { win, doc, body, frames, frame, docFire };
}

const move = (target: FakeEl, x: number, y: number, pointerType = 'mouse') => {
  hub.fire('pointerover', { target, clientX: x, clientY: y, pointerType });
  hub.fire('pointermove', { target, clientX: x, clientY: y, pointerType });
};

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe('installPointerVars', () => {
  it('writes --px/--py on the hovered host only, once per frame, as a percentage of its box', () => {
    const t = setup();
    const card = el('div', t.body, {
      cls: ['glass-fill'],
      box: { left: 100, top: 50, width: 200, height: 100 },
    });
    const other = el('div', t.body, { cls: ['glass-fill'] });
    const label = el('span', card);
    stop = installPointerVars(t.doc as unknown as Document);
    move(label, 150, 75);
    hub.fire('pointermove', { target: label, clientX: 200, clientY: 100, pointerType: 'mouse' });
    expect(card.writes, 'nothing is written before the frame').toBe(0);
    expect(t.frames).toHaveLength(1);
    t.frame();
    expect(card.props.get('--px')).toBe('50%');
    expect(card.props.get('--py')).toBe('50%');
    expect(card.writes, 'two moves in one frame coalesce to one write per variable').toBe(2);
    expect(other.props.size).toBe(0);
    expect(label.props.size).toBe(0);
  });

  it('reads the host rect once per host change, never per move', () => {
    const t = setup();
    const card = el('div', t.body, { cls: ['glass-fill'] });
    stop = installPointerVars(t.doc as unknown as Document);
    move(card, 10, 10);
    t.frame();
    for (let i = 0; i < 20; i++) {
      hub.fire('pointermove', { target: card, clientX: 10 + i, clientY: 10, pointerType: 'mouse' });
      t.frame();
    }
    expect(rectReads).toBe(1);
    expect(card.props.get('--px')).toBe('14.5%');
    // A scroll moves the box under the pointer: the next frame reads it again, once.
    t.docFire('scroll');
    hub.fire('pointermove', { target: card, clientX: 40, clientY: 10, pointerType: 'mouse' });
    t.frame();
    hub.fire('pointermove', { target: card, clientX: 41, clientY: 10, pointerType: 'mouse' });
    t.frame();
    expect(rectReads).toBe(2);
  });

  it('requests a frame only while the pointer is over a host', () => {
    const t = setup();
    const card = el('div', t.body, { cls: ['glass-fill'] });
    const plain = el('div', t.body);
    stop = installPointerVars(t.doc as unknown as Document);
    move(plain, 5, 5);
    hub.fire('pointermove', { target: plain, clientX: 6, clientY: 5, pointerType: 'mouse' });
    expect(t.frames).toHaveLength(0);
    move(card, 5, 5);
    expect(t.frames).toHaveLength(1);
    t.frame();
    expect(t.frames, 'an idle pointer schedules nothing more').toHaveLength(0);
  });

  it('moves the variables to the next host, and clears them on pointercancel and on leaving the window', () => {
    const t = setup();
    const a = el('div', t.body, { cls: ['glass-fill'] });
    const b = el('button', t.body, { attrs: { 'data-slot': 'button' } });
    stop = installPointerVars(t.doc as unknown as Document);
    move(a, 20, 20);
    t.frame();
    expect(a.props.has('--px')).toBe(true);
    move(b, 20, 20);
    expect(a.props.has('--px'), 'the old host is cleared on the change').toBe(false);
    expect(a.props.has('--py')).toBe(false);
    t.frame();
    expect(b.props.has('--px')).toBe(true);
    hub.fire('pointercancel', { target: b, pointerType: 'mouse' });
    expect(b.props.has('--px')).toBe(false);
    expect(b.props.has('--py')).toBe(false);

    move(a, 20, 20);
    t.frame();
    expect(a.props.has('--px')).toBe(true);
    hub.fire('pointerout', { target: a, relatedTarget: null, pointerType: 'mouse' });
    expect(a.props.has('--px')).toBe(false);
    expect(a.props.has('--py')).toBe(false);
  });

  it('skips an opted-out host for the host around it, and writes nothing inside a play-field', () => {
    const t = setup();
    const group = el('div', t.body, { cls: ['glass-fill'] });
    const item = el('button', group, { attrs: { 'data-jelly': 'off', 'data-evert': '' } });
    stop = installPointerVars(t.doc as unknown as Document);
    move(item, 30, 30);
    t.frame();
    expect(item.props.size).toBe(0);
    expect(group.props.has('--px')).toBe(true);

    const field = el('div', t.body, { attrs: { 'data-jelly-zone': 'playfield' } });
    const piece = el('div', field, { cls: ['glass-fill'] });
    move(piece, 30, 30);
    expect(group.props.has('--px'), 'leaving for the play-field clears the last host').toBe(false);
    t.frame();
    expect(piece.props.size).toBe(0);
    expect(field.props.size).toBe(0);
  });

  it('writes nothing on a native-material route or while a game is in play', () => {
    for (const mark of ['native-material', 'playing'] as const) {
      const t = setup();
      if (mark === 'native-material') html.classes.add('native-material');
      else html.setAttribute('data-game-state', 'playing');
      const card = el('div', t.body, { cls: ['glass-fill'] });
      stop = installPointerVars(t.doc as unknown as Document);
      move(card, 10, 10);
      t.frame();
      expect(card.props.size, mark).toBe(0);
      expect(rectReads, mark).toBe(0);
      stop();
      stop = null;
    }
  });

  it('ignores touch pointers on a fine-pointer device', () => {
    const t = setup();
    const card = el('div', t.body, { cls: ['glass-fill'] });
    stop = installPointerVars(t.doc as unknown as Document);
    move(card, 10, 10, 'touch');
    t.frame();
    expect(card.props.size).toBe(0);
  });

  it('a (hover: none) pointer writes nothing and attaches no listener', () => {
    const t = setup(false);
    const card = el('div', t.body, { cls: ['glass-fill'] });
    stop = installPointerVars(t.doc as unknown as Document);
    expect(hub.subscribe).toBe(0);
    expect(t.doc.addEventListener).not.toHaveBeenCalled();
    expect(t.win.addEventListener).not.toHaveBeenCalled();
    move(card, 10, 10);
    expect(t.frames).toHaveLength(0);
    expect(card.props.size).toBe(0);
  });

  it('teardown unsubscribes, removes its listeners and clears the host', () => {
    const t = setup();
    const card = el('div', t.body, { cls: ['glass-fill'] });
    const off = installPointerVars(t.doc as unknown as Document);
    move(card, 10, 10);
    t.frame();
    expect(card.props.has('--px')).toBe(true);
    off();
    expect(card.props.size).toBe(0);
    expect([...hub.handlers.values()].every((s) => s.size === 0)).toBe(true);
    expect(t.doc.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);
  });
});
