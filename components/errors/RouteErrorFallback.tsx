import { useCallback, useEffect, useRef } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import { reportClientError } from '@/lib/client-errors';
import { isStaleBuildError, reloadForStaleBuild } from '@/lib/stale-build';
import { isTransientError } from '@/lib/transient-error';

const AUTO_RETRY_KEY = 'rmh:route-error-retry-at';
const AUTO_RETRY_GUARD_MS = 30_000;
const AUTO_RETRY_DELAY_MS = 1500;

interface RouteErrorFallbackProps {
  error?: unknown;
  reset?: () => void;
  info?: { componentStack?: string };
}

/**
 * Friendly, theme-aware, mobile-friendly fallback used as a route
 * `errorComponent`. Reports the error once on mount, then offers the user a way
 * to recover (retry / go home) instead of leaving a blank or broken shell.
 * Monochrome by design so it stays consistent with the rest of the site (no
 * accent color) while still reading clearly as an error state.
 */
export function RouteErrorFallback({ error, reset, info }: RouteErrorFallbackProps) {
  const { t } = useTranslation('c-ui');
  const router = useRouter();
  const resetRef = useRef(reset);
  resetRef.current = reset;

  // The boundary's `reset` only re-renders; a loader error stays on the match
  // and is simply re-thrown. The route has to be reloaded too, or "Try again"
  // can never succeed.
  const retry = useCallback(() => {
    void router
      .invalidate()
      .catch(() => {})
      .finally(() => resetRef.current?.());
  }, [router]);

  useEffect(() => {
    // The payload carries the page URL, so route + message reach the admin
    // Insights -> Errors inbox.
    reportClientError(error, { source: 'route-error', componentStack: info?.componentStack });
    // A chunk deleted by a deploy (React.lazy, a split loader) lands here, where
    // "Try again" would only refetch the same dead URL. Reload onto the current
    // build instead; the guard lets a genuinely broken chunk fall through to this
    // page rather than looping.
    if (isStaleBuildError(error)) {
      reloadForStaleBuild();
      return;
    }
    // A dropped connection or gateway blip usually succeeds a moment later:
    // retry once on our own (bounded per tab) before asking the user to.
    if (!resetRef.current || !isTransientError(error)) return;
    try {
      const last = Number(sessionStorage.getItem(AUTO_RETRY_KEY) ?? 0);
      if (Date.now() - last < AUTO_RETRY_GUARD_MS) return;
      sessionStorage.setItem(AUTO_RETRY_KEY, String(Date.now()));
    } catch {
      return;
    }
    const timer = setTimeout(retry, AUTO_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once per error; retry/reset are stable via refs
  }, [error]);

  // Raw error text is a developer artefact — the profile route's boundary was
  // observed leaking a bundler module-resolution message to visitors. It is
  // still reported to the error endpoint on mount either way.
  const rawMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const message = import.meta.env.DEV ? rawMessage : '';

  return (
    <div
      role="alert"
      className="error-page flex min-h-dvh w-full flex-col items-center justify-center px-4 py-10 text-center"
    >
      <div className="glass-fill flex w-full max-w-lg min-w-0 flex-col items-center gap-6 p-5 sm:p-8">
        <div className="glass-fill flex h-16 w-16 items-center justify-center rounded-full text-site-text">
          <AlertTriangle className="size-8" aria-hidden="true" />
        </div>

        <div className="w-full min-w-0 max-w-md space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-site-text sm:text-3xl">
            {t('page-error-title', { defaultValue: 'Something went wrong' })}
          </h1>
          <p className="text-sm leading-relaxed text-site-text-muted sm:text-base">
            {t('page-error-description', {
              defaultValue: 'We could not load this page. Try again, or head back home.',
            })}
          </p>
          {message ? (
            <p className="glass-inset mt-3 max-w-full [overflow-wrap:anywhere] px-3 py-2 text-left font-mono text-xs text-site-text-muted">
              {message.slice(0, 300)}
            </p>
          ) : null}
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-md sm:flex-row sm:justify-center">
          {reset ? (
            <Button onClick={retry}>
              <RotateCw className="size-4" aria-hidden />
              {t('page-error-retry', { defaultValue: 'Try again' })}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/">
              <Home className="size-4" aria-hidden />
              {t('page-error-home', { defaultValue: 'Go home' })}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RouteErrorFallback;
