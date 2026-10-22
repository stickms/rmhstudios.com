'use client';

import { lazy, Suspense } from 'react';
import { useChatPlusUi } from '@/lib/chat-plus/ui-store';

const ForwardSheet = lazy(() => import('./ForwardSheet'));
const ThreadSheet = lazy(() => import('./ThreadSheet'));

/**
 * Mounted once per chat view. Renders the forward picker or the thread panel
 * when a message menu asks for one — and nothing at all (not even the code, thanks
 * to `lazy`) until then.
 */
export function ChatPlusHost({ viewerId }: { viewerId: string }) {
  const forward = useChatPlusUi((s) => s.forward);
  const thread = useChatPlusUi((s) => s.thread);
  if (!forward && !thread) return null;
  return (
    <Suspense fallback={null}>
      {forward && <ForwardSheet target={forward} />}
      {thread && <ThreadSheet target={thread} viewerId={viewerId} />}
    </Suspense>
  );
}
