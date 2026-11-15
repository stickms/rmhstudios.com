/**
 * Contracts for the group-chat message actions (redesign audit C1). Client-safe.
 * The routes keep `defineHandler` with their in-handler membership and rate-limit
 * checks; the contract types the client side. `$id` is the group id.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { ForwardInput } from '@/lib/chat-plus/forward.server';
import type { ChatRef } from '@/lib/chat-plus/types-schema';
import type {
  Group,
  Msg,
} from '@/lib/group-chat/types';

/** One group with its first 200 messages; marks it read. 404 for a non-member. */
export const getGroupChatApi =
  endpoint<{
    res: {
      group: Group;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/group-chats/$id',
    },
  );

/** New messages after a timestamp (the 5s fallback poll for when the live stream is down). 404 for a non-member. */
export const pollGroupMessagesApi =
  endpoint<{
    query: {
      after: string;
    };
    res: {
      messages: Msg[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/group-chats/$id/messages',
    },
  );

/** Send a message (text, a GIF, up to 4 images or an inline poll); answers 201. */
export const sendGroupMessageApi =
  endpoint<{
    body: {
      content?: string;
      gifUrl?: string;
      imageUrls?: string[];
      poll?: {
        question: string;
        options: string[];
      };
    };
    res: {
      message: Msg;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/group-chats/$id/messages',
    },
  );

export const reactGroupMessageApi =
  endpoint<{
    body: {
      messageId: string;
      emoji: string;
    };
    res: {
      success: true;
      reacted: boolean;
      reactions: unknown[];
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/group-chats/$id/react',
    },
  );

export const voteGroupPollApi =
  endpoint<{
    body: {
      optionIdx: number;
    };
    /** The serialized poll (`Msg['poll']` in the client state); typed there, loose here. */
    res: {
      poll: unknown;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/group-chats/$id/messages/$messageId/vote',
    },
  );

export const leaveGroupChatApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/group-chats/$id/leave',
    },
  );

export interface GroupRow {
  id: string;
  name: string;
  memberCount: number;
  lastMessage:
    | string
    | null;
  lastMessageAt: string;
  unread: boolean;
}

/** The caller's groups; `folder` or `filter=unread` narrow it. Signed out answers an empty list. */
export const listGroupChatsApi =
  endpoint<{
    query: {
      folder?:
        | string
        | undefined;
      filter?:
        | 'unread'
        | undefined;
    };
    res: {
      groups: GroupRow[];
      signedIn: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/group-chats',
    },
  );

/** Create a group from member ids or handles; the 201 carries its id. */
export const createGroupChatApi =
  endpoint<{
    body: {
      name: string;
      members: string[];
    };
    res: {
      success: true;
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/group-chats',
    },
  );

/** Forward a message into up to five chats. `failed` lists the chats that could not receive it. */
export const forwardChatMessageApi =
  endpoint<{
    body: ForwardInput;
    res: {
      sent: ChatRef[];
      failed: {
        target: ChatRef;
        error: string;
      }[];
      forwardCount: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/chats/forward',
    },
  );
