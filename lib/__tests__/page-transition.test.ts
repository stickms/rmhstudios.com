import { describe, expect, it, vi } from 'vitest';
import {
  commitPageTransition,
  finishEntranceAnimations,
  installPageTransitions,
  navKind,
  shellLayoutFor,
  armEntranceGuard,
  swapContentAfter,
  watchEntrances,
} from '../page-transition';

describe('shellLayoutFor', () => {
  it.each([
    ['/games', 'catalog'],
    ['/apps', 'catalog'],
    ['/store/x', 'catalog'],
    ['/library', 'catalog'],
    ['/settings', 'workspace'],
    ['/messages/abc', 'workspace'],
    ['/blog/slug', 'editorial'],
    ['/news', 'editorial'],
    ['/', 'social'],
    ['/explore', 'social'],
    ['/gamesy', 'social'], // a prefix is not a segment
  ])('%s is %s', (path, layout) => {
    expect(shellLayoutFor(path)).toBe(layout);
  });
});

describe('navKind', () => {
  it('is sibling inside one layout group (tab-like pages share a frame)', () => {
    expect(navKind('/games', '/apps')).toBe('sibling');
    expect(navKind('/settings/a', '/settings/b')).toBe('sibling');
  });
  it('is cross between groups', () => {
    expect(navKind('/games', '/blog')).toBe('cross');
    expect(navKind('/', '/settings')).toBe('cross');
  });
  it('ignores query strings and hashes', () => {
    expect(navKind('/games?tab=1', '/apps#top')).toBe('sibling');
  });
});

type Target = { closest: (s: string) => unknown };
const anim = (
  over: Partial<{
    target: Target;
    iterations: number;
    css: boolean;
    timeline: unknown;
    name: string;
  }> = {},
) => {
  const timeline = over.timeline ?? 'doc';
  const finish = vi.fn();
  const target: Target = over.target ?? { closest: () => null };
  const a = {
    timeline,
    effect: { target, getTiming: () => ({ iterations: over.iterations ?? 1 }) },
    finish,
    ...(over.css === false ? {} : { animationName: over.name ?? 'store-rise' }),
  };
  return { a: a as unknown as Animation, finish };
};
const root = (inside: Target[]) =>
  ({ contains: (n: unknown) => inside.includes(n as Target) }) as unknown as Element;

describe('finishEntranceAnimations', () => {
  it('finishes one-shot CSS animations inside the root and reports the count', () => {
    const t: Target = { closest: () => null };
    const one = anim({ target: t });
    expect(
      finishEntranceAnimations(root([t]), [one.a], 'doc' as unknown as AnimationTimeline),
    ).toBe(1);
    expect(one.finish).toHaveBeenCalledOnce();
  });

  it('leaves infinite, outside, transition-driven and scroll-timeline animations alone', () => {
    const inside: Target = { closest: () => null };
    const outside: Target = { closest: () => null };
    const infinite = anim({ target: inside, iterations: Infinity });
    const out = anim({ target: outside });
    const transition = anim({ target: inside, css: false });
    const scroll = anim({ target: inside, timeline: 'scroll' });
    const n = finishEntranceAnimations(
      root([inside]),
      [infinite.a, out.a, transition.a, scroll.a],
      'doc' as unknown as AnimationTimeline,
    );
    expect(n).toBe(0);
    for (const x of [infinite, out, transition, scroll]) expect(x.finish).not.toHaveBeenCalled();
  });

  it('spares the shared swap itself (page-enter): it is the one entrance that is meant to paint', () => {
    const t: Target = { closest: () => null };
    const swap = anim({ target: t, name: 'page-enter' });
    expect(
      finishEntranceAnimations(root([t]), [swap.a], 'doc' as unknown as AnimationTimeline),
    ).toBe(0);
    expect(swap.finish).not.toHaveBeenCalled();
  });

  it('honours data-keep-entrance on the target or an ancestor', () => {
    const kept: Target = { closest: (s) => (s === '[data-keep-entrance]' ? {} : null) };
    const k = anim({ target: kept });
    expect(
      finishEntranceAnimations(root([kept]), [k.a], 'doc' as unknown as AnimationTimeline),
    ).toBe(0);
    expect(k.finish).not.toHaveBeenCalled();
  });

  it('a finish that throws does not stop the rest', () => {
    const t: Target = { closest: () => null };
    const bad = anim({ target: t });
    bad.finish.mockImplementation(() => {
      throw new Error('x');
    });
    const good = anim({ target: t });
    expect(
      finishEntranceAnimations(root([t]), [bad.a, good.a], 'doc' as unknown as AnimationTimeline),
    ).toBe(1);
    expect(good.finish).toHaveBeenCalledOnce();
  });
});

describe('installPageTransitions / commitPageTransition', () => {
  const setup = () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const html = {
      dataset: {} as Record<string, string>,
      classList: { contains: (_: string) => false },
    };
    vi.stubGlobal('document', { documentElement: html });
    const router = {
      subscribe: (ev: string, fn: (e: unknown) => void) => (
        handlers.set(ev, fn),
        () => handlers.delete(ev)
      ),
    };
    const off = installPageTransitions(router as never);
    return { html, handlers, off };
  };

  it('marks the old page as leaving with the kind, but does not touch data-nav-kind yet', () => {
    // Setting nav-kind at the start would make the OLD page's content match the sibling animation rules and start a
    // fresh enter animation under the dim. The kind is applied at commit, when the old page is gone.
    const { html, handlers } = setup();
    handlers.get('onBeforeLoad')!({
      fromLocation: { pathname: '/games' },
      toLocation: { pathname: '/apps' },
    });
    expect(html.dataset.pageLeaving).toBe('sibling');
    expect(html.dataset.navKind).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('commit applies the kind and ends the leave', () => {
    const { html, handlers } = setup();
    handlers.get('onBeforeLoad')!({
      fromLocation: { pathname: '/games' },
      toLocation: { pathname: '/blog' },
    });
    expect(html.dataset.pageLeaving).toBe('cross');
    commitPageTransition(html as never);
    expect(html.dataset.navKind).toBe('cross');
    expect(html.dataset.pageLeaving).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('back/forward (nav-pop) never dims, but still commits its kind', () => {
    const { html, handlers } = setup();
    html.classList.contains = (c: string) => c === 'nav-pop';
    handlers.get('onBeforeLoad')!({
      fromLocation: { pathname: '/apps' },
      toLocation: { pathname: '/games' },
    });
    expect(html.dataset.pageLeaving).toBeUndefined();
    commitPageTransition(html as never);
    expect(html.dataset.navKind).toBe('sibling');
    vi.unstubAllGlobals();
  });

  it('resolving does not end the leave: the commit does (React commits after onResolved, and the old page must not flash back)', () => {
    vi.useFakeTimers();
    const { html, handlers } = setup();
    handlers.get('onBeforeLoad')!({
      fromLocation: { pathname: '/games' },
      toLocation: { pathname: '/apps' },
    });
    handlers.get('onResolved')!({});
    vi.advanceTimersByTime(100);
    expect(html.dataset.pageLeaving).toBe('sibling'); // still dimmed, waiting for the new page
    commitPageTransition(html as never);
    expect(html.dataset.pageLeaving).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(html.dataset.pageLeaving).toBeUndefined();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a navigation that resolves and never commits (cancelled, same page) clears the leave after a short grace', () => {
    vi.useFakeTimers();
    const { html, handlers } = setup();
    handlers.get('onBeforeLoad')!({
      fromLocation: { pathname: '/games' },
      toLocation: { pathname: '/apps' },
    });
    handlers.get('onResolved')!({});
    vi.advanceTimersByTime(400);
    expect(html.dataset.pageLeaving).toBeUndefined();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('watchEntrances', () => {
  const stubs = () => {
    let cb: (() => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(fn: () => void) {
          cb = fn;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.useFakeTimers();
    return { fire: () => cb?.(), disconnect };
  };
  const done = () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  };

  it('finishes entrances of content that mounts after the commit (data arriving), for a short window', () => {
    const { fire, disconnect } = stubs();
    const t: Target = { closest: () => null };
    const late = anim({ target: t });
    const off = watchEntrances(root([t]), {
      animations: () => [late.a],
      timeline: 'doc' as unknown as AnimationTimeline,
    });
    fire(); // a node was added
    vi.runAllTicks();
    expect(late.finish).toHaveBeenCalled();
    vi.advanceTimersByTime(1000); // the window closes by itself
    expect(disconnect).toHaveBeenCalled();
    off();
    done();
  });

  it('the disposer disconnects at once (the next navigation takes over)', () => {
    const { disconnect } = stubs();
    const off = watchEntrances(root([]), { animations: () => [] });
    off();
    expect(disconnect).toHaveBeenCalled();
    done();
  });
});

describe('armEntranceGuard', () => {
  it('starts guarding when a navigation starts (a nested layout can remount before the pathname commits)', () => {
    const observed: unknown[] = [];
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(public fn: () => void) {}
        observe(n: unknown) {
          observed.push(n);
        }
        disconnect() {}
      },
    );
    const column = { id: 'page-root' };
    const handlers = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('document', {
      documentElement: {
        dataset: {} as Record<string, string>,
        classList: { contains: () => false },
      },
      querySelector: (s: string) => (s === '.page-root' ? column : null),
    });
    vi.useFakeTimers();
    installPageTransitions({
      subscribe: (ev: string, fn: (e: unknown) => void) => (handlers.set(ev, fn), () => {}),
    } as never);
    handlers.get('onBeforeLoad')!({
      fromLocation: { pathname: '/settings' },
      toLocation: { pathname: '/settings/appearance' },
    });
    expect(observed).toContain(column);
    armEntranceGuard(800); // re-arming replaces the previous guard without throwing
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('swapContentAfter (a state-based tab switch)', () => {
  type Sib = {
    matches: (s: string) => boolean;
    animate: ReturnType<typeof vi.fn>;
    nextElementSibling: Sib | null;
  };
  const sib = (excluded = false): Sib => ({
    matches: () => excluded,
    animate: vi.fn(),
    nextElementSibling: null,
  });
  const chain = (...items: Sib[]) => {
    items.forEach((x, i) => (x.nextElementSibling = items[i + 1] ?? null));
    return items;
  };

  it('dims-and-rises every sibling after the tab strip with the shared tokens, never the strip itself', () => {
    const [anchor, a, b] = chain(sib(), sib(), sib());
    swapContentAfter(anchor as never, { dim: 0.6, ms: 120, finish: () => 0 });
    expect(anchor.animate).not.toHaveBeenCalled();
    for (const x of [a, b]) {
      expect(x.animate).toHaveBeenCalledWith(
        [{ opacity: 0.6 }, { opacity: 1 }],
        expect.objectContaining({ duration: 120 }),
      );
    }
  });

  it('skips elements that are not content (the floating compose button, opted-out entrances)', () => {
    const [anchor, fab, content] = chain(sib(), sib(true), sib());
    swapContentAfter(anchor as never, { dim: 0.6, ms: 120, finish: () => 0 });
    expect(fab.animate).not.toHaveBeenCalled();
    expect(content.animate).toHaveBeenCalledOnce();
  });

  it('also finishes the entrances the swapped content mounted with', () => {
    const [anchor] = chain(sib(), sib());
    const finish = vi.fn(() => 0);
    swapContentAfter(anchor as never, { dim: 0.6, ms: 120, finish });
    expect(finish).toHaveBeenCalled();
  });
});
