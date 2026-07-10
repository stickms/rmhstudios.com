import { createFileRoute } from '@tanstack/react-router';
import { OptimizationPage } from '@/components/optimization/OptimizationPage';

export const Route = createFileRoute('/optimization')({
  head: () => ({
    meta: [
      { title: 'Speed & Optimization | RMH Studios' },
      {
        name: 'description',
        content:
          'How RMH Studios stays fast — from a server-seeded first paint, intent prefetching, and optimistic writes at runtime to a parallel, cache-warm build and deploy pipeline. With the measured before/after numbers.',
      },
      { property: 'og:title', content: 'Speed & Optimization | RMH Studios' },
      {
        property: 'og:description',
        content:
          'The runtime and build-time optimizations that make RMH Studios feel instant — with real, measured stats.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://rmhstudios.com/optimization' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://rmhstudios.com/optimization' }],
  }),
  component: OptimizationPage,
});
