import { createFileRoute } from '@tanstack/react-router';
import { CanvasPage } from '@/components/canvas/CanvasPage';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/canvas')({
  head: () => ({
    meta: buildMeta({
      title: 'Community canvas | RMH Studios',
      description:
        'A shared pixel canvas: everyone places one pixel at a time, with a timelapse when the event ends.',
      path: '/canvas',
    }),
    links: [buildCanonical('/canvas')],
  }),
  component: CanvasPage,
});
