import { createFileRoute } from '@tanstack/react-router';
import { LiquidGlassPage } from '@/components/design/LiquidGlassPage';

export const Route = createFileRoute('/design')({
  head: () => ({
    meta: [
      { title: 'Spatial Minimalism | RMH Studios' },
      {
        name: 'description',
        content:
          'The spatial-minimal design system behind RMH Studios: simple color, editorial hierarchy, purposeful motion, and a quieter interface.',
      },
      { property: 'og:title', content: 'Spatial Minimalism | RMH Studios' },
      {
        property: 'og:description',
        content: 'Paper, ink, proportion, and motion—the new visual foundation for RMH Studios.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://rmhstudios.com/design' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://rmhstudios.com/design' }],
  }),
  component: LiquidGlassPage,
});
