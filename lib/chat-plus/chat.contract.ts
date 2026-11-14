/**
 * Contracts for /api/chats/$kind/$id/** (redesign audit C1, batch 5).
 * Client-safe: schema and server types come in by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { checklistSchema } from '@/lib/chat-plus/checklist.server';
import type { commandSchema } from '@/lib/chat-plus/commands.server';
import type { pollVoteSchema } from '@/lib/chat-plus/polls.server';
import type {
  LinkItem,
  MediaItem,
  MediaPage,
} from '@/lib/chat-plus/media.server';
import type { PostedMessage } from '@/lib/chat-plus/post.server';
import type { ChatMeta } from '@/lib/chat-plus/settings.client';
import type {
  ChecklistItem,
  PollView,
} from '@/lib/chat-plus/types';

type ChatParams =
  {
    kind: string;
    id: string;
  };

/** The message the server created and broadcast. */
type Posted =
  {
    message: PostedMessage['message'];
    kind: PostedMessage['kind'];
  };

/** Timer, theme, the viewer's switches and the pins, in one request. */
export const getChatMetaApi =
  endpoint<{
    params: ChatParams;
    res: ChatMeta;
  }>()(
    {
      method:
        'GET',
      path: '/api/chats/$kind/$id/meta',
    },
  );

/** Pin or unpin a message. Any participant. */
export const setChatPinApi =
  endpoint<{
    params: ChatParams;
    body: {
      messageId: string;
      pinned: boolean;
    };
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/chats/$kind/$id/pin',
    },
  );

/** Post a checklist message (201). */
export const createChatChecklistApi =
  endpoint<{
    params: ChatParams;
    body: z.infer<
      typeof checklistSchema
    >;
    res: Posted;
  }>()(
    {
      method:
        'POST',
      path: '/api/chats/$kind/$id/checklist',
    },
  );

/** Tick or untick one item; answers with the new state. */
export const tickChatChecklistApi =
  endpoint<{
    params: ChatParams;
    body: {
      messageId: string;
      index: number;
    };
    res: {
      items: ChecklistItem[];
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/chats/$kind/$id/checklist',
    },
  );

/** Run a server-side slash command (201 with the created message). */
export const runChatCommandApi =
  endpoint<{
    params: ChatParams;
    body: z.infer<
      typeof commandSchema
    >;
    res: Posted;
  }>()(
    {
      method:
        'POST',
      path: '/api/chats/$kind/$id/command',
    },
  );

/** Vote on a poll in a DM. */
export const voteChatPollApi =
  endpoint<{
    params: ChatParams;
    body: z.infer<
      typeof pollVoteSchema
    >;
    res: {
      poll: PollView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/chats/$kind/$id/vote',
    },
  );

/** One keyset page of the images, GIFs and voice notes in a chat, newest first. */
export const getChatSharedMediaApi =
  endpoint<{
    params: ChatParams;
    query: {
      tab: 'media';
      cursor?:
        | string
        | undefined;
    };
    res: MediaPage<MediaItem>;
  }>()(
    {
      method:
        'GET',
      path: '/api/chats/$kind/$id/media',
    },
  );

/** One keyset page of the links in a chat, newest first. */
export const getChatSharedLinksApi =
  endpoint<{
    params: ChatParams;
    query: {
      tab: 'links';
      cursor?:
        | string
        | undefined;
    };
    res: MediaPage<LinkItem>;
  }>()(
    {
      method:
        'GET',
      path: '/api/chats/$kind/$id/media',
    },
  );
