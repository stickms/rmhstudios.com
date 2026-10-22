import { createFileRoute } from '@tanstack/react-router';
import { MuseumPage } from '@/components/delight/MuseumPage';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/museum')({
  head: () => ({
    meta: buildMeta({
      title: 'Site museum | RMH Studios',
      description:
        'A timeline of the eras of RMH Studios, with screenshots and what changed in each.',
      path: '/museum',
    }),
    links: [buildCanonical('/museum')],
  }),
  component: MuseumPage,
});
