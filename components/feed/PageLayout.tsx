'use client';

import { useId } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { DEFAULT_WIDTH, WIDE_NO_RIGHT_SIDEBAR_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';
import { AnimatedMain } from './AnimatedMain';
import { ContextRail } from './ContextRail';

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
}

/**
 * Editorial masthead shared by standard routes. Route identity is part of the
 * page again instead of being trapped inside a sticky utility capsule.
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
}: PageLayoutProps) {
  const { t } = useTranslation('feed');
  const descriptionId = useId();
  const hasRightSidebar = Boolean(rightSidebar);
  const targetWidth = wide
    ? hasRightSidebar
      ? WIDE_WIDTH
      : WIDE_NO_RIGHT_SIDEBAR_WIDTH
    : DEFAULT_WIDTH;

  return (
    <>
      <AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={targetWidth}>
        <header
          data-slot="page-header"
          className="spatial-masthead"
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="spatial-masthead__meta">
            {backTo ? (
              <Link
                to={backTo}
                className="spatial-masthead__back"
                aria-label={backLabel ?? t('back', { defaultValue: 'Back' })}
              >
                <ArrowLeft aria-hidden />
                <span>{backLabel ?? t('back', { defaultValue: 'Back' })}</span>
              </Link>
            ) : (
              <span>{t('rmh-digital-space', { defaultValue: 'RMH / Digital space' })}</span>
            )}
            <span aria-hidden>©26</span>
          </div>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs items={breadcrumbs} className="spatial-masthead__breadcrumbs" />
          )}

          <div className="spatial-masthead__heading">
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

      <ContextRail reserve={!hasRightSidebar} compactReserve={Boolean(wide)}>
        {rightSidebar}
      </ContextRail>
    </>
  );
}
