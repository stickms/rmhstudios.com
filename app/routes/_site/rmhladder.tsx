import { createFileRoute, Outlet } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import RmhLadderShell from '@/components/rmhladder/RmhLadderShell';
import rmhladderCss from '@/components/rmhladder/rmhladder.css?url';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildMeta } from '@/lib/seo';

const getLadderViewer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return {
    isAuthenticated: Boolean(session?.user),
    isAdmin: Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin),
  };
});

export const Route = createFileRoute('/_site/rmhladder')({
  loader: () => getLadderViewer(),
  head: () => ({
    meta: buildMeta({
      title: 'RMH Ladder | Early-Career Jobs',
      description: 'Discover verified internships, new-grad programs, and early-career roles.',
      path: '/rmhladder',
    }),
    links: [{ rel: 'stylesheet', href: rmhladderCss }],
  }),
  component: LadderLayout,
});

function LadderLayout() {
  const viewer = Route.useLoaderData();
  return (
    <RmhLadderShell {...viewer}>
      <Outlet />
    </RmhLadderShell>
  );
}
