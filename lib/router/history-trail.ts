/**
 * Where each entry of this tab's history points, as far as this page load has seen.
 *
 * `useBackTo` (hooks/useBackOrFallback.ts) needs to know what the PREVIOUS entry is
 * before stepping back to it: a back control labelled "TF2 Hub" that blindly calls
 * `history.back()` lands on whatever page came before — a HUD you opened from the
 * workshop, say — which is not the page the label names. The browser does not expose
 * other entries' URLs, so this records them as TanStack navigates: its history
 * stamps `__TSR_index` into every entry it makes, and each push, replace and pop
 * notifies subscribers with the new location. An index pushed over again (go back,
 * then follow a different link) simply overwrites the old record, which is exactly
 * what the browser did to that entry.
 *
 * Entries from before this page load (a reload, a cold load from another site) are
 * unknown; callers treat unknown as "not the page I name" and navigate forward.
 */
import type { AnyRouter } from '@tanstack/react-router';

const trail = new Map<number, string>();

type Located = { pathname: string; search: string; state: { __TSR_index?: number } };

function record(location: Located): void {
  trail.set(location.state.__TSR_index ?? 0, location.pathname + location.search);
}

/** Browser-only, once per page load (app/router.tsx latches it). */
export function installHistoryTrail(router: AnyRouter): void {
  record(router.history.location as Located);
  router.history.subscribe(({ location }: { location: Located }) => record(location));
}

/** The path + search of the entry before the current one, if this page load has seen it. */
export function previousEntryHref(): string | undefined {
  const index = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;
  return index > 0 ? trail.get(index - 1) : undefined;
}
