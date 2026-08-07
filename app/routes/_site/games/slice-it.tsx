import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { PageLayout } from '@/components/feed/PageLayout';
import { SliceItHub } from '@/components/slice-it/SliceItHub';
import { GAMES_INDEX_PATH } from '@/lib/seo-catalog';
import { breadcrumbSchema, jsonLdScript, videoGameSchema } from '@/lib/schema';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';
import { sliceItHub, type HubPayload } from '@/lib/slice-it/hub.server';

/**
 * V12 — Slice It!'s own indexable surface.
 *
 * A static segment, so it wins over `$gameId` and replaces the generic hub for
 * this one game. The generic hub is reviews and guides; this one is the
 * library, which is the thing that actually distinguishes Slice It! from the
 * other seventeen games and the only thing a crawler can usefully index.
 *
 * `/slice-it` itself is `authGate: true` — an anonymous visitor gets a sign-in
 * gate rather than a pitch — which is exactly why this page has to exist
 * separately rather than being a redirect into the game.
 */
const fetchHub = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HubPayload> => sliceItHub(),
);

const DESCRIPTION =
  'Upload any track and Slice It! charts it automatically — four nested difficulties, ' +
  'replays, leaderboards and eight-player races.';

export const Route = createFileRoute('/_site/games/slice-it')({
  // Static meta: the hub's title and description do not depend on the loader,
  // so `head` never touches `loaderData` and a crawler that gets a cold cache
  // still gets the full Open Graph block.
  head: () => ({
    meta: buildMeta({
      title: 'Slice It! — charts, records and uploaders | RMH Studios',
      description: DESCRIPTION,
      path: '/games/slice-it',
      image: ogCardPath('game', 'slice-it'),
      imageAlt: 'Slice It! on RMH Studios — the chart library and its records.',
      type: 'article',
    }),
    links: [buildCanonical('/games/slice-it')],
    scripts: [
      jsonLdScript([
        videoGameSchema({
          name: 'Slice It!',
          description: DESCRIPTION,
          path: '/games/slice-it',
          genres: ['Rhythm', 'Music', 'Multiplayer'],
        }),
        breadcrumbSchema([
          // `/games` is not a route — the browser lives on `/create`, and a
          // breadcrumb pointing at a dead URL drops itself and everything
          // after it out of the rich result.
          { name: 'Games', path: GAMES_INDEX_PATH },
          { name: 'Slice It!', path: '/games/slice-it' },
        ]),
      ]),
    ],
  }),
  loader: () => fetchHub(),
  component: SliceItHubPage,
});

function SliceItHubPage() {
  const data = Route.useLoaderData();
  return (
    <PageLayout title="Slice It!" backTo="/">
      <SliceItHub data={data} />
    </PageLayout>
  );
}
