import { createFileRoute } from '@tanstack/react-router';
import { LiquidGlassPage } from '@/components/design/LiquidGlassPage';

export const Route = createFileRoute('/design')({
  head: () => ({
    meta: [
      { title: 'Liquid Glass | RMH Studios' },
      {
        name: 'description',
        content:
          'The material system behind RMH Studios: physically-plausible liquid glass that refracts, reflects your light, and moves like something poured — rendered by shader on capable devices and gracefully everywhere else.',
      },
      { property: 'og:title', content: 'Liquid Glass | RMH Studios' },
      {
        property: 'og:description',
        content:
          'Not a skin. A material. How every surface on RMH Studios refracts, reflects, and flows.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://rmhstudios.com/design' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://rmhstudios.com/design' }],
  }),
  component: LiquidGlassPage,
});
