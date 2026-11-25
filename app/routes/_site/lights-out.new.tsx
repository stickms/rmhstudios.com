import { createFileRoute } from '@tanstack/react-router';
import { BoardMaker } from '@/components/lights-out/BoardMaker';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/lights-out/new')({
  head: definePage({
    path: '/lights-out/new',
    title: 'Make a Lights Out Board | RMH Studios',
    description: 'Design a Lights Out board, check that it can be solved, and send it to friends.',
  }),
  component: BoardMaker,
});
