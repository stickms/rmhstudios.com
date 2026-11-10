import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { applyOptimisticVote, toggleReactionRow, type Msg } from './group-chat-state';

/** Per-message actions: reactions, poll votes, and leaving the group. */
export function useGroupMessageActions({
  id,
  currentUserId,
  setMessages,
  patchMessage,
}: {
  id: string;
  currentUserId: string;
  setMessages: Dispatch<SetStateAction<Msg[]>>;
  patchMessage: (messageId: string, patch: Partial<Msg>) => void;
}) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const navigate = useNavigate();

  // Toggle the viewer's reaction row on a message (optimistic on raw rows).
  const applyRowToggle = useCallback(
    (messageId: string, emoji: string) => {
      setMessages((prev) => toggleReactionRow(prev, messageId, emoji, currentUserId));
    },
    // setMessages is a state setter and is stable.
    [currentUserId, setMessages],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      applyRowToggle(messageId, emoji);
      try {
        const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/react`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, emoji }),
        });
        if (!res.ok) throw new Error('react failed');
      } catch {
        // Roll back the optimistic toggle (toggling again is its own inverse).
        applyRowToggle(messageId, emoji);
      }
    },
    [id, applyRowToggle],
  );

  async function vote(messageId: string, optionIdx: number) {
    // Optimistic: reflect the choice immediately.
    setMessages((prev) => applyOptimisticVote(prev, messageId, optionIdx));
    try {
      const res = await fetch(
        `/api/group-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/vote`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionIdx }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.poll) patchMessage(messageId, { poll: data.poll });
      }
    } catch {
      /* keep optimistic state */
    }
  }

  async function leave() {
    if (
      !(await confirm({
        title: t('leave-group-confirm', { defaultValue: 'Leave this group?' }),
        danger: true,
      }))
    )
      return;
    const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/leave`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) navigate({ to: '/messages', search: { tab: 'groups' } });
  }

  return { toggleReaction, vote, leave };
}
