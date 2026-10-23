import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import './lockdown.css';

const LEGAL_LINKS = [
  { href: '/terms', key: 'terms-of-use', defaultLabel: 'Terms of Use' },
  { href: '/privacy', key: 'privacy-policy', defaultLabel: 'Privacy Policy' },
  { href: '/cookies', key: 'cookie-policy', defaultLabel: 'Cookie Policy' },
  { href: '/copyright', key: 'copyright', defaultLabel: 'Copyright' },
  { href: '/security', key: 'security', defaultLabel: 'Security' },
];

/**
 * The one document frame for /terms, /privacy, /cookies, /copyright and
 * /security. These are top-level routes (no radial shell), so the frame owns
 * the whole viewport — but it paints with the site's own tokens, so every theme
 * (Daylight, Midnight, High contrast, …) reads correctly and the page sits on
 * the same aurora as the rest of the site.
 *
 * Every legal page shares: the back/breadcrumb row, the title block, the
 * reading column (`max-w-3xl`, ≈ 75 characters of body copy once the pane's
 * padding is taken off) and the footer. `children` is either prose that sits on
 * one `.glass-pane` (the default) or, with `bare`, a stack of sections that
 * bring their own panels (the security page) — in both cases inside the same
 * column, at the same measure.
 */
export function LegalLayout({
  title,
  updatedDate,
  bare = false,
  children,
}: {
  title: string;
  updatedDate?: string;
  /** Skip the document pane — children lay out their own panels in the column. */
  bare?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('c-lockdown');
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="legal-page flex min-h-dvh flex-col text-site-text">
      <a href="#legal-main" className="legal-skip">
        {t('skip-to-content', { defaultValue: 'Skip to content' })}
      </a>

      <nav
        aria-label={t('legal-navigation', { defaultValue: 'Legal navigation' })}
        className="mx-auto flex min-h-14 w-full max-w-3xl items-center gap-2 px-4 text-sm sm:px-6"
      >
        <a
          href="/"
          className="inline-flex min-h-11 items-center gap-1 text-site-text-muted transition-colors hover:text-site-text"
          aria-label={t('back-to-rmhstudios', { defaultValue: 'Back to RMHStudios' })}
        >
          <ChevronLeft className="size-4" strokeWidth={2.2} aria-hidden="true" />
          RMHStudios
        </a>
        <span className="text-site-text-dim" aria-hidden="true">
          /
        </span>
        <span className="min-w-0 truncate font-medium text-site-text">{title}</span>
      </nav>

      <main
        id="legal-main"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-(--site-section-gap) px-4 pt-4 pb-12 sm:px-6"
      >
        <header className="flex flex-col gap-2">
          <h1 className="site-display-3">{title}</h1>
          {updatedDate ? (
            <p className="text-sm text-site-text-muted">
              {t('last-updated', { defaultValue: 'Last updated: {{date}}', date: updatedDate })}
            </p>
          ) : null}
        </header>

        {bare ? (
          <div className="legal-content__body flex flex-col gap-8">{children}</div>
        ) : (
          <article className={cn('legal-content__body glass-pane px-5 py-6 sm:px-10 sm:py-10')}>
            {children}
          </article>
        )}
      </main>

      <footer className="border-t border-site-border px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <nav
          aria-label={t('legal-links', { defaultValue: 'Legal documents' })}
          className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2"
        >
          {LEGAL_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center px-3 text-xs font-medium transition-colors hover:text-site-text',
                pathname === l.href ? 'text-site-text' : 'text-site-text-muted',
              )}
            >
              {t(l.key, { defaultValue: l.defaultLabel })}
            </a>
          ))}
          <span className="inline-flex min-h-11 items-center px-3 text-xs text-site-text-dim">
            &copy; {new Date().getFullYear()} RMHStudios
          </span>
        </nav>
      </footer>
    </div>
  );
}
