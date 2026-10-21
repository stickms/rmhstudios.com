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
 * and rejected, docs/performance-audit-2026-10-08.md Part 2), they just queue
 * behind the CSS and the font. Measured cold, n=3–5 medians: font done 1.9 s →
 * 0.3 s (4G), 6.4 s → 1.4 s (3G); FCP −2–20%; hydration unchanged or earlier.
 * docs/performance-audit-2026-10-21.md §"Critical CSS + preload priority".
 *
 * Built on the router's own public `useTags` + `Asset`, so the server render and
 * the hydration render produce the same tags (no mismatch), and a router
 * upgrade that changes the tag set flows through untouched. The only thing that
 * differs from `HeadContent` is {@link deprioritizeModulePreloads}.
 */
import { Asset, type RouterManagedTag, useRouter, useTags } from '@tanstack/react-router';

/** Adds `fetchPriority: 'low'` to modulepreload links; every other tag is returned as-is. */
export function deprioritizeModulePreloads(tags: readonly RouterManagedTag[]): RouterManagedTag[] {
  return tags.map((tag) =>
    tag.tag === 'link' && tag.attrs?.rel === 'modulepreload' && tag.attrs.fetchPriority === undefined
      ? { ...tag, attrs: { ...tag.attrs, fetchPriority: 'low' } }
      : tag,
  );
}

export function SiteHeadContent() {
  const tags = deprioritizeModulePreloads(useTags());
  const nonce = useRouter().options.ssr?.nonce;
  return (
    <>
      {tags.map((tag) => (
        <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
      ))}
    </>
  );
}
