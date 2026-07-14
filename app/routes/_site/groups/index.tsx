import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { GroupChatsColumn } from '@/components/feed/GroupChatsColumn';
import { auth } from '@/lib/auth';
import { listGroupChats } from '@/lib/group-chats.server';

// Prefetch the group list server-side (present at first paint / prefetched on
// intent). `null` when signed out — the column shows a sign-in prompt.
const fetchGroups = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { groups: null };
  return { groups: await listGroupChats(session.user.id) };
});

export const Route = createFileRoute('/_site/groups/')({
  head: () => ({ meta: [{ title: 'Group Chats | RMH Studios' }] }),
  loader: () => fetchGroups(),
  component: GroupsPage,
});

function GroupsPage() {
  const { groups } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <GroupChatsColumn initialData={groups} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
