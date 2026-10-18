import { createFileRoute } from '@tanstack/react-router';
import { ConnectionsHome } from '@/components/party/ConnectionsPages';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/connections/')({
  head: definePage({
    path: '/connections',
    title: 'Connections Grids | RMH Studios',
    description:
      'Member-made 4x4 Connections grids. Solve them, rate them, and catch the daily pick.',
  }),
  component: ConnectionsHome,
});
