import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { GroupChatsColumn } from '@/components/feed/GroupChatsColumn';

export const Route = createFileRoute('/_site/groups/')({
  head: () => ({ meta: [{ title: 'Group Chats | RMH Studios' }] }),
  component: GroupsPage,
});

function GroupsPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <GroupChatsColumn />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
