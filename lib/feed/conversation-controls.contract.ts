/**
 * Contracts for muting a post's conversation, pinning a reply, and the Muted conversations list. Client-safe: types come from
 * the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { MuteMode } from '@/lib/feed/conversation-controls';
import type {
  muteConversationBody,
  mutedConversationsQuery,
  pinReplyBody,
} from '@/lib/feed/conversation-controls-schema';

/** The caller's choice for one conversation. */
export interface MuteState {
  mode: MuteMode;
  /** ISO time a timed mute ends; null for none, for mentions only and for an open-ended mute. */
  muteUntil:
    | string
    | null;
  /** Muted until the member turns it back on. */
  indefinite: boolean;
}

export interface MutedConversation extends MuteState {
  /** The thread root, which is also the post to open. */
  rootId: string;
  /** Null when the post is gone or the member can no longer read it: the row stays so it can be unmuted. */
  post: {
    text: string;
    author: string;
    /** Where the post lives, for the row's link. */
    link: string;
  } | null;
}

export const getConversationMuteApi =
  endpoint<{
    res: MuteState;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmharks/$id/mute',
    },
  );

export const setConversationMuteApi =
  endpoint<{
    body: z.infer<
      typeof muteConversationBody
    >;
    res: MuteState;
  }>()(
    {
      method:
        'PUT',
      path: '/api/rmharks/$id/mute',
    },
  );

export const clearConversationMuteApi =
  endpoint<{
    res: MuteState;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmharks/$id/mute',
    },
  );

export const pinReplyApi =
  endpoint<{
    body: z.infer<
      typeof pinReplyBody
    >;
    res: {
      pinnedReplyId:
        | string
        | null;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/rmharks/$id/pin-reply',
    },
  );

export const unpinReplyApi =
  endpoint<{
    res: {
      pinnedReplyId:
        | string
        | null;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmharks/$id/pin-reply',
    },
  );

export const listMutedConversationsApi =
  endpoint<{
    query: z.infer<
      typeof mutedConversationsQuery
    >;
    res: {
      items: MutedConversation[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/settings/muted-conversations',
    },
  );
