import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { MessagesRightSidebar } from '@/components/feed/MessagesRightSidebar';
import { ConversationView } from '@/components/feed/ConversationView';
import { MobileNav } from '@/components/feed/MobileNav';
import { AnimatedMain } from '@/components/feed/AnimatedMain';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return (
    <div className="min-h-screen bg-site-bg flex justify-center overflow-hidden">
      {/* Left Sidebar */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center - Conversation */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <ConversationView conversationId={conversationId} />
      </AnimatedMain>

      {/* Right Sidebar */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <MessagesRightSidebar />
      </aside>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
