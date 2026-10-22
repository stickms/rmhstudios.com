import { create } from 'zustand';
import type { ChatRef } from '@/lib/chat-plus/types';

/**
 * Which P04 overlay is open. Message menus live inside the (very large) chat
 * views and cannot own dialogs of their own, so they set this and one
 * `ChatPlusHost` per view renders the overlay.
 */
export interface ForwardTarget {
  source: ChatRef;
  messageId: string;
  preview: string;
  forwardCount: number;
}
export interface ThreadTarget {
  groupId: string;
  parentId: string;
}

interface ChatPlusUi {
  forward: ForwardTarget | null;
  thread: ThreadTarget | null;
  openForward: (t: ForwardTarget) => void;
  openThread: (t: ThreadTarget) => void;
  close: () => void;
}

export const useChatPlusUi = create<ChatPlusUi>((set) => ({
  forward: null,
  thread: null,
  openForward: (forward) => set({ forward, thread: null }),
  openThread: (thread) => set({ thread, forward: null }),
  close: () => set({ forward: null, thread: null }),
}));
