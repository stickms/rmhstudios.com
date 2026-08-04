import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridClassFor } from '@/lib/whats-new';

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('spatial redesign — responsive layout contract', () => {
  it('keeps the shared mobile masthead inside narrow viewports', () => {
    const pageLayout = source('components/feed/PageLayout.tsx');
    const mobileHeader = source('components/feed/MobileHeader.tsx');
    const globals = source('app/globals.css');

    // The title span must keep `min-w-0` on BOTH paths so it can shrink inside
    // the header's flex row instead of forcing the column wider than the
    // viewport. The default still truncates (a page name is one line); article
    // pages opt into `wrapTitle`, because a headline that cannot wrap does not
    // ellipsize on an inline span — `white-space: nowrap` applies but
    // `overflow: hidden` does not — it overflows, which is the exact failure
    // this test guards.
    expect(pageLayout).toContain(
      "<span className={wrapTitle ? 'block min-w-0' : 'min-w-0 truncate'}>{title}</span>",
    );
    expect(pageLayout).toContain('data-slot="page-header-action"');
    expect(mobileHeader).toContain('max-[419px]:hidden');
    expect(globals).toContain("[data-slot='page-header-action'] [data-slot='button']");
    expect(globals).toContain('top: calc(var(--safe-top) + var(--site-sticky-edge));');
  });

  it('uses a phone-first announcement layout with a full-width primary action', () => {
    const modal = source('components/feed/WhatsNewModal.tsx');

    // The announcement's grid moved into `lib/whats-new.ts` when the modal
    // became data-driven, so the column classes are asserted there — and as
    // behaviour rather than as a substring, which is a stronger guarantee than
    // the grep this replaced: EVERY supported card count must start at one
    // column and only widen from `sm:` up.
    for (const count of [2, 3, 4]) {
      const cls = gridClassFor(count);
      expect({ count, phoneFirst: cls.startsWith('grid-cols-1') }).toEqual({
        count,
        phoneFirst: true,
      });
      // No unprefixed multi-column class would override the phone-first base.
      expect({ count, bare: /(^|\s)grid-cols-[2-9]/.test(cls) }).toEqual({ count, bare: false });
    }

    // The dismiss button still spans the sheet on a phone.
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
