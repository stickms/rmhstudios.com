import { describe, expect, it } from 'vitest';
import { installRouteAnnouncer, MAIN_CONTENT_ID, ROUTE_ANNOUNCER_ID } from '@/lib/router/route-announce-client';

type Handler = (event: { fromLocation?: { pathname: string }; toLocation: { pathname: string } }) => void;

function setup(opts: { appRoute?: boolean; activeIsBody?: boolean } = {}) {
  const writes: string[] = [];
  const focused: Array<unknown> = [];
  const listeners = new Map<string, () => void>();
  const body = {};
  const link = {};
  const region = {
    dataset: { fallback: 'New page' } as Record<string, string | undefined>,
    focus: () => {},
    set textContent(v: string | null) {
      writes.push(v ?? '');
    },
    get textContent() {
      return writes[writes.length - 1] ?? '';
    },
  };
  const main = {
    textContent: '',
    focus: (o?: unknown) => {
      focused.push(o);
    },
  };
  const doc = {
    title: 'Document | RMH Studios',
    body,
    activeElement: opts.activeIsBody ? body : link,
    documentElement: { classList: { contains: (n: string) => n === 'app-route' && !!opts.appRoute } },
    getElementById: (id: string) => (id === ROUTE_ANNOUNCER_ID ? region : id === MAIN_CONTENT_ID ? main : null),
    addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
    removeEventListener: (type: string) => void listeners.delete(type),
  };
  let resolved: Handler = () => {};
  const router = {
    state: {
      matches: [{ meta: [{ title: 'Site default' }] }, { meta: [{ title: 'Settings | RMH Studios' }] }] as unknown[],
    },
    subscribe: (_e: 'onResolved', fn: Handler) => {
      resolved = fn;
      return () => {};
    },
  };
  const uninstall = installRouteAnnouncer(router as never, doc as never);
  const go = (from: string, to: string) => resolved({ fromLocation: { pathname: from }, toLocation: { pathname: to } });
  return { writes, focused, listeners, router, go, uninstall, doc };
}

describe('installRouteAnnouncer', () => {
  it('registers one capture, passive listener per input kind', () => {
    const { listeners } = setup();
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
  });

  it('writes the resolved title, cleared first so a repeat is heard', () => {
    const { writes, go } = setup();
    go('/explore', '/settings');
    expect(writes).toEqual(['', 'Settings']);
  });

  it('falls back to the document title when no match names one', () => {
    const { writes, go, router } = setup();
    router.state.matches = [{ meta: [{ name: 'robots' }] }];
    go('/a', '/b');
    expect(writes.at(-1)).toBe('Document');
  });

  it('says the fallback when no title is known', () => {
    const { writes, go, router, doc } = setup();
    router.state.matches = [];
    doc.title = '';
    go('/a', '/b');
    expect(writes.at(-1)).toBe('New page');
  });

  it('writes nothing for a search-only change', () => {
    const { writes, focused, listeners, go } = setup();
    listeners.get('keydown')?.();
    go('/games', '/games');
    expect(writes).toEqual([]);
    expect(focused).toEqual([]);
  });

  it('focuses #main-content after a keyboard-started navigation', () => {
    const { focused, listeners, go } = setup();
    listeners.get('keydown')?.();
    go('/explore', '/settings');
    expect(focused).toEqual([{ preventScroll: true }]);
  });

  it('does not focus after a pointer-started navigation that left focus on a link', () => {
    const { focused, listeners, go } = setup();
    listeners.get('keydown')?.();
    listeners.get('pointerdown')?.();
    go('/explore', '/settings');
    expect(focused).toEqual([]);
  });

  it('focuses when focus fell to the body', () => {
    const { focused, go } = setup({ activeIsBody: true });
    go('/explore', '/settings');
    expect(focused).toHaveLength(1);
  });

  it('forgets the input after each navigation', () => {
    const { focused, listeners, go } = setup();
    listeners.get('keydown')?.();
    go('/a', '/b');
    go('/b', '/c');
    expect(focused).toHaveLength(1);
  });

  it('announces on an app-tier route but never moves focus', () => {
    const { writes, focused, listeners, go } = setup({ appRoute: true, activeIsBody: true });
    listeners.get('keydown')?.();
    go('/games', '/balatro');
    expect(writes.at(-1)).toBe('Settings');
    expect(focused).toEqual([]);
  });

  it('stops listening when uninstalled', () => {
    const { listeners, uninstall, writes, go } = setup();
    uninstall();
    expect(listeners.size).toBe(0);
    go('/a', '/b');
    expect(writes).toEqual([]);
  });

  it('does not take focus from a field or a dialog after a keyboard navigation', () => {
    for (const held of [{ tagName: 'INPUT' }, { closest: () => ({}) }]) {
      const t = setup();
      (t.doc as { activeElement: unknown }).activeElement = held;
      t.listeners.get('keydown')?.();
      t.go('/explore', '/settings');
      expect(t.focused).toEqual([]);
    }
  });
});
