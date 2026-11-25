import { readFileSync } from 'node:fs';
import { readCss } from '@/lib/__tests__/css-source';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MODE_STORAGE_KEY, resolveMode, serializeMode } from '../../engine/mode';
import { backTargetFor, isMedIndex } from './back-target';

const route = vi.hoisted(() => ({ pathname: '/med/live' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} {...(rest as object)}>
      {children as never}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: route.pathname, href: route.pathname }, matches: [] }),
  useRouter: () => ({ history: { back: () => undefined } }),
  // The source toggle (`SourceToggle`) reads the URL's `source` and navigates in place.
  useSearch: () => ({}),
  useNavigate: () => () => Promise.resolve(),
}));

const read = (f: string) => readFileSync(f, 'utf8');

describe('medschools shell', () => {
  it('chooses the left button: the index links home to the site, everything else goes back to the index', () => {
    expect(backTargetFor('/med')).toBe('/');
    expect(backTargetFor('/med/')).toBe('/');
    expect(isMedIndex('/med/')).toBe(true);
    expect(isMedIndex('/med/live')).toBe(false);
    for (const p of ['/med/live', '/med/duke', '/med/tracker', '/med/lists', '/med/ask'])
      expect(backTargetFor(p)).toBe('/med');
  });

  it('draws the back link on a sub-page, 44px round, with a label and a fallback href', async () => {
    const { MedTopBar } = await import('./MedTopBar');
    const html = renderToStaticMarkup(<MedTopBar />);
    expect(html).toContain('href="/med"');
    expect(html).toContain('aria-label="Back to all schools"');
    expect(html).toContain('<span class="medapp-title">RMH Med Schools</span>');
    expect(html).not.toContain('<h1');
    // The theme toggle renders on the server with no pressed state (the mode lives in this device's storage).
    expect(html).toContain('aria-label="Dark mode"');
    expect(html).not.toContain('aria-pressed');
  });

  it('draws a home link on the index, to the site home, and makes the app name the page h1', async () => {
    const { MedTopBar } = await import('./MedTopBar');
    route.pathname = '/med';
    try {
      const html = renderToStaticMarkup(<MedTopBar />);
      expect(html).toContain('href="/"');
      expect(html).toContain('aria-label="RMH home"');
      expect(html).not.toContain('Back to all schools');
      expect(html).toContain('<h1 class="medapp-title">RMH Med Schools</h1>');
    } finally {
      route.pathname = '/med/live';
    }
  });

  it('puts the actions in the bar as named 44px icon links, never a link to the page itself (owner 2026-11-24)', async () => {
    const { MedTopBar } = await import('./MedTopBar');
    const on = (p: string) => {
      route.pathname = p;
      try {
        return renderToStaticMarkup(<MedTopBar />);
      } finally {
        route.pathname = '/med/live';
      }
    };
    const index = on('/med');
    expect(index).toContain(
      '<a href="/med/practice" class="medapp-round" aria-label="Interview practice" title="Interview practice">',
    );
    expect(index).toContain(
      '<a href="/med/live" class="medapp-round" aria-label="Live activity" title="Live activity">',
    );
    // Signed out, the member's area is a sign-in link that comes back here.
    expect(index).toContain('aria-label="Sign in to see your cycle and lists"');
    expect(index).toContain('href="/login"');
    expect(index).toContain('aria-label="Dark mode"');
    expect(on('/med/live')).not.toContain('href="/med/live"');
    expect(on('/med/practice')).not.toContain('href="/med/practice"');
    // One group at the bar's end; nothing in the bar is fixed or sticky.
    expect(index).toMatch(/<div class="medapp-bar__actions" role="group" aria-label="Go to">/);
  });

  it('stores the mode as {"dark": boolean}, follows the system otherwise, and shares its key with the pre-paint entry', () => {
    // The key keeps its pre-rename name on purpose: it preserves saved light/dark choices.
    expect(MODE_STORAGE_KEY).toBe('rmh-medschool-mode');
    expect(resolveMode(null, true)).toBe('dark');
    expect(resolveMode(null, false)).toBe('light');
    expect(resolveMode('not json', true)).toBe('dark');
    expect(resolveMode(serializeMode('light'), true)).toBe('light');
    expect(resolveMode(serializeMode('dark'), false)).toBe('dark');
    const theme = read('stores/themeStore.ts');
    expect(theme).toMatch(
      /'\/med': \{\s*(?:\/\/[^\n]*\s*)?key: 'rmh-medschool-mode',\s*darkFlag: 'dark',[^}]*system: true/,
    );
    expect(read('lib/device-data/registry.ts')).toContain("'rmh-medschool-mode'");
    expect(read('lib/prepaint/theme-routes.ts')).toContain("'/med'");
  });

  it('paints both grounds the stylesheet declares as --app-bg', () => {
    const css = readCss('features/medschools/ui/medschools.css').toLowerCase();
    const theme = read('stores/themeStore.ts').toLowerCase();
    const entry = /'\/med': \{[^}]*\}/.exec(theme)?.[0] ?? '';
    for (const hex of ['#f6f1e7', '#1b1e2a']) {
      expect(entry).toContain(hex);
      expect(css).toContain(`--app-bg: ${hex};`);
    }
  });

  it('keeps the wash static: in the flow, no fixed layer, no animation, a tile for each mode', () => {
    const css = readCss('features/medschools/ui/medschools.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.medapp-page\s*\{[^}]*background-image: var\(--app-med-wash-image\)/);
    // Nothing is fixed, and nothing is sticky flush to an edge of the screen. The one rule pinned at 0 is the rail's
    // heading, sticky inside the rail panel's own scroll box (the panel itself sits 16px off the top).
    expect(css).not.toMatch(/position:\s*fixed/);
    const flush = [...css.matchAll(/([^{}]+)\{[^}]*position:\s*sticky\s*;[^}]*inset-block-start:\s*0/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(flush).toEqual(['.medapp-rail-top']);
    expect(css).not.toMatch(/@keyframes|animation:|filter:|backdrop-filter/);
    expect(css).toContain('/images/medschools/wash-light.webp');
    expect(css).toContain('/images/medschools/wash-dark.webp');
    expect(css).toContain('prefers-reduced-data');
  });

  it('defines the status pairs, chart slots and the --site bridge in both modes', () => {
    const css = readCss('features/medschools/ui/medschools.css');
    for (const k of ['accept', 'reject', 'hold', 'secondary', 'waitlist', 'matric', 'interview', 'withdrawn'])
      for (const part of ['swatch', 'ink', 'text']) expect(css).toContain(`--app-med-${k}-${part}:`);
    // A charted category's bars fill with its own pastel (owner 2026-11-24: charts use the status colours).
    for (const k of ['accept', 'reject', 'secondary', 'waitlist', 'interview'])
      expect(css).toContain(`--app-med-${k}-fill:`);
    for (let i = 1; i <= 5; i++) {
      expect(css).toContain(`--app-med-chart-${i}:`);
      expect(css).not.toContain(`--site-chart-${i}`);
    }
    expect(css).toContain("[data-app-dark='1']");
    expect(css).toContain("not([data-app-dark='0'])");
  });

  it('the layout mounts the cookie notice and links the stylesheet, and no display face (one typeface)', () => {
    expect(read('features/medschools/ui/shell/MedApp.tsx')).toContain('<CookieConsent />');
    const route = read('app/routes/med.tsx');
    expect(route).toContain('medschools.css?url');
    // Headings are DM Sans at 600 (owner 2026-11-24): no Fraunces sheet or preload.
    expect(route).not.toMatch(/fraunces|preloadFont/i);
    expect(route).not.toMatch(/inter/i);
    expect(readCss('features/medschools/ui/medschools.css')).toContain('--app-font-display: var(--app-font-body);');
  });
});
