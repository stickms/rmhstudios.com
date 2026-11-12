/**
 * The site shell (Steel section 9, 8.1; plan 15.1): it renders complete with no client hooks of its own, the sidebar
 * lists exactly the five sections, and the phone globe is a button that exposes `aria-expanded`, opens on a state
 * attribute and closes on Escape. The suite is `node` (no DOM), so markup is asserted through `renderToString`, the
 * keyboard rules through the pure functions the component delegates to, and the motion contract through the stylesheet.
 * `testing/e2e/steel-rest.mjs` drives the real thing in a browser.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pathname: '/', unread: 0 }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: ReactNode } & Record<string, unknown>) => {
    const { search: _search, activeProps: _a, ...props } = rest;
    return createElement('a', { href: to, ...props }, children);
  },
  useNavigate: () => () => {},
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({
      location: { pathname: state.pathname, href: state.pathname },
      resolvedLocation: { pathname: state.pathname, href: state.pathname },
    }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: Record<string, unknown>) => {
      const text =
        (opts?.defaultValue as string | undefined) ??
        (opts?.defaultValue_other as string | undefined) ??
        _key;
      return text.replace('{{count}}', String(opts?.count ?? ''));
    },
  }),
}));
vi.mock('@/components/Providers', () => ({
  useSession: () => ({ data: null, isPending: false }),
  useResolvedUser: () => ({ resolved: null, refresh: () => {} }),
}));
vi.mock('@/lib/useUnreadCount', () => ({ useUnreadCount: () => state.unread }));
vi.mock('@/lib/useNotificationCount', () => ({ useNotificationCount: () => ({ count: 0 }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const { SiteShell } = await import('../SiteShell');
const { SECTIONS, currentSection, pageOwnsPrimary } = await import('../sections');
const { globeKeyAction } = await import('../globe-nav-state');

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function html(pathname = '/', unread = 0): string {
  state.pathname = pathname;
  state.unread = unread;
  return renderToString(
    createElement(SiteShell, null, createElement('p', { id: 'page-content' }, 'The page')),
  );
}

describe('SiteShell renders complete without client hooks (B1, L1, L2)', () => {
  it('its own file calls no hook and imports no React state', () => {
    const src = read('components/shell/SiteShell.tsx');
    expect(src).not.toMatch(/\buse[A-Z]\w*\s*\(/);
    expect(src).not.toMatch(/from 'react'[^;]*\buse/);
    expect(src).not.toContain('useEffect');
  });

  it('renders the skip link, the sidebar, the content slot, the margin and the docked globe', () => {
    const out = html();
    expect(out.indexOf('class="site-skip"')).toBeGreaterThan(-1);
    // A5: the skip link is the first focusable element.
    expect(out.indexOf('class="site-skip"')).toBeLessThan(out.indexOf('site-sidebar'));
    expect(out).toContain('class="site-sidebar"');
    expect(out).toMatch(/<main id="main-content" tabindex="-1" class="site-main page-root">\s*<p id="page-content">The page<\/p>/);
    expect(out).toContain('class="site-margin"');
    expect(out).toContain('globe-nav__globe');
    expect(out).toContain('data-chrome="ball"');
  });

  it('has the words RMH Studios as the link home, room for the globe in the sidebar, and a search field in the margin', () => {
    const out = html();
    expect(out).toMatch(/site-sidebar__brand"><a [^>]*href="\/"[^>]*>RMH Studios<\/a>/);
    // The globe is ONE element for phone and desktop (GlobeNav); the sidebar only keeps its place.
    expect(out).toContain('site-sidebar__globe-space');
    expect(out.match(/data-chrome="ball"/g)).toHaveLength(1);
    expect(out).toMatch(/<form role="search" class="site-margin__search" action="\/explore" method="get"/);
  });
});

describe('the sidebar never scrolls: the lists give way to the globe and the foot (owner, 2026-11-12)', () => {
  const shell = read('components/shell/site-shell.css');
  it('is, top to bottom: the words, the other places, the globe, the primary, the handle', () => {
    const out = html();
    const order = ['site-sidebar__sections', 'site-sidebar__more', 'site-sidebar__globe-space', 'site-sidebar__write', 'site-sidebar__account'].map(
      (name) => out.indexOf(name),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('clips, never scrolls, and drops whole links when the window is short', () => {
    const inner = /\.site-sidebar__inner \{([^}]*)\}/.exec(shell)![1]!;
    expect(inner).toContain('overflow: hidden');
    expect(inner).not.toContain('overflow-y: auto');
    // The second list takes what is left and the five words shrink only after it; the globe's place never shrinks.
    expect(shell).toMatch(/\.site-sidebar__more \{\s*flex: 1 1 0;/);
    expect(shell).toMatch(/\.site-sidebar__sections \{\s*flex: 0 1 auto;/);
    expect(shell).toMatch(/\.site-sidebar__globe-space \{\s*flex: none;\s*block-size: 140px;/);
    expect(shell).toMatch(/flex-flow: column wrap;/);
  });

  it('places the globe above the foot: 26px plus the primary, the handle and their gaps', () => {
    const css = read('components/shell/globe-nav.css');
    const desktop = /@media \(min-width: 1024px\) \{\s*\.globe-nav \{([^}]*)\}/.exec(css)![1]!;
    expect(desktop).toContain('--globe-bottom: 130px');
    expect(shell).toMatch(/\.site-sidebar__write \{[^}]*block-size: 36px/);
    expect(shell).toMatch(/\.site-sidebar__account \{[^}]*margin-block-start: 14px;\s*block-size: 36px/);
    expect(shell).toMatch(/\.site-sidebar__globe-space \{[^}]*margin-block-end: 18px/);
  });
});

describe('the sidebar lists exactly the five sections (L4)', () => {
  it('Feed, Explore, Games, Inbox, You, as words, in that order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['front', 'explore', 'games', 'inbox', 'you']);
    const out = html();
    const nav = /<nav class="site-sidebar__sections" aria-label="Sections">([\s\S]*?)<\/nav>/.exec(out)![1]!;
    const labels = [...nav.matchAll(/<a [^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(['Feed', 'Explore', 'Games', 'Inbox', 'You']);
  });

  it('lists the other destinations as a second, quieter list of words', () => {
    const out = html('/library');
    const nav = /<nav class="site-sidebar__more" aria-label="More places">([\s\S]*?)<\/nav>/.exec(out)![1]!;
    const hrefs = [...nav.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of ['/create', '/library', '/communities', '/store']) expect(hrefs).toContain(href);
    // Nothing the five words already lead to, and nothing that needs an account or an admin when signed out.
    for (const href of ['/', '/explore', '/games', '/messages', '/admin']) expect(hrefs).not.toContain(href);
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
    expect(nav).not.toMatch(/<svg/);
  });

  it('marks the current section and no other', () => {
    const out = html('/explore');
    const nav = /<nav class="site-sidebar__sections" aria-label="Sections">([\s\S]*?)<\/nav>/.exec(out)![1]!;
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
    expect(/href="\/explore"[^>]*aria-current="page"/.test(nav)).toBe(true);
  });

  it('puts the primary button, no icons beside the words, and no top bar anywhere', () => {
    const out = html();
    const nav = /<nav class="site-sidebar__sections" aria-label="Sections">([\s\S]*?)<\/nav>/.exec(out)![1]!;
    expect(nav).not.toContain('<svg');
    expect(out).toContain('Write a post');
    expect(out).not.toContain('<header');
  });

  it('the sidebar button is the primary only where the page has none of its own (R4)', () => {
    const write = (path: string) => /<a [^>]*data-variant="(\w+)"[^>]*>Write a post/.exec(html(path))?.[1];
    expect(write('/')).toBe('default');
    expect(write('/u/rmh/post/abc')).toBe('default');
    expect(write('/explore')).toBe('primary');
    expect(write('/u/rmh')).toBe('primary');
    expect(pageOwnsPrimary('/u/rmh/post/abc')).toBe(true);
    expect(pageOwnsPrimary('/u/rmh')).toBe(false);
  });

  it('maps paths to sections', () => {
    expect(currentSection('/')).toBe('front');
    expect(currentSection('/explore')).toBe('explore');
    expect(currentSection('/games/altair')).toBe('games');
    expect(currentSection('/apps')).toBe('games');
    expect(currentSection('/messages')).toBe('inbox');
    expect(currentSection('/u/rmh')).toBe('you');
    expect(currentSection('/library')).toBeNull();
  });
});

describe('the phone globe (G1 to G8)', () => {
  it('is a button with aria-expanded and aria-controls naming the pins nav, labelled Open navigation', () => {
    const out = html();
    const button = /<button[^>]*globe-nav__globe[^>]*>/.exec(out)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-label="Open navigation"');
    expect(button).toContain('data-chrome="ball"');
    // The canvas is sized for the open globe only while it is open (lib/globe/view.ts sets data-chrome-max then).
    expect(button).not.toContain('data-chrome-max');
    const controls = /aria-controls="([^"]+)"/.exec(button)![1];
    expect(out).toContain(`<nav id="${controls}" class="globe-nav__pins"`);
    // State is one attribute, absent at rest.
    expect(out).not.toMatch(/class="globe-nav"[^>]*data-open/);
  });

  it('is a link to /sections with scripting off (G7)', () => {
    expect(html()).toMatch(/<noscript><a class="globe-nav__fallback" href="\/sections">Open navigation<\/a><\/noscript>/);
  });

  it('carries every destination as a real link with an icon and a name, and marks the current one', () => {
    const out = html('/games');
    const pins = /<nav id="[^"]+" class="globe-nav__pins"[^>]*>([\s\S]*?)<\/nav>/.exec(out)![1]!;
    const links = [...pins.matchAll(/<a [^>]*class="globe-nav__pin"[^>]*>/g)].map((m) => m[0]);
    // Every destination the liquid globe carried (lib/sidebar-nav), not five words. Signed out: no Inbox, no Admin.
    expect(links.length).toBeGreaterThanOrEqual(10);
    for (const href of ['/', '/explore', '/games', '/library', '/store']) {
      expect(links.some((l) => l.includes(`href="${href}"`)), href).toBe(true);
    }
    const current = links.filter((l) => l.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/games"');
    expect(current[0]).toContain('data-pin="current"');
    expect(pins.match(/globe-nav__pin-dot/g)!.length).toBe(links.length);
    expect(pins.match(/globe-nav__pin-name/g)!.length).toBe(links.length);
    // The front page is named by the section word.
    expect(pins).toMatch(/globe-nav__pin-name">Feed</);
    expect(pins).toContain('Write a post');
  });

  it('shows unread as a dot with a text equivalent when docked and a number on the Inbox pin (G8)', () => {
    const out = html('/', 3);
    expect(out).toMatch(/globe-nav__dot"><span class="sr-only">3 unread/);
    expect(html('/', 0)).not.toContain('globe-nav__dot');
  });

  it('reaches the chrome renderer only through a dynamic import (V4)', () => {
    const src = read('components/shell/GlobeNav.tsx');
    expect(src).toMatch(/void import\('@\/lib\/chrome'\)\.then\(\(m\) => m\.animateChrome\(360\)\)/);
    expect(src).not.toMatch(/from\s+['"]@\/lib\/chrome/);
    expect(src).not.toMatch(/Worker|getContext|requestAnimationFrame|<canvas/);
  });
});

describe('Escape closes and Tab stays inside while open (G4, G7)', () => {
  const base = { shiftKey: false, open: true, stops: 8, active: 3 };
  it('Escape closes an open globe and does nothing to a closed one', () => {
    expect(globeKeyAction({ ...base, key: 'Escape' })).toEqual({ type: 'close' });
    expect(globeKeyAction({ ...base, key: 'Escape', open: false })).toEqual({ type: 'none' });
  });
  it('Tab wraps at both ends and returns from outside', () => {
    expect(globeKeyAction({ ...base, key: 'Tab', active: 7 })).toEqual({ type: 'focus', index: 0 });
    expect(globeKeyAction({ ...base, key: 'Tab', shiftKey: true, active: 0 })).toEqual({ type: 'focus', index: 7 });
    expect(globeKeyAction({ ...base, key: 'Tab', active: -1 })).toEqual({ type: 'focus', index: 0 });
    expect(globeKeyAction({ ...base, key: 'Tab' })).toEqual({ type: 'none' });
  });
  it('ignores other keys', () => {
    expect(globeKeyAction({ ...base, key: 'a' })).toEqual({ type: 'none' });
  });
});

describe('the globe animates transform and opacity only, in 360 ms (G2, G6)', () => {
  const css = read('components/shell/globe-nav.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('opens by transform (4.5x on a phone) in 0.36s on cubic-bezier(0.2, 0, 0, 1), under a flat 80% veil', () => {
    expect(css).toMatch(/transition: transform 0\.36s var\(--globe-ease\)/);
    expect(css).toContain('--globe-ease: var(--m4-curve)');
    expect(read('app/styles/steel-chrome.css')).toContain('--m4-curve: cubic-bezier(0.2, 0, 0, 1)');
    expect(css).toMatch(/scale\(var\(--globe-scale, 4\.5\)\)/);
    expect(css).toMatch(/\.globe-nav\[data-open\] \.globe-nav__veil \{[^}]*opacity: 0\.8/);
    expect(css).not.toMatch(/backdrop-filter|[^-]filter:|blur\(/);
  });

  it('never transitions a layout property', () => {
    const props = [...css.matchAll(/transition:\s*([^;]+);/g)]
      .filter((m) => m[1]!.trim() !== 'none')
      .flatMap((m) => m[1]!.split(',').map((part) => part.trim().split(/\s+/)[0]));
    expect(new Set(props)).toEqual(new Set(['transform', 'opacity', 'visibility']));
  });

  it('floats 18px above the bottom edge and follows Safari\'s toolbar and the inset in CSS', () => {
    expect(css).toMatch(/--globe-bottom: calc\(18px \+ env\(safe-area-inset-bottom, 0px\) \+ var\(--vv-follow, 0px\)\)/);
    expect(css).toMatch(/\.globe-nav__dock \{[^}]*inset-block-end: var\(--globe-bottom\)/);
  });

  it('places pins by transform from the sphere, never from fixed offsets, and hangs the write link under the globe', () => {
    expect(css).not.toMatch(/data-slot-pos/);
    expect(css).toMatch(/\.globe-nav__write \{\s*--dy: calc\(var\(--globe-open-d\) \/ 2 \+ 40px\);/);
    // The pins wait for the body: nothing is shown at a wrong place before lib/globe has landed.
    expect(css).toMatch(/\.globe-nav\[data-globe-live\] \.globe-nav__pins \{\s*opacity: 1;/);
  });

  it('carries its icons docked too: the anchor sits at the ball and is scaled with it, and takes no pointer until open', () => {
    const pins = /\n\.globe-nav__pins \{([^}]*)\}/.exec(css)![1]!;
    expect(pins).toContain('inset-block-end: calc(var(--globe-bottom) + var(--globe-d) / 2)');
    expect(pins).toContain('transform: scale(calc(1 / var(--globe-scale, 4.5)))');
    expect(pins).toContain('pointer-events: none');
    expect(css).toMatch(/\.globe-nav\[data-open\]\[data-globe-live\] \.globe-nav__pins \{\s*pointer-events: auto;/);
    // Docked the pins are a picture: the nav is inert until the menu opens.
    expect(html()).toMatch(/class="globe-nav__pins"[^>]* inert/);
  });

  it('is the navigator on desktop too: a 124px ball at the foot of the sidebar that grows to 440px', () => {
    const desktop = /@media \(min-width: 1024px\) \{\s*\.globe-nav \{([^}]*)\}/.exec(css)![1]!;
    expect(desktop).toContain('--globe-d: 124px');
    expect(desktop).toContain('--globe-open-d: 440px');
    expect(desktop).not.toContain('display: none');
  });
});
