/**
 * Contracts for the per-conversation DM action routes (redesign audit C1).
 * Client-safe: types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { MessageView } from '@/lib/messages/message-view';
import type { ReactionRow } from '@/lib/social/reactions';
import type { ThreadPage } from '@/lib/messages/mutations.server';
import type { SentDirectMessage } from '@/lib/messages/messages.contract';
import type {
  editMessageBody,
  hideMessageBody,
  mutationsQuery,
  reactMessageBody,
  sendToConversationBody,
  threadQuery,
  typingBody,
  unsendMessageBody,
} from '@/lib/messages/message-actions-schema';

export const messageThreadApi =
  endpoint<{
    query: z.infer<
      typeof threadQuery
    >;
    res: ThreadPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/messages/$conversationId/thread',
    },
  );

export const messageMutationsApi =
  endpoint<{
    query: z.infer<
      typeof mutationsQuery
    >;
    res: {
      messages: MessageView[];
      hiddenIds: string[];
      now: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/messages/$conversationId/mutations',
    },
  );

/** The body is parsed by hand in the route (size-limited read), so the route passes no `body` schema. */
export const sendToConversationApi =
  endpoint<{
    body: z.infer<
      typeof sendToConversationBody
    >;
    res: {
      message: SentDirectMessage;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId',
    },
  );

export const markConversationReadApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId/read',
    },
  );

export const editMessageApi =
  endpoint<{
    body: z.infer<
      typeof editMessageBody
    >;
    res: {
      success: true;
      message: MessageView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId/edit',
    },
  );

export const unsendMessageApi =
  endpoint<{
    body: z.infer<
      typeof unsendMessageBody
    >;
    res: {
      success: true;
      message: MessageView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId/unsend',
    },
  );

export const hideMessageApi =
  endpoint<{
    body: z.infer<
      typeof hideMessageBody
    >;
    res: {
      success: true;
      hidden: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId/hide',
    },
  );

export const typingApi =
  endpoint<{
    body: z.infer<
      typeof typingBody
    >;
    res: {
      success: true;
      suppressed?: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId/typing',
    },
  );

export const reactMessageApi =
  endpoint<{
    body: z.infer<
      typeof reactMessageBody
    >;
    res: {
      success: true;
      reacted: boolean;
      reactions: ReactionRow[];
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/messages/$conversationId/react',
    },
  );
