'use client';

import { useId } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { DEFAULT_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';
import { AnimatedMain } from './AnimatedMain';
import { ContextRail } from './ContextRail';

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
              <span>{t('rmh-digital-space', { defaultValue: 'RMH Studios' })}</span>
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
                <span className="min-w-0 truncate">{title}</span>
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
