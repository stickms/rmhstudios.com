import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import {
  leaveGroupChatApi,
  reactGroupMessageApi,
  voteGroupPollApi,
} from '@/lib/group-chat/group-chat.contract';
import {
  applyOptimisticVote,
  toggleReactionRow,
} from './group-chat-state';
import type { Msg } from '@/lib/group-chat/types';

/** Per-message actions: reactions, poll votes, and leaving the group. */
export function useGroupMessageActions({
  id,
  currentUserId,
  setMessages,
  patchMessage,
}: {
  id: string;
  currentUserId: string;
  setMessages: Dispatch<
    SetStateAction<
      Msg[]
    >
  >;
  patchMessage: (
    messageId: string,
    patch: Partial<Msg>,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const confirm =
    useConfirm();
  const navigate =
    useNavigate();

  // Toggle the viewer's reaction row on a message (optimistic on raw rows).
  const applyRowToggle =
    useCallback(
      (
        messageId: string,
        emoji: string,
      ) => {
        setMessages(
          (
            prev,
          ) =>
            toggleReactionRow(
              prev,
              messageId,
              emoji,
              currentUserId,
            ),
        );
      },
      // setMessages is a state setter and is stable.
      [
        currentUserId,
        setMessages,
      ],
    );

  const toggleReaction =
    useCallback(
      async (
        messageId: string,
        emoji: string,
      ) => {
        applyRowToggle(
          messageId,
          emoji,
        );
        try {
          await api(
            reactGroupMessageApi,
            {
              params:
                {
                  id,
                },
              body: {
                messageId,
                emoji,
              },
            },
          );
        } catch {
          // Roll back the optimistic toggle (toggling again is its own inverse).
          applyRowToggle(
            messageId,
            emoji,
          );
        }
      },
      [
        id,
        applyRowToggle,
      ],
    );

  async function vote(
    messageId: string,
    optionIdx: number,
  ) {
    // Optimistic: reflect the choice immediately.
    setMessages(
      (
        prev,
      ) =>
        applyOptimisticVote(
          prev,
          messageId,
          optionIdx,
        ),
    );
    try {
      const data =
        await api(
          voteGroupPollApi,
          {
            params:
              {
                id,
                messageId,
              },
            body: {
              optionIdx,
            },
          },
        );
      if (
        data.poll
      )
        patchMessage(
          messageId,
          {
            poll: data.poll as Msg['poll'],
          },
        );
    } catch {
      /* keep optimistic state */
    }
  }

  async function leave() {
    if (
      !(await confirm(
        {
          title:
            t(
              'leave-group-confirm',
              {
                defaultValue:
                  'Leave this group?',
              },
            ),
          danger: true,
        },
      ))
    )
      return;
    const left =
      await api(
        leaveGroupChatApi,
        {
          params:
            {
              id,
            },
        },
      ).then(
        () =>
          true,
        () =>
          false,
      );
    if (
      left
    )
      navigate(
        {
          to: '/messages',
          search:
            {
              tab: 'groups',
            },
        },
      );
  }

  return {
    toggleReaction,
    vote,
    leave,
  };
}
