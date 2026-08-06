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

  it('lets tall dialogs scroll instead of clipping what does not fit', () => {
    // Every overlay is capped at the visible viewport by `.glass-overlay`
    // (max-block-size), so a dialog taller than a phone has exactly two
    // outcomes: it scrolls, or the overflow is unreachable. `overflow-hidden`
    // on the content element picks the second one — it overrides the Dialog
    // primitive's own `overflow-y-auto` — and that is how the announcement
    // sheet shipped with its cards and its "Got it" button below the fold and
    // nothing to scroll.
    //
    // The rule is therefore: a `DialogContent` may only clip if it also owns a
    // scrolling region inside itself (the header + `flex-1 overflow-y-auto`
    // body shape the list modals use). Asserted per file rather than by a tree
    // walk so the failure names the dialog.
    const clipping = [
      'components/feed/WhatsNewModal.tsx',
      'components/feed/ShareModal.tsx',
      'components/feed/AIImageButton.tsx',
    ].filter((file) => /<DialogContent[^>]*overflow-hidden/.test(source(file)));
    expect(clipping).toEqual([]);

    // The dialogs that DO clip pair it with an inner scroller, and cap
    // themselves in dynamic viewport units — `vh` is the toolbar-less viewport
    // on mobile Safari, which is not the one the sheet is being read in.
    for (const file of [
      'components/feed/EngagementListModal.tsx',
      'components/feed/InsightsModal.tsx',
      'components/feed/SocialListModal.tsx',
    ]) {
      const src = source(file);
      expect({ file, capped: /max-h-\[\d+dvh\]/.test(src) }).toEqual({ file, capped: true });
      expect({ file, scrolls: src.includes('overflow-y-auto') }).toEqual({ file, scrolls: true });
    }

    // …and the announcement's own stylesheet must not re-clip what the
    // component stopped clipping.
    const css = source('components/feed/feed.css');
    const block = css.slice(css.indexOf('.spatial-whats-new {'));
    expect(block.slice(0, block.indexOf('}'))).toContain('overflow-y: auto');
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
