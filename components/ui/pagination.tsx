import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { JellyGroup } from '@/components/ui/jelly-group';

/** A square member: an icon or a page number, a 36px target (44px on touch, from the member's own floor). */
const ICON_MEMBER = 'min-w-9 px-2';

interface PaginationProps {
  /** Current (1-based) page. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Render the "Page X of Y" indicator below the controls (default true). */
  showIndicator?: boolean;
  className?: string;
}

/**
 * Shared pagination control. Extracted from the duplicated first/prev/
 * numbered-with-ellipsis/next/last blocks in BlogList and NewsList so both
 * lists (and future ones) share one implementation and look.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  showIndicator = true,
  className,
}: PaginationProps) {
  const { t } = useTranslation('c-ui');
  const safePage = Math.max(1, Math.min(page, totalPages));

  const pageNumbers = useMemo(() => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push('...');
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++)
        pages.push(i);
      if (safePage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safePage]);

  if (totalPages <= 1) return null;

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* One jelly body; first/prev/pages/next/last are flat members, the current page a glow lying on it. */}
      <JellyGroup size="sm" className="max-w-full justify-center">
        <JellyGroup.Item
          onClick={() => onPageChange(1)}
          disabled={safePage === 1}
          className={ICON_MEMBER}
          aria-label={t('first-page', { defaultValue: 'First page' })}
        >
          <ChevronsLeft aria-hidden />
        </JellyGroup.Item>
        <JellyGroup.Item
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
          className={ICON_MEMBER}
          aria-label={t('prev-page', { defaultValue: 'Previous page' })}
        >
          <ChevronLeft aria-hidden />
        </JellyGroup.Item>

        {pageNumbers.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-site-text-dim text-sm">
              ...
            </span>
          ) : (
            <JellyGroup.Item
              key={p}
              onClick={() => onPageChange(p)}
              selected={safePage === p}
              // The current page is `aria-current`, not a toggle.
              aria-pressed={undefined}
              aria-current={safePage === p ? 'page' : undefined}
              className={cn(
                ICON_MEMBER,
                'text-sm font-medium',
                safePage !== p && 'hidden sm:inline-flex',
              )}
            >
              {p}
            </JellyGroup.Item>
          ),
        )}

        <JellyGroup.Item
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage === totalPages}
          className={ICON_MEMBER}
          aria-label={t('next-page', { defaultValue: 'Next page' })}
        >
          <ChevronRight aria-hidden />
        </JellyGroup.Item>
        <JellyGroup.Item
          onClick={() => onPageChange(totalPages)}
          disabled={safePage === totalPages}
          className={ICON_MEMBER}
          aria-label={t('last-page', { defaultValue: 'Last page' })}
        >
          <ChevronsRight aria-hidden />
        </JellyGroup.Item>
      </JellyGroup>
      {showIndicator ? (
        <p className="text-sm text-site-text-muted">
          {t('page-of', {
            defaultValue: 'Page {{page}} of {{total}}',
            page: safePage,
            total: totalPages,
          })}
        </p>
      ) : null}
    </div>
  );
}
