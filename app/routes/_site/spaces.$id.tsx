import { createFileRoute, notFound } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { SpaceRoom } from '@/components/spaces/SpaceRoom';
import { getSpace } from '@/lib/spaces.server';
import { getRequestSession } from '@/lib/auth-session.server';
import type { SpaceView } from '@/lib/spaces/types';

// SSR the space so the room (and, for ended spaces, its transcript) is present
// at first paint. Live chat/audience then rides the socket connection.
const fetchSpace = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const session = await getRequestSession();
    return getSpace(data, session?.user?.id ?? null);
  });

export const Route = createFileRoute('/_site/spaces/$id')({
  head: ({ loaderData }) => ({
    meta: [
      { title: `${(loaderData as SpaceView | undefined)?.title ?? 'Live Space'} | RMH Studios` },
    ],
  }),
  loader: async ({ params }): Promise<SpaceView> => {
    const space = await fetchSpace({ data: params.id });
    if (!space) throw notFound();
    return space as SpaceView;
  },
  component: SpacePage,
});

function SpacePage() {
  const space = Route.useLoaderData() as SpaceView;
  return (
    <>
      <PageFrame>
        <SpaceRoom initialSpace={space} />
      </PageFrame>
    </>
  );
}
