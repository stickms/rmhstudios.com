'use client';

import { useId } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { cn } from '@/lib/utils';
import { DEFAULT_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';
import { AnimatedMain } from './AnimatedMain';
import { ContextRail } from './ContextRail';

interface PageFrameProps {
  children: React.ReactNode;
  /**
   * Page-specific content for the shell's live rail. Portalled into the rail on
   * wide screens and dropped entirely on narrow ones — supplementary only.
   */
  rightSidebar?: React.ReactNode;
  wide?: boolean;
  /**
   * Extra classes for the scrolling column. The frame always supplies
   * `w-full min-w-0`; pass `noDockPadding` rather than fighting `pb-dock` here.
   */
  className?: string;
  /**
   * Drop the bottom inset that keeps content clear of the floating dock. Only
   * for pages that end in their own full-bleed element.
   */
  noDockPadding?: boolean;
}

/**
 * The page frame with no header — `AnimatedMain` at the right measure, the
 * dock inset, and the live-rail portal.
 *
 * This exists because 26 routes hand-rolled exactly this: they render a column
 * component that already draws its own `ColumnHeader` (Explore, Bookmarks,
 * Ranked, Drafts, Achievements, the thread and profile views …), so
 * `PageLayout` would have stacked a second title above the first, and the only
 * way out was to import `AnimatedMain` and `ContextRail` directly and repeat
 * the arithmetic. Which meant the frame — the measure, the `pb-dock` inset, the
 * rail reservation — was written out 26 more times and drifted: three widths,
 * two rail spellings, and 21 files still importing a `targetWidth` constant the
 * API had stopped taking.
 *
 * So: `PageLayout` when the page needs a title, `PageFrame` when its content
 * already has one. Nothing under `app/routes/_site/` should import
 * `AnimatedMain` directly — `lib/__tests__/design-consistency.test.ts` enforces
 * that, with an allowlist for the handful of genuinely bespoke shells.
 */
export function PageFrame({
  children,
  rightSidebar,
  wide,
  className,
  noDockPadding,
}: PageFrameProps) {
  const targetWidth = wide ? WIDE_WIDTH : DEFAULT_WIDTH;
  return (
    <>
      <AnimatedMain
        className={cn('w-full min-w-0', !noDockPadding && 'pb-dock', className)}
        targetWidth={targetWidth}
        wide={wide}
      >
        {children}
      </AnimatedMain>
      {/* No `reserve` — it and `compactReserve` are documented no-ops on
          ContextRail (the shell's grid keeps the column centred on its own),
          and the rail renders nothing without children anyway. Two dozen call
          sites were passing them. */}
      <ContextRail>{rightSidebar}</ContextRail>
    </>
  );
}

interface PageLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /**
   * Page-specific content for the shell's live rail. Portalled into the rail on
   * wide screens and dropped entirely on narrow ones — supplementary only.
   */
  rightSidebar?: React.ReactNode;
  headerRight?: React.ReactNode;
  wide?: boolean;
  backTo?: string;
  backLabel?: string;
  breadcrumbs?: BreadcrumbItem[];
  /**
   * Let the title run onto more than one line.
   *
   * A page name ("Wallet", "Bookmarks") is short and stays on one line, so the
   * default keeps `truncate`. But that class puts `white-space: nowrap` on an
   * *inline* span — `overflow: hidden` does not apply to one, so a title too
   * long for the column does not ellipsize, it overflows and drags the column's
   * width out with it (which then pushes the lede past the viewport too). Pages
   * whose title is a sentence rather than a name — an article headline — opt in
   * here and wrap instead.
   */
  wrapTitle?: boolean;
}

/**
 * Compact, mobile-first title block shared by standard routes.
 *
 * The kicker above the title uses the key `rmh-studios-presents`. It replaced
 * `rmh-digital-space` under a NEW key rather than by editing that key's
 * `defaultValue`, because `defaultValue` is only consulted when a key is
 * MISSING from the catalog — all 16 shipped locales already carried a
 * translation for the old key, so an in-place edit would have changed the
 * wording in English and nowhere else.
 *
 * Do not put a `{/* … *\/}` comment immediately before a `t()` call in this
 * file's JSX: `i18next-parser` silently skips the call that follows one, the key
 * never reaches `locales/`, and every non-English locale quietly falls back to
 * the English `defaultValue`. Explanations go here instead.
 */
export function PageLayout({
  title,
  description,
  children,
  rightSidebar,
  headerRight,
  wide,
  backTo,
  backLabel,
  breadcrumbs,
  wrapTitle,
}: PageLayoutProps) {
  const { t } = useTranslation('feed');
  const descriptionId = useId();
  // The shell's frame owns the rail track now, so a page's own width no longer
  // depends on whether it supplies rail content — `wide` alone decides whether
  // the column takes its reading measure or the whole content track.
  const targetWidth = wide ? WIDE_WIDTH : DEFAULT_WIDTH;

  return (
    <>
      <AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={targetWidth} wide={wide}>
        <header
          data-slot="page-header"
          className="page-heading"
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="page-heading__meta site-kicker">
            {backTo ? (
              <Link
                to={backTo}
                className="page-heading__back"
                aria-label={backLabel ?? t('back', { defaultValue: 'Back' })}
              >
                <ArrowLeft aria-hidden />
                <span>{backLabel ?? t('back', { defaultValue: 'Back' })}</span>
              </Link>
            ) : (
              <span>{t('rmh-studios-presents', { defaultValue: 'RMH Studios Presents' })}</span>
            )}
          </div>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs items={breadcrumbs} className="page-heading__breadcrumbs" />
          )}

          <div className="page-heading__content">
            <div className="min-w-0">
              {/* The shared display scale (audit SPA-006) — `.site-display-3`
                  carries size, weight, leading and tracking together, so no page
                  re-types a clamp and every title matches /design's section-head
                  scale. `truncate` keeps a long title on one line inside the
                  header's flex row. */}
              <h1 className="site-display-3">
                <span className={wrapTitle ? 'block min-w-0' : 'min-w-0 truncate'}>{title}</span>
              </h1>
              {description && (
                <p id={descriptionId} data-slot="page-description" className="site-lede">
                  {description}
                </p>
              )}
            </div>
            {headerRight && <div data-slot="page-header-action">{headerRight}</div>}
          </div>
        </header>

        <div data-slot="page-content" className="min-w-0">
          {children}
        </div>
      </AnimatedMain>

      <ContextRail>{rightSidebar}</ContextRail>
    </>
  );
}
