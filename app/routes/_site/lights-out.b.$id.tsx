import { createFileRoute } from '@tanstack/react-router';
import { BoardPlay } from '@/components/lights-out/BoardPlay';
import { definePage } from '@/lib/route/define-page';

function Page() {
  const { id } = Route.useParams();
  return <BoardPlay id={id} />;
}

export const Route = createFileRoute('/_site/lights-out/b/$id')({
  head: definePage({
    path: ({ params }) => `/lights-out/b/${params.id}`,
    title: 'Lights Out Board | RMH Studios',
    description: 'Solve a member-made Lights Out board in the fewest moves.',
  }),
  component: Page,
});
