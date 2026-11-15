/**
 * Contracts for /api/messages (redesign audit C1). Client-safe.
 *
 *  - GET  lists the viewer's conversations (cursor-paginated; `folder` or
 *    `filter=unread` narrow it server-side).
 *  - POST starts or continues a DM with `recipientId`; with content/media it
 *    also creates the message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ConversationListItem } from '@/lib/messages.server';
import type { SavedSummary } from '@/lib/chat-plus/saved.server';
import type { sendMessageSchema } from '@/lib/messages/messages-schema';

export interface ConversationListPage {
  conversations: ConversationListItem[];
  nextCursor:
    | string
    | null;
  hasMore: boolean;
}

/** The message as pushed on the `new-message` bus event and echoed to the sender. */
export interface SentDirectMessage {
  id: string;
  conversationId: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
  gifUrl:
    | string
    | null;
  imageUrls: string[];
  reactions: {
    emoji: string;
    userId: string;
  }[];
  expiresAt:
    | string
    | null;
}

/** One hit of GET /api/messages/search: a list item without `previewKind`, plus the content snippet. */
export interface ConversationSearchHit {
  id: string;
  otherUser: ConversationListItem['otherUser'];
  lastMessage: Omit<
    NonNullable<
      ConversationListItem['lastMessage']
    >,
    'previewKind'
  > | null;
  matchSnippet:
    | string
    | null;
  unreadCount: number;
  lastMessageAt: string;
}

export const searchConversationsApi =
  endpoint<{
    query: {
      q: string;
    };
    res: {
      conversations: ConversationSearchHit[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/messages/search',
    },
  );

export const markAllMessagesReadApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/read-all',
    },
  );

/** Saved Messages (a note-to-self conversation). `saved` is null until first opened. */
export const getSavedMessagesApi =
  endpoint<{
    res: {
      saved: SavedSummary | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/messages/saved',
    },
  );

export const openSavedMessagesApi =
  endpoint<{
    res: {
      conversationId: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/saved',
    },
  );

export const listConversationsApi =
  endpoint<{
    query: {
      cursor?: string;
      folder?: string;
      filter?: 'unread';
    };
    res: ConversationListPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/messages',
    },
  );

export const sendMessageApi =
  endpoint<{
    body: z.infer<
      typeof sendMessageSchema
    >;
    res: {
      conversationId: string;
      message?: SentDirectMessage;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages',
    },
  );
