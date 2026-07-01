import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import { reportClientError } from '@/lib/client-errors';

interface RouteErrorFallbackProps {
  error?: unknown;
  reset?: () => void;
  info?: { componentStack?: string };
}

/**
 * Friendly, theme-aware, mobile-friendly fallback used as a route
 * `errorComponent`. Reports the error once on mount, then offers the user a way
 * to recover (retry / go home) instead of leaving a blank or broken shell.
 */
export function RouteErrorFallback({ error, reset, info }: RouteErrorFallbackProps) {
  useEffect(() => {
    reportClientError(error, { source: 'route-error', componentStack: info?.componentStack });
  }, [error, info]);

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  return (
    <div
      role="alert"
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-site-bg px-6 py-16 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-site-danger/10 text-site-danger">
        <AlertTriangle className="size-8" aria-hidden="true" />
      </div>

      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-bold text-site-text sm:text-3xl">Something went wrong</h1>
        <p className="text-sm text-site-text-muted sm:text-base">
          An unexpected error stopped this page from loading. You can try again, or head back home.
        </p>
        {message ? (
          <p className="mt-3 break-words rounded-lg bg-site-surface px-3 py-2 text-left font-mono text-xs text-site-text-dim">
            {message.slice(0, 300)}
          </p>
        ) : null}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-md sm:flex-row sm:justify-center">
        {reset ? (
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-site-accent px-5 py-3 text-sm font-semibold text-site-accent-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-accent/40"
          >
            <RotateCw className="size-4" aria-hidden="true" />
            Try again
          </button>
        ) : null}
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-site-border bg-site-surface px-5 py-3 text-sm font-semibold text-site-text transition hover:bg-site-border/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-accent/40"
        >
          <Home className="size-4" aria-hidden="true" />
          Go home
        </Link>
      </div>
    </div>
  );
}

export default RouteErrorFallback;
