/**
 * Module preloads are emitted at `fetchpriority="low"`.
 *
 * ## Why
 *
 * Every page's head carries ~80–100 `<link rel="modulepreload">` hints. At
 * their default `High` priority they shared a slow link equally with the Inter
 * preload, so the font finished after the JavaScript — 6–8 s on 3G, ~31 s on
 * 2G — and text painted in the fallback and re-shaped long after first paint.
 * `components/SiteHeadContent.tsx` lowers them; docs/performance-audit-2026-10-21.md
 * has the measurements. The failure mode this guards is a quiet revert: the
 * root shell going back to the router's stock `<HeadContent />`, which is what
 * every TanStack example uses.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RouterManagedTag } from '@tanstack/react-router';
import { deprioritizeModulePreloads } from '@/components/SiteHeadContent';

describe('deprioritizeModulePreloads', () => {
  it('lowers modulepreload links and leaves every other tag untouched', () => {
    const tags: RouterManagedTag[] = [
      { tag: 'title', children: 'RMH' },
      { tag: 'link', attrs: { rel: 'modulepreload', href: '/assets/a.js' } },
      { tag: 'link', attrs: { rel: 'stylesheet', href: '/assets/a.css' } },
      { tag: 'link', attrs: { rel: 'preload', as: 'font', href: '/f.woff2' } },
      { tag: 'meta', attrs: { name: 'description', content: 'x' } },
    ];
    const out = deprioritizeModulePreloads(tags);
    expect(out[1]).toEqual({
      tag: 'link',
      attrs: { rel: 'modulepreload', href: '/assets/a.js', fetchPriority: 'low' },
    });
    for (const i of [0, 2, 3, 4]) expect(out[i]).toBe(tags[i]);
    // input is not mutated (the router reuses its tag objects across renders)
    expect(tags[1].attrs).toEqual({ rel: 'modulepreload', href: '/assets/a.js' });
  });

  it('respects a priority the route already set', () => {
    const tag: RouterManagedTag = {
      tag: 'link',
      attrs: { rel: 'modulepreload', href: '/a.js', fetchPriority: 'high' },
    };
    expect(deprioritizeModulePreloads([tag])[0]).toBe(tag);
  });
});

describe('the root shell renders SiteHeadContent', () => {
  it('does not use the stock HeadContent', () => {
    const src = readFileSync(resolve(__dirname, '../../app/routes/__root.tsx'), 'utf8');
    expect(src).toMatch(/<SiteHeadContent\s*\/>/);
    expect(src).not.toMatch(/<HeadContent\b/);
  });
});
