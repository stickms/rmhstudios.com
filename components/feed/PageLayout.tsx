'use client';

import { useId } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { DEFAULT_WIDTH, WIDE_NO_RIGHT_SIDEBAR_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';
import { AnimatedMain } from './AnimatedMain';
import { ContextRail } from './ContextRail';
import { SiteAside } from './SiteAside';

interface PageLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  headerRight?: React.ReactNode;
  wide?: boolean;
  backTo?: string;
  backLabel?: string;
  breadcrumbs?: BreadcrumbItem[];
  /**
   * Desktop context rail. When a page passes no `rightSidebar`, a standard
   * (non-`wide`) page gets the shared live `SiteAside` on wide screens so the
   * reclaimed space becomes useful chrome instead of empty gutter. `wide` pages
   * default to no rail (they were sized to absorb it for full-width grids —
   * `WIDE_NO_RIGHT_SIDEBAR_WIDTH`). Force it either way with `aside`. Mobile is
   * unaffected — the rail is `display:none` there.
   */
  aside?: boolean;
}

/** Compact, mobile-first title block shared by standard routes. */
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
  aside,
}: PageLayoutProps) {
  const { t } = useTranslation('feed');
  const descriptionId = useId();
  // A page shows a rail if it supplied one, or if it takes the default one.
  // Default: on for standard reading pages, off for `wide` grid pages (which
  // were designed to absorb the rail's footprint) — `aside` overrides either way.
  const railContent = rightSidebar ?? ((aside ?? !wide) ? <SiteAside /> : null);
  const hasRightSidebar = Boolean(railContent);
  const targetWidth = wide
    ? hasRightSidebar
      ? WIDE_WIDTH
      : WIDE_NO_RIGHT_SIDEBAR_WIDTH
    : DEFAULT_WIDTH;

  return (
    <div className="radial-page">
      <AnimatedMain className="radial-page__main w-full min-w-0 pb-dock" targetWidth={targetWidth}>
        <header
          data-slot="page-header"
          className="page-heading"
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="page-heading__meta">
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
              <span>{t('rmh-digital-space', { defaultValue: 'RMH Studios' })}</span>
            )}
          </div>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs items={breadcrumbs} className="page-heading__breadcrumbs" />
          )}

          <div className="page-heading__content">
            <div className="min-w-0">
              <h1>
                <span className="min-w-0 truncate">{title}</span>
              </h1>
              {description && (
                <p id={descriptionId} data-slot="page-description">
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

      {railContent ? (
        <ContextRail className="radial-page__rail">{railContent}</ContextRail>
      ) : (
        <ContextRail reserve compactReserve={Boolean(wide)} />
      )}
    </div>
  );
}
