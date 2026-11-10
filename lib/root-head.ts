/**
 * The site-wide part of every document's head: the default title, description
 * and Open Graph card, and the icon / manifest / search links. `__root.tsx`
 * emits it for every page the router renders; the island document
 * (`lib/islands/document.server.ts`, redesign audit B1) emits the same tags
 * under its route's own `head()`, so a game delivered as an island carries the
 * same document defaults as one delivered by the router. A route's `head()`
 * overrides any of these by `name` / `property` (TanStack keeps the deepest).
 */
import { DEFAULT_OG_IMAGE, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, absoluteUrl } from '@/lib/seo';

export const ROOT_META = [
  { charSet: 'utf-8' },
  { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  { title: 'RMH Studios — The community for making, playing, and sharing.' },
  {
    name: 'description',
    content:
      'A social-first home for original games, creative tools, music, learning, and the people making them.',
  },
  { property: 'og:site_name', content: 'RMH Studios' },
  {
    property: 'og:title',
    content: 'RMH Studios — The community for making, playing, and sharing.',
  },
  {
    property: 'og:description',
    content:
      'A social-first home for original games, creative tools, music, learning, and the people making them.',
  },
  { property: 'og:type', content: 'website' },
  // The site-wide fallback card. Shared with `buildMeta`'s default so a
  // route that sets no image of its own unfurls the same way whichever
  // head ends up winning.
  { property: 'og:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
  { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
  { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
  {
    property: 'og:image:alt',
    content: 'The RMH Studios navigation globe, on the site’s glass canvas.',
  },
  { property: 'og:locale', content: 'en_US' },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
];

export const ROOT_LINKS = [
  { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
  // Registers the site as an address-bar search engine (type the domain,
  // press Tab, search). The document is static in public/opensearch.xml.
  {
    rel: 'search',
    type: 'application/opensearchdescription+xml',
    title: 'RMH Studios',
    href: '/opensearch.xml',
  },
];

// The jelly haze tile (--jelly-tile in jelly-material.css) is painted into
// every glass slab's background stack. It is a CSS-referenced image, so
// Chrome fetches it at Low priority — behind the ~160 low-priority module
// preloads. On a throttled phone it landed at ~5 s, and because the
// signed-out compose card is the first slab with real area, its first paint
// became the page's LCP (0.96 s -> 5.3 s). 4 KB at high priority removes
// that tail. Same-origin image: no crossOrigin.
export const ROOT_HAZE_PRELOAD = {
  rel: 'preload',
  as: 'image',
  type: 'image/webp',
  href: '/jelly/haze-tile.webp',
  fetchPriority: 'high',
} as const;
