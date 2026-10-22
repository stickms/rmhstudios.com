import { createFileRoute } from '@tanstack/react-router';
import { ConnectionsPlay } from '@/components/party/ConnectionsPages';
import { definePage } from '@/lib/route/define-page';

function Page() {
  const { id } = Route.useParams();
  return <ConnectionsPlay id={id} />;
}

export const Route = createFileRoute('/_site/connections/u/$id')({
  head: definePage({
    path: ({ params }) => `/connections/u/${params.id}`,
    title: 'Connections Grid | RMH Studios',
    description: 'Solve a member-made Connections grid.',
  }),
  component: Page,
});
