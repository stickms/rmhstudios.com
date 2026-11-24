import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A section that owns the shell's margin column (Steel L6) instead of the default search and lists. The margin is
 * still the shell's one grid track; only what is inside it changes, chosen by the route's path so the server HTML and
 * the first client render agree. The rail is its own lazy chunk, fetched only where the margin is displayed.
 *
 * Add a section here, not a branch in `MarginColumn`.
 */
export interface MarginTakeover {
  prefix: string;
  Rail: LazyExoticComponent<ComponentType>;
}

/**
 * No section takes the margin today. `/med` did until it became a full-screen app (roadmap item 11, owner
 * 2026-11-23): it has no Steel shell, so its live rail is mounted by `features/medschools/ui/shell/MedApp.tsx` instead.
 * The mechanism stays for the next section that wants one.
 */
export const MARGIN_TAKEOVERS: readonly MarginTakeover[] = [];

export function takeoverFor(pathname: string): MarginTakeover | null {
  return MARGIN_TAKEOVERS.find((t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`)) ?? null;
}
