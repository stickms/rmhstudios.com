import { createFileRoute } from '@tanstack/react-router';
import { ConnectionsNew } from '@/components/party/ConnectionsPages';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/connections/new')({
  head: definePage({
    path: '/connections/new',
    title: 'Make a Connections Grid | RMH Studios',
    description: 'Author a 4x4 Connections grid for other members to solve.',
  }),
  component: ConnectionsNew,
});
