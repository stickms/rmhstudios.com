/**
 * Conversation Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { MessagesRightSidebar } from '@/components/feed/MessagesRightSidebar';
import { ConversationView } from '@/components/feed/ConversationView';
import { getRequestSession } from '@/lib/auth-session.server';
import { getConversationOtherUser, type ConversationOtherUser } from '@/lib/conversation.server';

// Prefetch just the other participant (name/avatar) server-side so the header
// paints immediately — the old client path fetched the entire inbox to find it.
const fetchConversation = createServerFn({ method: 'GET' })
  .validator((conversationId: string) => conversationId)
  .handler(async ({ data: conversationId }): Promise<{ otherUser: ConversationOtherUser | null }> => {
    const session = await getRequestSession();
    if (!session) return { otherUser: null };
    return { otherUser: await getConversationOtherUser(conversationId, session.user.id) };
  });

export const Route = createFileRoute('/_site/messages/$conversationId')({
  // `noindex`: one private conversation. Titled all the same — without a
  // head() the browser tab showed the raw conversation id.
  head: () => ({
    meta: [{ title: 'Conversation | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: ({ params }) => fetchConversation({ data: params.conversationId }),
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { otherUser } = Route.useLoaderData() as { otherUser: ConversationOtherUser | null };

  return (
    <PageFrame rightSidebar={<MessagesRightSidebar />}>
        <ConversationView conversationId={conversationId} initialOtherUser={otherUser} />
    </PageFrame>
  );
}
