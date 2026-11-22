/** The call "Your mentions" makes (s07-05). Client-safe: contracts only. */
import { api } from '@/lib/contract/client';
import { listMyGroupMentionsApi } from '@/lib/group-chat/mentions.contract';

export const listMyGroupMentions = (groupId: string, cursor?: string) =>
  api(listMyGroupMentionsApi, {
    params: {
      id: groupId,
    },
    ...(cursor
      ? {
          query: {
            cursor,
          },
        }
      : {}),
  });
