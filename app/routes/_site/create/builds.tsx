/**
 * /create/builds — User Builds, the community-published half of the catalog.
 *
 * Was `/create?tab=user-builds`. The official catalogs live at `/games` and
 * `/apps`; this is what people published themselves.
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { UserBuildsTab } from '@/components/creator-studio/BuildsTab';

export const Route = createFileRoute('/_site/create/builds')({
  head: () => ({
    meta: buildMeta({
      title: 'User Builds | RMH Studios',
      description: 'Games and apps published by the RMH Studios community.',
      path: '/create/builds',
    }),
    links: [buildCanonical('/create/builds')],
  }),
  loader: () => ({ seed: Math.floor(Math.random() * 1_000_000) + 1 }),
  component: CreateBuildsTab,
});

function CreateBuildsTab() {
  const { seed } = Route.useLoaderData();

  return (
    <div className="cstudio-body">
      <UserBuildsTab seed={seed} />
    </div>
  );
}
