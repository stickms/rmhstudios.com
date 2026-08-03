import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

/**
 * Temple of Joy shell.
 *
 * No font links. The game used to pull Cormorant Garamond from Google Fonts
 * here — two preconnects and a render-blocking stylesheet — for a face nothing
 * else on the site uses, because its display type was a serif of its own
 * choosing. It reads `--site-font-display` / `--site-font-body` now, like every
 * other page, and both resolve from `globals.css` before this route is reached.
 * So the round trip is gone and so is the swap: the title no longer changes
 * face in front of the player after first paint.
 */
export const Route = createFileRoute('/temple-of-joy')({
  head: () => gameRouteHead('temple-of-joy'),
  component: () => <Outlet />,
});
