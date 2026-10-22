import { createFileRoute } from '@tanstack/react-router';
import { PhotoPage } from '@/components/delight/PhotoPage';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/photo-of-the-day')({
  head: () => ({
    meta: buildMeta({
      title: 'Photo of the day | RMH Studios',
      description:
        'Members nominate one image a day and vote. The winner is featured the next day.',
      path: '/photo-of-the-day',
    }),
    links: [buildCanonical('/photo-of-the-day')],
  }),
  component: PhotoPage,
});
