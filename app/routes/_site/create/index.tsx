/**
 * /create — Pages, the Create hub's index tab (RMHVibe generation + gallery).
 *
 * The shell around this (header, tab strip, `.cstudio-screen`) lives in
 * `route.tsx`; this file is just the panel. The gallery loader is scoped to this
 * route now rather than the hub, so opening Earnings or Personas no longer pays
 * for a Vibe gallery fetch it never renders.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { listVibePages } from '@/lib/rmhvibe/vibe.server';
import { PagesTab, type VibeGallery } from '@/components/creator-studio/PagesTab';
import type { CreationSort } from '@/lib/ranking/best';

const fetchGallery = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; cursor?: string; sort?: CreationSort }) => data)
  .handler(({ data }): Promise<VibeGallery> => Promise.resolve(listVibePages(data)));

export const Route = createFileRoute('/_site/create/')({
  head: () => ({
    meta: buildMeta({
      title: 'Create | RMH Studios',
      description:
        'Generate shareable pages, browse community builds, craft AI personas.',
      path: '/create',
    }),
    links: [buildCanonical('/create')],
  }),
  // The first page in the default sort (Best). The page draws it in this order and does not refetch it.
  loader: async () => ({ gallery: await fetchGallery({ data: {} }) }),
  component: CreatePagesTab,
});

function CreatePagesTab() {
  const { gallery } = Route.useLoaderData();

  return (
    <div className="cstudio-body cstudio-body--pages">
      <PagesTab initial={gallery} fetchGallery={fetchGallery} />
    </div>
  );
}
