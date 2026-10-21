import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { GroupChatsColumn } from '@/components/feed/GroupChatsColumn';
import { getRequestSession } from '@/lib/auth-session.server';
import { listGroupChats } from '@/lib/group-chats.server';

// Prefetch the group list server-side (present at first paint / prefetched on
// intent). `null` when signed out — the column shows a sign-in prompt.
const fetchGroups = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) return { groups: null };
  return { groups: await listGroupChats(session.user.id) };
});

export const Route = createFileRoute('/_site/groups/')({
  head: () => ({
    meta: buildMeta({
      title: 'Group Chats | RMH Studios',
      description: 'Group chats on RMH Studios — start one with friends or join a public room.',
      path: '/groups',
    }),
    links: [buildCanonical('/groups')],
  }),
  loader: () => fetchGroups(),
  component: GroupsPage,
});

function GroupsPage() {
  const { groups } = Route.useLoaderData();
  return (
    <>
      <PageFrame>
        <GroupChatsColumn initialData={groups} />
      </PageFrame>
    </>
  );
}
