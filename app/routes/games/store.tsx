import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getStore } from '@/lib/games/store.server';
import { StorePage } from '@/components/steam/StorePage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const fetchStore = createServerFn({ method: 'GET' })
  .validator((i: { tag?: string; q?: string }) => i)
  .handler(async ({ data }) => getStore(data));

export const Route = createFileRoute('/games/store')({
  validateSearch: (s: Record<string, unknown>): { tag?: string; q?: string } => ({
    ...(typeof s.tag === 'string' && s.tag.trim() ? { tag: s.tag.trim().slice(0, 40) } : {}),
    ...(typeof s.q === 'string' && s.q.trim() ? { q: s.q.trim().slice(0, 80) } : {}),
  }),
  loaderDeps: ({ search }) => ({ tag: search.tag, q: search.q }),
  head: () => ({
    meta: buildMeta({
      title: 'Store — games and apps | RMH Studios',
      description: 'Discover what people are playing on RMH Studios: featured, trending, top rated, and browse by tag.',
      path: '/games/store',
    }),
    links: [buildCanonical('/games/store')],
  }),
  loader: ({ deps }) => fetchStore({ data: deps }),
  component: StoreRoute,
});

function StoreRoute() {
  return <StorePage data={Route.useLoaderData()} />;
}
