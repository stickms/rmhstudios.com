/**
 * Conversation Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { MessagesRightSidebar } from '@/components/feed/MessagesRightSidebar';
import { ContextRail } from '@/components/feed/ContextRail';
import { ConversationView } from '@/components/feed/ConversationView';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { auth } from '@/lib/auth';
import { getConversationOtherUser, type ConversationOtherUser } from '@/lib/conversation.server';

// Prefetch just the other participant (name/avatar) server-side so the header
// paints immediately — the old client path fetched the entire inbox to find it.
const fetchConversation = createServerFn({ method: 'GET' })
  .validator((conversationId: string) => conversationId)
  .handler(async ({ data: conversationId }): Promise<{ otherUser: ConversationOtherUser | null }> => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session) return { otherUser: null };
    return { otherUser: await getConversationOtherUser(conversationId, session.user.id) };
  });

export const Route = createFileRoute('/_site/messages/$conversationId')({
  loader: ({ params }) => fetchConversation({ data: params.conversationId }),
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { otherUser } = Route.useLoaderData() as { otherUser: ConversationOtherUser | null };

  return (
    <>
      {/* Center - Conversation */}
      <AnimatedMain className="w-full min-w-0 pb-dock">
        <ConversationView conversationId={conversationId} initialOtherUser={otherUser} />
      </AnimatedMain>

      {/* Right Sidebar */}
      <ContextRail>
        <MessagesRightSidebar />
      </ContextRail>
    </>
  );
}
