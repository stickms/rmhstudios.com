import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ search: {} as Record<string, unknown> }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, string>) =>
      (o?.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => o?.[name] ?? ''),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => Promise.resolve(),
  useSearch: () => route.search,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: '/med', href: '/med' }, matches: [{ routeId: '/med/' }] }),
}));

import { SourceToggle, sourceOnKey } from './SourceToggle';
import { saveSourcePref } from '../useSourcePref';
import { SOURCE_PREF_KEY } from '../../engine/source-pref';

afterEach(() => {
  route.search = {};
});

describe('the header source toggle (owner 2026-11-24)', () => {
  it('is a radiogroup of two named, titled radios with the favicons, one tab stop on the checked one', () => {
    const html = renderToStaticMarkup(<SourceToggle />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Figures from"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="CycleTrack"');
    expect(html).toContain('aria-label="Admit.org"');
    expect(html).toContain('title="Figures from CycleTrack"');
    expect(html).toContain('title="Figures from Admit.org"');
    // Default: CycleTrack checked and focusable, Admit.org reachable by the arrows only.
    expect(html).toMatch(/aria-checked="true" aria-label="CycleTrack"[^>]*tabindex="0"/);
    expect(html).toMatch(/aria-checked="false" aria-label="Admit.org"[^>]*tabindex="-1"/);
    // The glyphs are single-colour paths in the text colour, hidden from assistive tech.
    expect(html.match(/fill="currentColor"/g)).toHaveLength(2);
    expect(html).toContain('aria-hidden="true"');
  });

  it('follows the URL on the server render (a device choice applies after hydration)', () => {
    route.search = { source: 'admit' };
    const html = renderToStaticMarkup(<SourceToggle />);
    expect(html).toMatch(/aria-checked="true" aria-label="Admit.org"[^>]*tabindex="0"/);
  });

  it('moves and checks with the arrows (wrapping, reversed in RTL), Home and End', () => {
    expect(sourceOnKey('cycletrack', 'ArrowRight')).toBe('admit');
    expect(sourceOnKey('cycletrack', 'ArrowDown')).toBe('admit');
    expect(sourceOnKey('admit', 'ArrowRight')).toBe('cycletrack');
    expect(sourceOnKey('admit', 'ArrowLeft')).toBe('cycletrack');
    expect(sourceOnKey('cycletrack', 'ArrowUp')).toBe('admit');
    expect(sourceOnKey('cycletrack', 'ArrowLeft', true)).toBe('admit');
    expect(sourceOnKey('admit', 'ArrowRight', true)).toBe('cycletrack');
    expect(sourceOnKey('admit', 'Home')).toBe('cycletrack');
    expect(sourceOnKey('cycletrack', 'End')).toBe('admit');
    expect(sourceOnKey('cycletrack', 'Enter')).toBeNull();
    expect(sourceOnKey('cycletrack', 'a')).toBeNull();
  });

  it('remembers only a non-default choice on this device', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    vi.stubGlobal('localStorage', fake);
    try {
      saveSourcePref('admit');
      expect(store.get(SOURCE_PREF_KEY)).toBe('admit');
      saveSourcePref('cycletrack');
      expect(store.has(SOURCE_PREF_KEY)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sits in the header, in the pressed style of the segmented control, 44px, and only from 600px', () => {
    const actions = readFileSync('features/medschools/ui/shell/HeaderActions.tsx', 'utf8');
    expect(actions).toContain('<SourceToggle />');
    expect(actions).toContain('<SourceMenuRows');
    const css = readFileSync('features/medschools/ui/medschools/frame-controls.css', 'utf8');
    const block = css.slice(css.indexOf('.medapp-chips.medapp-srctoggle {'));
    expect(block).toMatch(/\.medapp-chip\.medapp-srctoggle__opt \{[^}]*inline-size: 44px;[^}]*min-block-size: 44px;/);
    expect(block).toMatch(
      /@media \(min-width: 600px\) \{\s*\.medapp-chips\.medapp-srctoggle \{\s*display: inline-flex;/,
    );
    // The checked option takes the chips' paper fill and border (never colour alone).
    expect(css).toMatch(/\.medapp-chip\[aria-checked='true'\][\s\S]*?background-color: var\(--app-surface\);/);
    expect(readFileSync('lib/device-data/registry.ts', 'utf8')).toContain(`'${SOURCE_PREF_KEY}'`);
  });
});
