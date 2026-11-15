import {
  useEffect,
  type MutableRefObject,
} from 'react';
import type { ReactionRow } from '@/lib/social/reactions';
import { emitChatUpdate } from '@/lib/chat-plus/client-bus';
import { api } from '@/lib/contract/client';
import { pollGroupMessagesApi } from '@/lib/group-chat/group-chat.contract';
import type { ChatUpdate } from '@/lib/chat-plus/types';
import type { Msg } from '@/lib/group-chat/types';

/**
 * Live updates for an open group: prefer SSE, fall back to `?after=` polling.
 * Idle until the chat has loaded (a stale cursor would poll an empty list).
 */
export function useGroupLiveUpdates({
  id,
  notFound,
  loading,
  lastAtRef,
  appendMessages,
  patchMessage,
}: {
  id: string;
  notFound: boolean;
  loading: boolean;
  lastAtRef: MutableRefObject<
    | string
    | null
  >;
  appendMessages: (
    incoming: Msg[],
  ) => void;
  patchMessage: (
    messageId: string,
    patch: Partial<Msg>,
  ) => void;
}) {
  useEffect(() => {
    if (
      notFound ||
      loading
    )
      return;

    let es: EventSource | null =
      null;
    let connected = false;
    let pollTimer: ReturnType<
      typeof setInterval
    > | null =
      null;
    let connectTimer: ReturnType<
      typeof setTimeout
    > | null =
      null;

    const poll =
      async () => {
        if (
          !lastAtRef.current
        )
          return;
        try {
          const data =
            await api(
              pollGroupMessagesApi,
              {
                params:
                  {
                    id,
                  },
                query:
                  {
                    after:
                      lastAtRef.current,
                  },
                retries: 0,
              },
            );
          appendMessages(
            data.messages ??
              [],
          );
        } catch {
          /* ignore transient poll errors */
        }
      };

    const startPolling =
      () => {
        if (
          !pollTimer
        )
          pollTimer =
            setInterval(
              poll,
              5000,
            );
      };
    const stopPolling =
      () => {
        if (
          pollTimer
        ) {
          clearInterval(
            pollTimer,
          );
          pollTimer =
            null;
        }
      };

    if (
      typeof EventSource !==
      'undefined'
    ) {
      es =
        new EventSource(
          `/api/group-chats/${encodeURIComponent(id)}/stream`,
          {
            withCredentials: true,
          },
        );
      es.addEventListener(
        'open',
        () => {
          connected = true;
          stopPolling();
        },
      );
      es.addEventListener(
        'message',
        (
          e,
        ) => {
          try {
            appendMessages(
              [
                JSON.parse(
                  (
                    e as MessageEvent
                  )
                    .data,
                ) as Msg,
              ],
            );
          } catch {
            /* ignore malformed event */
          }
        },
      );
      es.addEventListener(
        'reaction',
        (
          e,
        ) => {
          try {
            const payload =
              JSON.parse(
                (
                  e as MessageEvent
                )
                  .data,
              ) as {
                type: 'reaction';
                messageId: string;
                reactions: ReactionRow[];
              };
            patchMessage(
              payload.messageId,
              {
                reactions:
                  payload.reactions,
              },
            );
          } catch {
            /* ignore malformed event */
          }
        },
      );
      es.addEventListener(
        'chat-update',
        (
          e,
        ) => {
          try {
            emitChatUpdate(
              JSON.parse(
                (
                  e as MessageEvent
                )
                  .data,
              ) as ChatUpdate,
            );
          } catch {
            /* ignore malformed event */
          }
        },
      );
      es.onerror =
        () => {
          connected = false;
          startPolling();
          poll();
        };
      connectTimer =
        setTimeout(
          () => {
            if (
              !connected
            )
              startPolling();
          },
          3000,
        );
    } else {
      startPolling();
    }

    return () => {
      es?.close();
      stopPolling();
      if (
        connectTimer
      )
        clearTimeout(
          connectTimer,
        );
    };
  }, [
    id,
    notFound,
    loading,
    lastAtRef,
    appendMessages,
    patchMessage,
  ]);
}
