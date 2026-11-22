import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { SteamPane } from '@/components/steam/SteamPane';
import { GuideHistory } from '@/components/games/GuideHistory';
import { requireSessionServerFn } from '@/lib/auth/server-fn-guards.server';
import { games } from '@/lib/catalog';
import { getGuideForHistory } from '@/lib/games/guide-history.server';

interface GuideHistoryPayload {
  gameId: string;
  guide: { id: string; title: string; body: string; canRestore: boolean };
}

// The `_` after `$guideId` keeps this page out from under the guide route, whose loader is the public reader's.
// A guide's earlier text is for its author (and admins): everyone else, signed out included, gets the 404 a missing
// guide gets. The guard is inside the handler because a server function is its own HTTP endpoint.
const fetchGuideHistory = createServerFn({ method: 'GET' })
  .validator((input: { gameId: string; guideId: string }) => input)
  .handler(async ({ data }): Promise<GuideHistoryPayload> => {
    const session = await requireSessionServerFn();
    if (!games.some((g) => g.id === data.gameId)) throw notFound();
    const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin);
    const guide = await getGuideForHistory({ userId: session.user.id, isAdmin }, data.gameId, data.guideId);
    if (!guide) throw notFound();
    return {
      gameId: guide.gameId,
      guide: { id: guide.id, title: guide.title, body: guide.body, canRestore: guide.canRestore },
    };
  });

export const Route = createFileRoute('/games/_library/$gameId_/guides/$guideId_/history')({
  // A private page: never indexed, and no text from the guide in the head.
  head: () => ({
    meta: [{ title: 'Guide history | RMH Studios' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  loader: ({ params }) => fetchGuideHistory({ data: { gameId: params.gameId, guideId: params.guideId } }),
  component: GuideHistoryPage,
});

function GuideHistoryPage() {
  const { t } = useTranslation('guide-history');
  const { gameId, guide } = Route.useLoaderData();
  return (
    <SteamPane
      title={t('page-title', {
        defaultValue: 'History of {{title}}',
        title: guide.title,
      })}
      backTo={`/games/${gameId}/guides/${guide.id}`}
    >
      <div className="px-4 pb-12">
        <GuideHistory guideId={guide.id} currentBody={guide.body} canRestore={guide.canRestore} />
      </div>
    </SteamPane>
  );
}
