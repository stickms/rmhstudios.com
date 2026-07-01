import { Link } from '@tanstack/react-router';
import { Compass, Home, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Styled, theme-aware, mobile-friendly 404 page used as the root (and site
 * layout) `notFoundComponent`. Buttons stack on small screens and sit in a row
 * from `sm` up; the primary action is always "Go home".
 */
export function NotFound() {
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 bg-site-bg px-6 py-16 text-center">
      <div className="space-y-3">
        <p
          aria-hidden="true"
          className="bg-gradient-to-br from-site-accent to-site-accent/40 bg-clip-text text-7xl font-black leading-none tracking-tight text-transparent sm:text-8xl"
        >
          404
        </p>
        <h1 className="text-2xl font-bold text-site-text sm:text-3xl">
          {t('notFound.title', { defaultValue: 'Page not found' })}
        </h1>
        <p className="mx-auto max-w-md text-sm text-site-text-muted sm:text-base">
          {t('notFound.body', {
            defaultValue:
              "The page you’re looking for doesn’t exist, moved, or never did. Let’s get you back on track.",
          })}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-xl sm:flex-row sm:justify-center">
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-site-accent px-5 py-3 text-sm font-semibold text-site-accent-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-accent/40"
        >
          <Home className="size-4" aria-hidden="true" />
          {t('notFound.home', { defaultValue: 'Go home' })}
        </Link>
        <Link
          to="/explore"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-site-border bg-site-surface px-5 py-3 text-sm font-semibold text-site-text transition hover:bg-site-border/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-accent/40"
        >
          <Compass className="size-4" aria-hidden="true" />
          {t('notFound.explore', { defaultValue: 'Explore' })}
        </Link>
        <Link
          to="/search"
          search={{ q: '', tab: 'top' }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-site-border bg-site-surface px-5 py-3 text-sm font-semibold text-site-text transition hover:bg-site-border/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-accent/40"
        >
          <Search className="size-4" aria-hidden="true" />
          {t('notFound.search', { defaultValue: 'Search' })}
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
