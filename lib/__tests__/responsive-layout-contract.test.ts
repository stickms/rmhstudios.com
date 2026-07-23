import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('spatial redesign — responsive layout contract', () => {
  it('keeps the shared mobile masthead inside narrow viewports', () => {
    const pageLayout = source('components/feed/PageLayout.tsx');
    const mobileHeader = source('components/feed/MobileHeader.tsx');
    const globals = source('app/globals.css');

    expect(pageLayout).toContain('<span className="min-w-0 truncate">{title}</span>');
    expect(pageLayout).toContain('data-slot="page-header-action"');
    expect(mobileHeader).toContain('max-[419px]:hidden');
    expect(globals).toContain("[data-slot='page-header-action'] [data-slot='button']");
    expect(globals).toContain('top: calc(var(--safe-top) + var(--site-sticky-edge));');
  });

  it('uses a phone-first announcement layout with a full-width primary action', () => {
    const modal = source('components/feed/WhatsNewModal.tsx');

    expect(modal).toContain('grid-cols-1');
    expect(modal).toContain('sm:grid-cols-3');
    expect(modal).toContain('w-full sm:ml-auto sm:w-auto');
  });

  it('gives carousel controls touch-sized hit areas', () => {
    const newsHero = source('components/news/NewsHero.tsx');

    expect(newsHero).toContain('data-slot="news-hero-control"');
    expect(newsHero).toContain('data-slot="news-hero-dot"');
    expect(newsHero).toContain('size-11');
    expect(newsHero).toContain('h-11');
    expect(newsHero).toContain('onPointerDown={() => setIsPaused(true)}');
  });

  it('keeps standalone parallax pages safe-area aware without creating scroll roots', () => {
    const capital = source('components/rmh-capital/rmh-capital.css');
    const pmc = source('components/rmh-pmc/rmh-pmc.css');
    const rmhtech = source('components/rmhtech/rmhtech.css');

    for (const stylesheet of [capital, pmc, rmhtech]) {
      expect(stylesheet).toContain('overflow-x:clip');
      expect(stylesheet).toContain('env(safe-area-inset-top,0px)');
    }
  });
});
