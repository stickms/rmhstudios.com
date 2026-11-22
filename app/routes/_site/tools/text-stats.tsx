import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { TextStatsTool } from '@/components/toolbox/text-stats/TextStatsTool';

export const Route = createFileRoute('/_site/tools/text-stats')({
  head: definePage({
    path: '/tools/text-stats',
    title: 'Word and Character Counter | RMH Studios',
    description:
      'Count words, characters, sentences and paragraphs, estimate reading time, and see your most used words.',
  }),
  component: TextStatsTool,
});
