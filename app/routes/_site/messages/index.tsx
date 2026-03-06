/**
 * Messages Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { MessagesRightSidebar } from '@/components/feed/MessagesRightSidebar';
import { MessagesColumn } from '@/components/feed/MessagesColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';

export const Route = createFileRoute('/_site/messages/')({
  component: MessagesPage,
});

function MessagesPage() {
  return (
    <>
      {/* Center - Messages */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <MessagesColumn />
      </AnimatedMain>

      {/* Right Sidebar */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <MessagesRightSidebar />
      </aside>
    </>
  );
}
