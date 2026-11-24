/**
 * TanStack Router's `<HeadContent />`, with one change: every
 * `<link rel="modulepreload">` it emits carries `fetchpriority="low"`.
 *
 * Why. A page's head holds ~80–100 modulepreload hints (the route's whole static
 * JS closure, ~300 KB brotli) and the browser gives each the same `High`
 * priority as the Inter preload and just below the render-blocking CSS. On a
 * slow link they all share the bandwidth, so the font — the one hint that
 * changes what first paint looks like — finished AFTER the JavaScript: 6–8 s on
 * 3G, ~31 s on 2G, by which point the text had long painted in the fallback and
 * then re-shaped. At `low` the hints still start in parallel with the HTML (the
 * point of preloading: no import waterfall — removing them outright was measured
 * and rejected, docs/archive/2026/performance-audit-2026-10-08.md Part 2), they just queue
 * behind the CSS and the font. Measured cold, n=3–5 medians: font done 1.9 s →
 * 0.3 s (4G), 6.4 s → 1.4 s (3G); FCP −2–20%; hydration unchanged or earlier.
 * docs/archive/2026/performance-audit-2026-10-21.md §"Critical CSS + preload priority".
 *
 * Built on the router's own public `useTags` + `Asset`, so the server render and
 * the hydration render produce the same tags (no mismatch), and a router
 * upgrade that changes the tag set flows through untouched. The only thing that
 * differs from `HeadContent` is {@link deprioritizeModulePreloads}.
 */
import { Asset, type RouterManagedTag, useRouter, useTags } from '@tanstack/react-router';
import { useIsStaticDocument } from '@/lib/static-document';

/** Adds `fetchPriority: 'low'` to modulepreload links; every other tag is returned as-is. */
export function deprioritizeModulePreloads(tags: readonly RouterManagedTag[]): RouterManagedTag[] {
  return tags.map((tag) =>
    tag.tag === 'link' && tag.attrs?.rel === 'modulepreload' && tag.attrs.fetchPriority === undefined
      ? {
          ...tag,
          attrs: {
            ...tag.attrs,
            fetchPriority: 'low',
          },
        }
      : tag,
  );
}

/**
 * Marks every stylesheet link with a React 19 `precedence`, which makes it a resource React loads
 * BEFORE it commits the render that needs it.
 *
 * Why. A route links its own sheet from `head()` (`import css from './x.css?url'`). A plain
 * `<link rel="stylesheet">` does not gate the commit, so on a client navigation the new page
 * rendered and painted unstyled for a frame (or many, on a slow link) before its sheet arrived and
 * the layout snapped into place: services to med schools, anywhere to games. With a precedence the
 * router's transition suspends until the sheet is in, so the old page stays on screen and the new
 * one's first paint is styled; `RoutePending` takes over after 400 ms as for a slow loader. Hard
 * loads are unchanged (the sheet is in the server HTML and render-blocking, and React hydrates it
 * as the same resource). Every sheet shares the one group, so their order is the order the router
 * emits them. React keeps a precedence sheet once it has inserted it, as Vite's chunk CSS already
 * is, so a route's sheet stays loaded after you leave it.
 */
export function gateStylesheets(tags: readonly RouterManagedTag[]): RouterManagedTag[] {
  return tags.map((tag) =>
    tag.tag === 'link' && tag.attrs?.rel === 'stylesheet' && tag.attrs.href && tag.attrs.precedence === undefined
      ? {
          ...tag,
          attrs: {
            ...tag.attrs,
            precedence: 'default',
          },
        }
      : tag,
  );
}

export function SiteHeadContent() {
  const staticDocument = useIsStaticDocument();
  const all = gateStylesheets(deprioritizeModulePreloads(useTags()));
  // A static document (lib/static-document.ts) boots no client app: no entry
  // module and nothing preloaded for one.
  const tags = staticDocument
    ? all.filter(
        (tag) =>
          !(tag.tag === 'link' && tag.attrs?.rel === 'modulepreload') && !(tag.tag === 'script' && tag.attrs?.src),
      )
    : all;
  const nonce = useRouter().options.ssr?.nonce;
  return (
    <>
      {tags.map((tag) => (
        <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
      ))}
    </>
  );
}
