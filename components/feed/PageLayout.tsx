'use client';

import { useEffect, useId, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatedMain } from './AnimatedMain';
import { ContextRail } from './ContextRail';
import { MobileMenuButton } from './MobileMenuButton';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { DEFAULT_WIDTH, WIDE_NO_RIGHT_SIDEBAR_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';

interface PageLayoutProps {
  title: string;
  /** Short orientation copy shown with the title and hidden when chrome condenses. */
  description?: string;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  /** Element rendered right-aligned in the sticky header row (e.g. filter button) */
  headerRight?: React.ReactNode;
  /** Use a wider center column (800 px) – useful for grid-heavy pages like Builds. */
  wide?: boolean;
  /**
   * When set, a back arrow appears at the start of the header linking here.
   * Especially useful on nested pages (e.g. admin sub-pages) and on mobile,
   * where there's otherwise no obvious way back to the parent.
   */
  backTo?: string;
  /** Accessible label for the back arrow (defaults to "Back"). */
  backLabel?: string;
  /**
   * Optional "where am I" trail shown above the title on nested pages
   * (e.g. Settings → Security). The last item is the current page.
   */
  breadcrumbs?: BreadcrumbItem[];
}

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
}: PageLayoutProps) {
  const { t } = useTranslation('feed');
  const descriptionId = useId();
  const hasRightSidebar = Boolean(rightSidebar);
  const hasBreadcrumbs = Boolean(breadcrumbs?.length);
  const expandedHeaderHeight = description
    ? hasBreadcrumbs
      ? 'h-14 sm:h-20'
      : 'h-14 sm:h-18'
    : hasBreadcrumbs
      ? 'h-14 sm:h-18'
      : 'h-14';
  const targetWidth = wide
    ? hasRightSidebar
      ? WIDE_WIDTH
      : WIDE_NO_RIGHT_SIDEBAR_WIDTH
    : DEFAULT_WIDTH;

  // Scroll-reactive chrome (§5.3): a 1px sentinel above the content toggles
  // `data-scrolled` on the sticky header, which condenses (more opaque, shorter)
  // as content scrolls under it. Works for both scroll roots (window on desktop,
  // the mobile shell's inner scroller) since both fill the viewport.
  const headerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const header = headerRef.current;
    if (!sentinel || !header) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) header.removeAttribute('data-scrolled');
        else header.setAttribute('data-scrolled', '');
      },
      { threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Center Column – width animates between pages. Bottom padding preserves a
          safe-area-aware content runway for floating controls. */}
      <AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={targetWidth}>
        <div className="flex flex-col">
          {/* Scroll sentinel — sits at the very top so the header knows when the
              page has scrolled beneath it. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {/* Sticky Header — L3 glass-chrome floating capsule (§8.2). The shared
              sticky class owns its responsive edge inset, stacking level, and
              header→content breathing room. It still condenses on scroll (height
              + tint + blur + glint via [data-scrolled]). */}
          <header
            ref={headerRef}
            data-slot="page-header"
            aria-describedby={description ? descriptionId : undefined}
            className={`group glass-chrome site-sticky-chrome transition-[height] duration-150 data-[scrolled]:h-14 ${expandedHeaderHeight}`}
          >
            <div className="flex h-full min-w-0 items-center gap-2.5 px-3 py-1.5 sm:px-4 sm:py-2">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {/* Mobile: always show the sidebar button in the top-left */}
                <MobileMenuButton />
                {backTo && (
                  <Link
                    to={backTo}
                    aria-label={backLabel ?? t('back', { defaultValue: 'Back' })}
                    className="-ml-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text active:scale-95 sm:min-h-9 sm:min-w-9"
                  >
                    <ArrowLeft className="h-5 w-5" aria-hidden />
                  </Link>
                )}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  {breadcrumbs && breadcrumbs.length > 0 && (
                    <Breadcrumbs
                      items={breadcrumbs}
                      className="mb-0.5 hidden sm:block group-data-[scrolled]:hidden"
                    />
                  )}
                  <h1 className="flex min-w-0 items-center gap-2 truncate font-(family-name:--site-font-display) text-lg font-semibold text-site-text [letter-spacing:var(--site-letter-spacing)] sm:text-xl">
                    {title}
                  </h1>
                  {description && (
                    <p
                      id={descriptionId}
                      data-slot="page-description"
                      className="mt-0.5 hidden line-clamp-1 text-xs text-site-text-muted group-data-[scrolled]:hidden sm:block"
                    >
                      {description}
                    </p>
                  )}
                </div>
              </div>
              {headerRight && <div className="min-w-0 shrink-0">{headerRight}</div>}
            </div>
          </header>

          {/* Page Content */}
          <div data-slot="page-content" className="min-w-0">
            {children}
          </div>
        </div>
      </AnimatedMain>

      <ContextRail reserve={!hasRightSidebar} compactReserve={Boolean(wide)}>
        {rightSidebar}
      </ContextRail>
    </>
  );
}
