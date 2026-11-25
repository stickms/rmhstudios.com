import { createFileRoute } from '@tanstack/react-router';
import { ConnectionsMine } from '@/components/party/ConnectionsMine';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/connections/mine')({
  head: definePage({
    path: '/connections/mine',
    title: 'Your Connections Grids | RMH Studios',
    description: 'Your Connections drafts and published grids, with plays, solve rate and rating.',
  }),
  component: ConnectionsMine,
});
