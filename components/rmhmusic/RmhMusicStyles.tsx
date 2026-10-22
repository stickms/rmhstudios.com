/**
 * Style carrier for `rmhmusic.css` — renders nothing; exists so the stylesheet travels
 * with the ROUTE that needs it instead of the global entry.
 *
 * A bare `import '….css'` at the top of a route file stays in the route's
 * non-split definition, which `routeTree.gen.ts` imports statically — so it
 * landed in the entry stylesheet and was render-blocking on EVERY page of the
 * site (perf audit 2026-10-08: the entry `index-*.css` was 107 KB raw, 99.8%
 * unused on `/`). Rendering this component from inside the route component
 * moves the import into that route's lazy chunk; TanStack Start still emits
 * the chunk's CSS in the server `<head>` on a hard load, and Vite loads it
 * before the chunk executes on a client navigation.
 */
import './rmhmusic.css';
export function RmhMusicStyles() {
  return null;
}
