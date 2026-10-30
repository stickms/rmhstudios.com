'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The right-hand pane for library pages that bring their own content (a guide, a
 * title hub). Gives them the heading and, below `md` where the rail is a separate
 * screen, the way back to it. Pages that draw their own hero (the title detail)
 * use `LibraryPane` without a `title`.
 */
export function LibraryPane({
  title,
  backTo = '/games',
  children,
}: {
  title?: string;
  backTo?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('site');
  return (
    <section className="min-w-0 space-y-4">
      <Link
        to={backTo}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-site-text-muted hover:text-site-text md:hidden"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t('library-back', { defaultValue: 'Library' })}
      </Link>
      {title ? (
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-site-text">
          {title}
        </h1>
      ) : null}
      {children}
    </section>
  );
}
