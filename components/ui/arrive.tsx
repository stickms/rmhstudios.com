import { createContext, Suspense, useContext, useState, type ReactNode } from 'react';

/**
 * Steel M9: content that arrives after the view has painted fades in, 160 ms, opacity only (plan section 11).
 *
 * "Arrives" means it replaces a loading state the reader could see: a skeleton, a spinner, a Suspense fallback, a
 * blank gap, or the end of a list that more rows are appended to. Content that is there on the first paint (server
 * rendered, cached, or handed over by the route loader) never fades; that would be a page entrance (M6), and route
 * changes swap with no transition (M8).
 *
 * The motion itself is one class, `.arrive` (app/globals/components-reveal.css): a CSS animation that runs once when
 * the element is inserted or first gets the class, so there is no timer, no frame loop and nothing pending at rest
 * (R5, B3). An animation rather than a transition so it never fights an element's own `transition` (hover fills).
 *
 * Pick the tool by the shape of the loading state:
 *
 * - `if (loading) return <Skeleton/>; return <List/>` or `{data && <Row/>}`: put `useArrival(ready)` on the root of
 *   what arrives.
 * - `<Suspense fallback={…}>`: use {@link ArrivalSuspense} instead.
 * - Rows added to a list that is already showing (more pages, live inserts): `useStableListMotion` and the `arrive`
 *   class on each new row.
 * - Streamed from a loader through `<Await>`: {@link useSuspenseArrival} below the `<Await>`.
 *
 * The lock against skipping it is `lib/__tests__/arrival-coverage.test.ts`.
 */
export const ARRIVE = 'arrive';

/**
 * The `arrive` class for the root of content that may be waited for. Returns it only once `ready` is true after a
 * render where it was false, i.e. the reader saw the loading state; content that is ready on its first render (server
 * rendered, cached) gets nothing. The decision is the same on the server and on the client, so hydration matches.
 * Once it has arrived the class stays, so it never replays on a re-render; a component that goes back to loading and
 * remounts its content gets the fade again.
 */
export function useArrival(ready: boolean): string | undefined {
  const [waited, setWaited] = useState(!ready);
  // The "adjust state while rendering" pattern: a later return to loading counts as waiting too.
  if (!ready && !waited) setWaited(true);
  return ready && waited ? ARRIVE : undefined;
}

/**
 * For a list that is already showing: which keys arrived after it first filled (a next page from infinite scroll, a
 * live insert). The first non-empty set of keys is the baseline and never fades (it is either first-paint content or
 * the batch that replaced the skeleton, which the list root's `useArrival` covers); every key not in it does. When the
 * list empties (a filter switch) the baseline resets, so the next batch is a baseline again rather than a wall of new
 * rows. Stable per key: a row that arrived keeps answering true, so a wrapper chosen from it never comes and goes and
 * remounts the row.
 */
export function useArrivingKeys(keys: readonly (string | number)[]): (key: string | number) => boolean {
  const [baseline, setBaseline] = useState<ReadonlySet<string | number> | null>(() =>
    keys.length > 0 ? new Set(keys) : null,
  );
  if (baseline === null && keys.length > 0) setBaseline(new Set(keys));
  if (baseline !== null && keys.length === 0) setBaseline(null);
  return (key) => baseline !== null && !baseline.has(key);
}

/** Shared between a boundary's fallback and its content: whether the fallback was rendered. */
interface FallbackRecord {
  shown: boolean;
}

const ArrivalContext = createContext<FallbackRecord | null>(null);

function FallbackMark({ record, children }: { record: FallbackRecord; children: ReactNode }) {
  // Set during render, not in an effect: on the server a streamed boundary renders its fallback first and its content
  // in a later retry, and only the content below the suspending element re-renders then (useSuspenseArrival).
  record.shown = true;
  return children;
}

function ArrivedContent({
  record,
  wrap,
  children,
}: {
  record: FallbackRecord;
  wrap: boolean;
  children: ReactNode;
}) {
  // Client only. On the server the content of a streamed boundary is written before the fallback is known, so a wrapper
  // decided there could not match hydration; the server case is `useSuspenseArrival`. On the client a boundary that
  // suspends on mount discards this render and mounts it fresh once the fallback has committed, so `shown` is current.
  if (!wrap || typeof window === 'undefined' || !record.shown) return children;
  return <div className="arrive-group">{children}</div>;
}

interface ArrivalSuspenseProps {
  /** What the reader sees while the content loads. Hold the content's shape so nothing shifts when it lands. */
  fallback?: ReactNode;
  children: ReactNode;
  /**
   * Fade the content through a `display: contents` wrapper (default). Pass `false` when the content applies
   * `useSuspenseArrival()` itself, so it does not fade twice. The wrapper has no box, so flex and grid layout are
   * unchanged, but it is an element: it is the child that `space-y-*`, `divide-y` or `> *` selectors see.
   */
  wrap?: boolean;
}

/**
 * `<Suspense>` whose content fades in (M9) when the reader saw the fallback. When the content is ready in the same
 * commit (a cached chunk, data already loaded) the fallback never commits and nothing animates.
 */
export function ArrivalSuspense({ fallback = null, children, wrap = true }: ArrivalSuspenseProps) {
  const [record] = useState<FallbackRecord>(() => ({ shown: false }));
  return (
    <ArrivalContext.Provider value={record}>
      <Suspense fallback={<FallbackMark record={record}>{fallback}</FallbackMark>}>
        <ArrivedContent record={record} wrap={wrap}>
          {children}
        </ArrivedContent>
      </Suspense>
    </ArrivalContext.Provider>
  );
}

/**
 * The `arrive` class for content rendered BELOW the element that suspends inside an {@link ArrivalSuspense} (the
 * render function of an `<Await>`, a component that calls `use()` or `useSuspenseQuery`). Unlike the wrapper this also
 * covers server streaming: the server renders that content after the fallback went out, so the class is in the
 * streamed HTML and the fade runs when the browser inserts it.
 *
 * Hydration renders it without the fallback, so the client answer can differ from the server's: put
 * `suppressHydrationWarning` on the element that takes the class, which keeps the server's class in place.
 */
export function useSuspenseArrival(): string | undefined {
  const record = useContext(ArrivalContext);
  return record?.shown ? ARRIVE : undefined;
}

let routeArrivalTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * The router's pending page (`RoutePending`) is giving way to the real one: fade the page in. Called from the pending
 * page's layout-effect cleanup, which runs in the same commit that inserts the page and before it paints. It stamps
 * `html[data-route-arrival]` for one window, during which the CSS runs the M9 fade on the content column of a `_site`
 * page (`'site'`) or on the whole document of a full-screen route (`'app'`), then removes it. Only after a pending page
 * the reader saw: a fast navigation never shows one, so it swaps with no transition (M8).
 */
export function markRouteArrival(kind: 'site' | 'app') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.routeArrival = kind;
  clearTimeout(routeArrivalTimer);
  // Longer than the 160 ms fade: removing the attribute mid-animation would cut it short.
  routeArrivalTimer = setTimeout(() => {
    delete root.dataset.routeArrival;
  }, 320);
}
