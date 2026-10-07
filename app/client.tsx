/**
 * Client entry — TanStack Start's default, plus one thing: hydration failures
 * that say WHERE they happened.
 *
 * A hydration mismatch is a flash by construction (the server's markup paints,
 * React discards it and re-renders), and with no Suspense boundary between the
 * mismatch and the document React re-renders the whole document — which in
 * React 19 also resets `<html>`'s attributes and wipes everything the pre-paint
 * scripts set. In a production build React reports one through its default
 * `onRecoverableError` — `reportError`, i.e. a bare "Minified React error #418"
 * with no hint of which component diverged. `lib/client-errors.ts` beaconed that
 * string and nothing else, so a mismatch in production was unfindable from the
 * report.
 *
 * `errorInfo.componentStack` is available in production builds, so this passes
 * it on: to the client-error beacon (source `hydration` for a mismatch,
 * `recoverable` for anything else, so either can be told apart from an uncaught
 * exception), and to `console.error`, where the FOUC audit
 * (`testing/e2e/fouc.mjs`) hears it as a `hydration` finding with the stack
 * attached. See docs/fouc-audit-2026-10-06.md.
 */
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start/client';
import { reportClientError } from '@/lib/client-errors';

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    {
      onRecoverableError(error, errorInfo) {
        const message = error instanceof Error ? error.message : String(error);
        const componentStack = errorInfo.componentStack ?? undefined;
        // #418/#423/#425 are mismatches — the flash. Anything else that reaches
        // here (#419: a server render that threw inside a Suspense boundary, so
        // the client renders it from the fallback) is a bug worth a report but
        // shows the reader loading, not a restyle, so it gets its own label.
        const kind = /#4(?:18|23|25)\b|hydrat/i.test(message) ? 'hydration' : 'recoverable';
        reportClientError(error, { source: kind, componentStack });
        console.error(`[${kind}]`, message, componentStack ?? '');
      },
    },
  );
});
