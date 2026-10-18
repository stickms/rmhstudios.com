/**
 * A read-only handle on the page's React Query client for code that lives
 * outside the React tree.
 *
 * `Providers` builds the QueryClient per mount (perf audit §4.3), so nothing
 * outside a component can find it. The globe eversion's AFTER readiness gate
 * (`lib/eversion/settle.ts`) needs to know whether the destination still has
 * queries loading before it freezes the page into a texture, and it must do so
 * without a static import of anything heavy: this module holds a variable and
 * a TYPE (erased at build time), so importing it from the shell adds nothing.
 *
 * Browser-only on purpose: the server builds a client per request, and a module
 * variable would leak one request's client into the next.
 */
import type { QueryClient } from '@tanstack/react-query';

let shared: QueryClient | null = null;

/** Called by `Providers` once mounted (and with `null` on unmount). */
export function setSharedQueryClient(client: QueryClient | null): void {
  if (typeof window === 'undefined') return;
  shared = client;
}

/** The mounted client, or `null` before `Providers` mounts. */
export function getSharedQueryClient(): QueryClient | null {
  return shared;
}
