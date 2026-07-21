import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { SpaceRoom } from '@/components/spaces/SpaceRoom';
import { getSpace } from '@/lib/spaces.server';
import type { SpaceView } from '@/lib/spaces/types';

// SSR the space so the room (and, for ended spaces, its transcript) is present
// at first paint. Live chat/audience then rides the socket connection.
const fetchSpace = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data }) => getSpace(data));

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
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <SpaceRoom initialSpace={space} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
