/**
 * Roadmap Route
 *
 * Header-less: the signature PinnedHero is this page's title, and it can only
 * pin with no `overflow-hidden` ancestor between it and the scroll root — so
 * the page takes `PageFrame` (the shared frame) rather than `PageLayout` (the
 * frame plus a title block that would sit above the hero).
 *
 * F22 rebuilt this page around the request board. The published roadmap stays
 * where it is — it is the promise — but a roadmap on its own is a broadcast,
 * and the questions it never answered ("did you get my idea?", "does anyone
 * else want this?", "was it already declined?") are exactly why the same
 * request kept arriving fifty times through support. The board is the reply
 * channel.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest as getHttpRequest } from '@tanstack/react-start/server';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { RoadmapSection } from '@/components/roadmap/RoadmapSection';
import { RequestBoard } from '@/components/requests/RequestBoard';
import { PageFrame } from '@/components/feed/PageLayout';
import { auth } from '@/lib/auth';
import { listRequests } from '@/lib/requests/board.server';
import type { RequestBoardPage } from '@/lib/requests/schema';

interface RoadmapPayload {
  board: RequestBoardPage;
  signedIn: boolean;
  isAdmin: boolean;
}

/**
 * The first page is rendered server-side so the board is indexable and present
 * on first paint; every subsequent filter/sort goes through `/api/requests`.
 */
const fetchBoard = createServerFn({ method: 'GET' }).handler(async (): Promise<RoadmapPayload> => {
  const request = getHttpRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const userId = session?.user?.id ?? null;
  const board = await listRequests({ sort: 'top', viewerId: userId });
  return {
    board,
    signedIn: !!userId,
    isAdmin: !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin,
  };
});

export const Route = createFileRoute('/_site/roadmap')({
  head: () => ({
    meta: buildMeta({
      title: 'Roadmap & requests | RMH Studios',
      description:
        'The road ahead — games, community, immersive tech, and film — plus the public request board: vote on what you want next and read the official replies.',
      path: '/roadmap',
    }),
    links: [buildCanonical('/roadmap')],
  }),
  loader: () => fetchBoard(),
  component: RoadmapPage,
});

function RoadmapPage() {
  const { board, signedIn, isAdmin } = Route.useLoaderData();
  return (
    <PageFrame className="relative isolate min-h-screen">
      <RoadmapSection />
      <div className="px-4 pb-12">
        <RequestBoard initial={board} signedIn={signedIn} isAdmin={isAdmin} />
      </div>
    </PageFrame>
  );
}
