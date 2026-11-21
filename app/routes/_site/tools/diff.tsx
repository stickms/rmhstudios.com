import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { DiffTool } from '@/components/toolbox/diff/DiffTool';

export const Route = createFileRoute('/_site/tools/diff')({
  head: definePage({
    path: '/tools/diff',
    title: 'Text Diff Checker | RMH Studios',
    description:
      'Compare two texts line by line, ignore whitespace or case, and copy the result as a unified diff.',
  }),
  component: DiffTool,
});
