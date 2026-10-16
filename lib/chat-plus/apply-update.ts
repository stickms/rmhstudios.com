/**
 * Pure reducer for the `chat-update` event, shared by the DM and group views so
 * both patch their message lists the same way.
 */

import type { ChatUpdate, ChecklistItem } from '@/lib/chat-plus/types';

export interface PatchableMessage {
  id: string;
  senderId?: string;
  read?: boolean;
  meta?: unknown;
  replyCount?: number;
  poll?: {
    question: string;
    options: { text: string; votes: number }[];
    totalVotes: number;
    myVote: number | null;
  } | null;
}

export function applyChatUpdate<T extends PatchableMessage>(
  messages: T[],
  update: ChatUpdate,
  viewerId: string,
): T[] {
  switch (update.op) {
    case 'checklist':
      return messages.map((m) =>
        m.id === update.messageId
          ? {
              ...m,
              meta: {
                ...((m.meta as Record<string, unknown>) ?? {}),
                items: update.items as ChecklistItem[],
              },
            }
          : m,
      );
    case 'poll':
      return messages.map((m) =>
        m.id === update.messageId && m.poll
          ? {
              ...m,
              poll: { ...m.poll, options: update.options, totalVotes: update.totalVotes },
            }
          : m,
      );
    case 'thread':
      return messages.map((m) =>
        m.id === update.parentId ? { ...m, replyCount: update.replyCount } : m,
      );
    case 'read':
      // The other participant read the thread: everything we sent is now seen.
      return messages.map((m) =>
        m.senderId === viewerId && m.read === false ? { ...m, read: true } : m,
      );
    default:
      return messages;
  }
}
