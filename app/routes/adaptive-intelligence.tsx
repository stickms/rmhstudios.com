import { createFileRoute } from '@tanstack/react-router'
import RmhtechLanding from '@/components/rmhtech/RmhtechLanding'
import rmhtechCss from '@/components/rmhtech/rmhtech.css?url'
import { buildMeta, buildCanonical } from '@/lib/seo'

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
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RmhtechLanding,
})
