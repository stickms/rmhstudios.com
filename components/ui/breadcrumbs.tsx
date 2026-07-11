'use client';

import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  /** Router path. Omit for the current (last) page. */
  to?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Compact "where am I" trail for nested pages (settings, admin, developer
 * docs, …). Each item except the last links to its ancestor; the last is the
 * current page and is marked `aria-current="page"`.
 *
 * ```tsx
 * <Breadcrumbs items={[{ label: 'Settings', to: '/settings' }, { label: 'Security' }]} />
 * ```
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const { t } = useTranslation('c-ui');
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t('breadcrumb', { defaultValue: 'Breadcrumb' })}
      className={cn('min-w-0', className)}
    >
      <ol className="flex items-center gap-1 text-xs text-site-text-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  className="h-3 w-3 shrink-0 text-site-text-dim rtl-flip"
                  aria-hidden
                />
              )}
              {isLast || !item.to ? (
                <span
                  className="truncate font-medium text-site-text"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="truncate rounded-site-sm transition-colors hover:text-site-text hover:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
