import { createFileRoute } from '@tanstack/react-router'
import RmhtechLanding from '@/components/rmhtech/RmhtechLanding'
import rmhtechCss from '@/components/rmhtech/rmhtech.css?url'
import { buildMeta, buildCanonical } from '@/lib/seo'
// Fraunces, self-hosted with `font-display: optional` (app/fonts/), its upright
// Latin file — the headlines — preloaded. JetBrains Mono is the site's own. See
// lib/fonts/self-hosted.ts.
import frauncesCss from '@/app/fonts/fraunces.css?url'
import frauncesLatin from '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2?url'
import { preloadFont } from '@/lib/fonts/self-hosted'

const PATH = '/adaptive-intelligence'
const TITLE = 'Adaptive Intelligence — the trustworthy substrate for AI-driven biology'
const DESC =
  'An AI co-scientist for biology is only as trustworthy as the substrate it runs on. Adaptive Intelligence builds the Co-Scientist and the reproducibility Ledger it runs on, together.'

export const Route = createFileRoute('/adaptive-intelligence')({
  head: () => ({
    meta: buildMeta({
      title: TITLE,
      description: DESC,
      path: PATH,
      image: '/brand/adaptive-intelligence-og.png',
    }),
    links: [
      buildCanonical(PATH),
      // Brand favicon — overrides the global RMH Studios favicon on this route.
      { rel: 'icon', type: 'image/svg+xml', href: '/brand/adaptive-intelligence-favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/brand/adaptive-intelligence-favicon-32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/brand/adaptive-intelligence-favicon-16.png' },
      { rel: 'apple-touch-icon', href: '/brand/adaptive-intelligence-apple-touch.png' },
      { rel: 'stylesheet', href: rmhtechCss },
      { rel: 'stylesheet', href: frauncesCss },
      preloadFont(frauncesLatin),
    ],
  }),
  component: RmhtechLanding,
})
