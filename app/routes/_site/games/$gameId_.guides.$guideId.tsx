import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { GuideView, type GuideData } from '@/components/games/GuideView';
import { auth } from '@/lib/auth';
import { games } from '@/lib/games';
import { getGuide } from '@/lib/games/meta.server';

interface GuidePayload {
  gameId: string;
  guide: GuideData | null; // null = "new" draft editor
}

const fetchGuide = createServerFn({ method: 'GET' })
  .validator((input: { gameId: string; guideId: string }) => input)
  .handler(async ({ data }): Promise<GuidePayload> => {
    const game = games.find((g) => g.id === data.gameId);
    if (!game) throw notFound();
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (data.guideId === 'new') {
      if (!session) throw notFound();
      return { gameId: data.gameId, guide: null };
    }
    const guide = await getGuide(data.guideId, session?.user.id ?? null);
    if (!guide || guide.gameId !== data.gameId) throw notFound();
    return { gameId: data.gameId, guide };
  });

export const Route = createFileRoute('/_site/games/$gameId_/guides/$guideId')({
  head: () => ({ meta: [{ title: 'Guide | RMH Studios' }] }),
  loader: ({ params }) => fetchGuide({ data: { gameId: params.gameId, guideId: params.guideId } }),
  component: GuidePage,
});

function GuidePage() {
  const { gameId, guide } = Route.useLoaderData();
  return (
    <PageLayout title={guide?.title ?? 'New guide'} backTo={`/games/${gameId}`}>
      <GuideView gameId={gameId} guide={guide} />
    </PageLayout>
  );
}
