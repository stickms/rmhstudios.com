import { useContext } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShellLayoutContext } from '@/components/feed/shell-context';
import { DEFAULT_WIDTH } from '@/lib/layout-width';

/**
 * Default `pendingComponent` for the router (see `app/router.tsx`).
 *
 * Route loaders block navigation; without a pending fallback the old page just
 * freezes until the new loader resolves. This renders a neutral shimmer so a
 * slow route reads as "content is on its way" instead of a stuck click. It only
 * appears once a loader has been pending past the router's `defaultPendingMs`,
 * so fast navigations never flash it.
 *
 * The skeleton adapts to the destination so the real page swaps in *without a
 * layout shift*:
 *   - `_site` pages render a left-aligned center column (matching
 *     `PageLayout` / `FeedLayout`'s `DEFAULT_WIDTH`) plus the right-sidebar
 *     gutter. A generic centered column here would snap sideways — and appear
 *     wider — the moment the loader resolved.
 *   - Full-screen routes (games, apps, login, legal) keep the generic centered
 *     shimmer since they own their whole viewport.
 */
export function RoutePending() {
  // `SiteLayout` provides this context around its `<Outlet>`, so it's `true`
  // whenever we're rendering a pending shell page and `false` on full-screen
  // routes (which own their whole viewport).
  const inShell = useContext(ShellLayoutContext);

  return inShell ? <SitePagePending /> : <GenericPending />;
}

/** Shell-page skeleton: mirrors the canonical center-column + right-gutter
 *  geometry so `_site` routes don't reflow when their content arrives. */
function SitePagePending() {
  return (
    <>
      {/* Center column — same box as `AnimatedMain` at its default width (a plain
          div, not another <main>, since the `_site` layout already owns the
          #main-content landmark). */}
      <div
        role="status"
        aria-label="Loading"
        className="w-full min-w-0 border-r border-site-border pb-dock animate-in fade-in duration-200"
        style={{ maxWidth: DEFAULT_WIDTH }}
      >
        {/* Sticky-header-height placeholder so content below doesn't jump. */}
        <div className="h-18 border-b border-site-border flex items-center px-4">
          <Skeleton shimmer className="h-6 w-40" />
        </div>
        <div className="p-4 space-y-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton shimmer className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton shimmer className="h-3.5 w-40" />
                <Skeleton shimmer className="h-3.5 w-full" />
                <Skeleton shimmer className="h-3.5 w-11/12" />
                <Skeleton shimmer className="h-3.5 w-3/4" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
      {/* Right-sidebar gutter — matches `PageLayout`'s non-wide default so the
          column stays put once the sidebar streams in. */}
      <div className="hidden lg:block w-80 shrink-0" />
    </>
  );
}

/** Generic centered shimmer for full-screen routes that own their viewport. */
function GenericPending() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto w-full max-w-2xl px-4 py-8 animate-in fade-in duration-200"
    >
      <div className="flex gap-3">
        <Skeleton shimmer className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton shimmer className="h-4 w-40" />
          <Skeleton shimmer className="h-3.5 w-24" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <Skeleton shimmer className="h-3.5 w-full" />
        <Skeleton shimmer className="h-3.5 w-11/12" />
        <Skeleton shimmer className="h-3.5 w-4/5" />
        <Skeleton shimmer className="h-40 w-full rounded-site" />
        <Skeleton shimmer className="h-3.5 w-3/4" />
        <Skeleton shimmer className="h-3.5 w-2/3" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
