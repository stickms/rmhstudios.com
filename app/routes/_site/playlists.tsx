import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { PlaylistsColumn } from '@/components/feed/PlaylistsColumn';
import { auth } from '@/lib/auth';
import { listPlaylists } from '@/lib/playlists.server';

const fetchPlaylists = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { playlists: null };
  return { playlists: await listPlaylists(session.user.id) };
});

export const Route = createFileRoute('/_site/playlists')({
  head: () => ({ meta: [{ title: 'Playlists | RMH Studios' }] }),
  loader: () => fetchPlaylists(),
  component: PlaylistsPage,
});

function PlaylistsPage() {
  const { playlists } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-[calc(env(safe-area-inset-bottom,0px)+92px)] md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <PlaylistsColumn initialData={{ playlists }} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
