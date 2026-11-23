// @vitest-environment node
/**
 * The pre-paint fonts step repairs a device whose `rmh-fonts` cookie is missing (cleared, or a change whose cookie
 * write failed): the server rendered the defaults, but this device's storage names other faces. It stamps the
 * attributes, links the missing sheets and rewrites the cookie so the next request renders right
 * (docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fontsStep } from '../fonts';
import type { PrepaintCtx } from '../types';

const SHEETS = {
  t: { 'dm-sans': '', inter: '/a/inter.css', literata: '/a/literata.css' },
  m: { 'dm-mono': '', 'jetbrains-mono': '/a/jbm.css' },
};

let store: Map<string, string>;
let attrs: Map<string, string>;
let links: string[];
let cookie: string;

function run(storage: Record<string, string>, html: Record<string, string> = {}) {
  store = new Map(Object.entries(storage));
  attrs = new Map(Object.entries(html));
  links = [];
  cookie = '';
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
  const doc = {
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      cookie = v;
    },
    head: { appendChild: (el: { href: string }) => links.push(el.href) },
    createElement: () => ({ rel: '', href: '' }),
    querySelector: (sel: string) => (links.some((h) => sel.includes(h)) ? {} : null),
  };
  const ctx = {
    doc,
    html: {
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    },
    cfg: { fonts: SHEETS },
  } as unknown as PrepaintCtx;
  fontsStep(ctx);
}

beforeEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('pre-paint fonts step', () => {
  it('storage names faces the server did not render: stamps, links and rewrites the cookie', () => {
    run({ 'rmh-font-main': 'inter', 'rmh-font-reading': 'literata', 'rmh-font-mono': 'jetbrains-mono' });
    expect(Object.fromEntries(attrs)).toEqual({
      'data-font-main': 'inter',
      'data-font-reading': 'literata',
      'data-font-mono': 'jetbrains-mono',
    });
    expect(links.sort()).toEqual(['/a/inter.css', '/a/jbm.css', '/a/literata.css']);
    expect(cookie).toMatch(/^rmh-fonts=inter\.literata\.jetbrains-mono;/);
  });

  it('a name inherited from Object (toString, __proto__) is not a face', () => {
    run({ 'rmh-font-main': 'toString', 'rmh-font-mono': '__proto__' });
    expect(attrs.size).toBe(0);
    expect(links).toEqual([]);
    expect(cookie).toBe('');
  });

  it('storage agrees with what the server rendered: nothing is appended or written', () => {
    run({ 'rmh-font-main': 'inter' }, { 'data-font-main': 'inter' });
    expect(links).toEqual([]);
    expect(cookie).toBe('');
  });

  it('an unknown id or a mono face in a text slot is ignored', () => {
    run({ 'rmh-font-main': 'jetbrains-mono', 'rmh-font-reading': 'comic-sans' });
    expect(attrs.size).toBe(0);
    expect(links).toEqual([]);
  });

  it('back to the defaults on this device: attributes and cookie are cleared', () => {
    run({}, { 'data-font-main': 'inter' });
    expect(attrs.size).toBe(0);
    expect(cookie).toMatch(/^rmh-fonts=; Max-Age=0/);
  });

  it('without the config block (the Discord head) it does nothing', () => {
    store = new Map([['rmh-font-main', 'inter']]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
    const html = { setAttribute: () => { throw new Error('touched'); } };
    expect(() => fontsStep({ cfg: {}, html } as unknown as PrepaintCtx)).not.toThrow();
  });
});

import { accountSeedStep } from '../account-seed';

describe('account seed: this device keeps its own appearance while sync is off', () => {
  function seedRun(storage: Record<string, string>, cookieIn: string) {
    const mem = new Map(Object.entries(storage));
    let cookieOut = cookieIn;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const doc = {
      get cookie() {
        return cookieOut;
      },
      set cookie(v: string) {
        cookieOut = v;
      },
    };
    accountSeedStep({ doc, cfg: { seed: { 'rmh-style': 'default', 'rmh-font-main': 'lora' } } } as unknown as PrepaintCtx);
    return { mem, cookie: cookieOut };
  }

  it('sync off in storage: the account seed is not applied, even when the cookie has expired', () => {
    const { mem, cookie } = seedRun({ 'rmh-appearance-sync': '0', 'rmh-style': 'graphite', 'rmh-font-main': 'inter' }, '');
    expect(mem.get('rmh-style')).toBe('graphite');
    expect(mem.get('rmh-font-main')).toBe('inter');
    // …and the expired cookie is written back, so the next request skips the seed on the server too.
    expect(cookie).toMatch(/^rmh-appearance-sync=0;/);
  });

  it('sync on in storage but a stale off cookie: the cookie is cleared and the seed applies', () => {
    const { mem, cookie } = seedRun({ 'rmh-style': 'graphite' }, 'rmh-appearance-sync=0');
    expect(mem.get('rmh-style')).toBe('default');
    expect(cookie).toMatch(/^rmh-appearance-sync=; Max-Age=0/);
  });
});
