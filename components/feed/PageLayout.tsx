'use client';

import { useEffect, useId, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatedMain } from './AnimatedMain';
import { ContextRail } from './ContextRail';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
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
      ? 'h-22 sm:h-26'
      : 'h-22'
    : hasBreadcrumbs
      ? 'h-18 sm:h-22'
      : 'h-18';
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
      {/* Center Column – width animates between pages. Bottom padding clears the
          floating mobile dock (§8.3). */}
      <AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={targetWidth}>
        <div className="flex flex-col">
          {/* Scroll sentinel — sits at the very top so the header knows when the
              page has scrolled beneath it. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {/* Sticky Header — L3 glass-chrome floating capsule (§8.2): insets from
              the column edges (mx-2 mobile → mx-3 ≥md) so the aurora shows around
              it. Still condenses on scroll (height + tint + blur + glint via
              [data-scrolled]). The optics-ring glint is always-on and comes free
              from .glass-chrome — no per-header work. */}
          {/* §17.6 header→content rhythm: the header is `sticky top-2`, so at rest
              it renders ~top-offset px BELOW its flow box — which silently ate the
              page's first-content gutter (subtitle/tab sheet sat flush under it, the
              owner's /services report). Reserve that sticky shift with a matching
              bottom margin (mb-2 = top-2, md:mb-3 = md:top-3) so every page's own
              first-content padding (§15.4 mt-3/space-y-3) is honoured, from the
              SHARED layer — it can no longer be eaten per-page. */}
          <header
            ref={headerRef}
            data-slot="page-header"
            aria-describedby={description ? descriptionId : undefined}
            className={`group glass-chrome sticky top-2 z-10 mx-2 mb-2 rounded-site shadow-site-sm transition-[height] data-[scrolled]:h-16 md:top-3 md:mx-3 md:mb-3 ${expandedHeaderHeight}`}
          >
            <div className="flex h-full min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                {/* Mobile: always show the sidebar button in the top-left */}
                <MobileMenuButton />
                {backTo && (
                  <Link
                    to={backTo}
                    aria-label={backLabel ?? t('back', { defaultValue: 'Back' })}
                    className="shrink-0 -ml-1 rounded-full p-1.5 text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text active:scale-95"
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
                  <h1 className="flex min-w-0 items-center gap-2 truncate font-(family-name:--site-font-display) text-xl font-semibold text-site-text [letter-spacing:var(--site-letter-spacing)] sm:text-2xl">
                    {/* Mobile: "RMH |" brand prefix before the page title */}
                    <MobileBrandPrefix />
                    {title}
                  </h1>
                  {description && (
                    <p
                      id={descriptionId}
                      data-slot="page-description"
                      className="mt-0.5 line-clamp-1 text-xs text-site-text-muted group-data-[scrolled]:hidden sm:text-sm"
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
          {children}
        </div>
      </AnimatedMain>

      <ContextRail reserve={!hasRightSidebar} compactReserve={Boolean(wide)}>
        {rightSidebar}
      </ContextRail>
    </>
  );
}
