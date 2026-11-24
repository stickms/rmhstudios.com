import { suppressNextScrollReset } from '@/hooks/useScrollRestoration';

/**
 * Call right before a navigation that only changes this page's settings (a tab, a program, a category, a filter, a
 * cycle). `resetScroll: false` stops the router's own reset, but the site's `useScrollRestoration` (mounted by the
 * root) reads any new href as a fresh navigation and scrolls to the top a frame later; this tells it the page is
 * staying put (owner 2026-11-24: a setting never moves the reader).
 */
export function holdScroll(): void {
  if (typeof window !== 'undefined') suppressNextScrollReset(window.location.pathname);
}
