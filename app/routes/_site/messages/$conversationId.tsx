/**
 * Conversation Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { MessagesRightSidebar } from '@/components/feed/MessagesRightSidebar';
import { ConversationView } from '@/components/feed/ConversationView';
import { AnimatedMain } from '@/components/feed/AnimatedMain';

export const Route = createFileRoute('/_site/messages/$conversationId')({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();

  return (
    <>
      {/* Center - Conversation */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <ConversationView conversationId={conversationId} />
      </AnimatedMain>

      {/* Right Sidebar */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <MessagesRightSidebar />
      </aside>
    </>
  );
}
