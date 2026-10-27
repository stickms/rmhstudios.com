import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../PagesTab.tsx', import.meta.url), 'utf8');

describe('the Create "Pages" gallery uses the shared page toolbar', () => {
  it('its search sits in the same `page-controls` toolbar as /games and /create/builds, not in a custom title bar', () => {
    // /create drifted: a `glass-chrome` bar with a "Pages" title on the left pushed the search to x=76 on a phone while
    // the heading and tab strip started at 16 (pnpm audit:pages). The tab already says "Pages"; the search takes the row.
    expect(src).toContain('data-slot="page-controls"');
    expect(src).toContain('builds-toolbar');
    expect(src).not.toContain('vibe-gallery__head');
    expect(src).not.toContain('store-pages__head');
  });

  it('loads the toolbar styles it now uses', () => {
    expect(src).toContain("import '@/components/builds/builds.css';");
  });
});
