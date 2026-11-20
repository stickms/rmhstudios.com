/**
 * The site-wide part of every document's head: the default title, description
 * and Open Graph card, and the icon / manifest / search links. `__root.tsx`
 * emits it for every page the router renders; the island document
 * (`lib/islands/document.server.ts`, redesign audit B1) emits the same tags
 * under its route's own `head()`, so a game delivered as an island carries the
 * same document defaults as one delivered by the router. A route's `head()`
 * overrides any of these by `name` / `property` (TanStack keeps the deepest).
 */
import {
  DEFAULT_OG_IMAGE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  absoluteUrl,
} from '@/lib/seo';

export const ROOT_META =
  [
    {
      charSet:
        'utf-8',
    },
    {
      name: 'viewport',
      content:
        'width=device-width, initial-scale=1, viewport-fit=cover',
    },
    {
      title:
        'RMH Studios — The community for making, playing, and sharing.',
    },
    {
      name: 'description',
      content:
        'A social-first home for original games, creative tools, music, learning, and the people making them.',
    },
    {
      property:
        'og:site_name',
      content:
        'RMH Studios',
    },
    {
      property:
        'og:title',
      content:
        'RMH Studios — The community for making, playing, and sharing.',
    },
    {
      property:
        'og:description',
      content:
        'A social-first home for original games, creative tools, music, learning, and the people making them.',
    },
    {
      property:
        'og:type',
      content:
        'website',
    },
    // The site-wide fallback card. Shared with `buildMeta`'s default so a
    // route that sets no image of its own unfurls the same way whichever
    // head ends up winning.
    {
      property:
        'og:image',
      content:
        absoluteUrl(
          DEFAULT_OG_IMAGE,
        ),
    },
    {
      property:
        'og:image:width',
      content:
        String(
          OG_IMAGE_WIDTH,
        ),
    },
    {
      property:
        'og:image:height',
      content:
        String(
          OG_IMAGE_HEIGHT,
        ),
    },
    {
      property:
        'og:image:alt',
      content:
        'The RMH Studios navigation globe, on the site’s glass canvas.',
    },
    {
      property:
        'og:locale',
      content:
        'en_US',
    },
    {
      name: 'twitter:card',
      content:
        'summary_large_image',
    },
    {
      name: 'twitter:image',
      content:
        absoluteUrl(
          DEFAULT_OG_IMAGE,
        ),
    },
  ];

export const ROOT_LINKS =
  [
    {
      rel: 'icon',
      type: 'image/svg+xml',
      href: '/favicon.svg',
    },
    // iOS and iPadOS Safari ignore SVG favicons and the manifest's icons: tabs, bookmarks, Favorites and Add to Home
    // Screen read only an apple-touch-icon (180px, opaque: iOS paints transparency black and rounds the corners
    // itself), and other raster-only clients take the 32px PNG. The SVG stays first, where tab-badge finds it.
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      href: '/favicon-32.png',
    },
    {
      rel: 'apple-touch-icon',
      sizes: '180x180',
      href: '/apple-touch-icon.png',
    },
    {
      rel: 'manifest',
      href: '/manifest.webmanifest',
    },
    // Registers the site as an address-bar search engine (type the domain,
    // press Tab, search). The document is static in public/opensearch.xml.
    {
      rel: 'search',
      type: 'application/opensearchdescription+xml',
      title:
        'RMH Studios',
      href: '/opensearch.xml',
    },
  ];
