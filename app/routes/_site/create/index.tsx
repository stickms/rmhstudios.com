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

const fetchGallery = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; cursor?: string }) => data)
  .handler(({ data }): Promise<VibeGallery> => Promise.resolve(listVibePages(data)));

export const Route = createFileRoute('/_site/create/')({
  head: () => ({
    meta: buildMeta({
      title: 'Create | RMH Studios',
      description:
        'Generate shareable pages, browse community builds, and craft AI personas — your whole creative toolkit in one place.',
      path: '/create',
    }),
    links: [buildCanonical('/create')],
  }),
  loader: async () => ({
    gallery: await fetchGallery({ data: {} }),
    // Fresh per load → each refresh re-advertises a different featured mix while
    // staying deterministic between server render and client hydration.
    seed: Math.floor(Math.random() * 1_000_000) + 1,
  }),
  component: CreatePagesTab,
});

function CreatePagesTab() {
  const { gallery, seed } = Route.useLoaderData();

  return (
    <div className="cstudio-body cstudio-body--pages">
      <PagesTab initial={gallery} seed={seed} fetchGallery={fetchGallery} />
    </div>
  );
}
