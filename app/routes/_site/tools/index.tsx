import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { ToolboxHub } from '@/components/toolbox/ToolboxHub';

export const Route = createFileRoute('/_site/tools/')({
  head: definePage({
    path: '/tools',
    title: 'Toolbox | RMH Studios',
    description:
      'Free, private browser utilities: text, JSON, regex, hashes, IDs, colours, dates, money and more. Nothing you enter leaves your device.',
  }),
  component: ToolboxHub,
});
