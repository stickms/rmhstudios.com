import { createFileRoute } from '@tanstack/react-router';
import { BoardsList } from '@/components/lights-out/BoardsList';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/lights-out/boards')({
  head: definePage({
    path: '/lights-out/boards',
    title: 'Lights Out Boards | RMH Studios',
    description: 'Boards members made for Lights Out. Solve them in the fewest moves, or make one of your own.',
  }),
  component: BoardsList,
});
