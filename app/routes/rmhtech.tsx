import { createFileRoute } from '@tanstack/react-router'
import RmhtechLanding from '@/components/rmhtech/RmhtechLanding'
import rmhtechCss from '@/components/rmhtech/rmhtech.css?url'

const TITLE = 'rmhtech — the trustworthy substrate for AI-driven biology'
const DESC =
  'An AI co-scientist for biology is only as trustworthy as the substrate it runs on. rmhtech builds the Co-Scientist and the reproducibility Ledger it runs on, together.'

export const Route = createFileRoute('/rmhtech')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESC },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESC },
    ],
    links: [
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
