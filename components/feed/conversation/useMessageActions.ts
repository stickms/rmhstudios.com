import { useCallback, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useItemReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  editMessageApi,
  hideMessageApi,
  reactMessageApi,
  unsendMessageApi,
} from '@/lib/messages/message-actions.contract';
import {
  insertSorted,
  toggleReactionRow,
  type Message,
  type MessageMutation,
} from './conversation-state';

/**
 * What the viewer can do to a message already in the thread: edit it in place,
 * unsend it, hide it from their own copy, and react to it.
 */
export function useMessageActions({
  conversationId,
  session,
  messages,
  setMessages,
  historyIds,
  applyMutation,
}: {
  conversationId: string;
  session: { user: { id: string } } | null | undefined;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  historyIds: MutableRefObject<Set<string>>;
  applyMutation: (mutation: MessageMutation) => void;
}) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const [reactionMenu, setReactionMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
  } | null>(null);
  // H1 — the message currently being edited in place, and whether its save is
  // in flight.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const reactionTriggerFor = useItemReactionTrigger((x, y, messageId) =>
    setReactionMenu({ x, y, messageId }),
  );

  /* ---------------------------------------------------------------- */
  /*  H1 — edit / unsend / delete-for-me                              */
  /* ---------------------------------------------------------------- */

  const handleSaveEdit = useCallback(
    async (messageId: string, value: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target) return;
      const nextContent = value.trim();
      if (nextContent === target.content.trim()) {
        setEditingId(null);
        return;
      }

      setSavingEdit(true);
      const previous = target.content;
      // Optimistic: the window is 15 minutes wide, so the request almost never
      // fails for a reason the user could have predicted — showing the new text
      // immediately and rolling back is the honest trade.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: nextContent, editedAt: new Date().toISOString() }
            : m,
        ),
      );
      try {
        await api(editMessageApi, {
          params: { conversationId },
          body: { messageId, content: nextContent },
        });
        setEditingId(null);
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: previous, editedAt: target.editedAt ?? null } : m,
          ),
        );
        toast.error(
          serverError(err) ||
            t('message-edit-failed', { defaultValue: 'Could not edit that message.' }),
        );
      } finally {
        setSavingEdit(false);
      }
    },
    [conversationId, messages, setMessages, t],
  );

  const handleUnsend = useCallback(
    async (messageId: string) => {
      const ok = await confirm({
        title: t('message-unsend-title', { defaultValue: 'Unsend this message?' }),
        description: t('message-unsend-description', {
          defaultValue:
            'It will be removed for both of you. A note saying the message was deleted stays in the conversation.',
        }),
        confirmLabel: t('message-unsend-confirm', { defaultValue: 'Unsend' }),
        danger: true,
      });
      if (!ok) return;

      try {
        const data = await api(unsendMessageApi, {
          params: { conversationId },
          body: { messageId },
        });
        applyMutation({
          conversationId,
          messageId,
          content: '',
          editedAt: data.message.editedAt ?? null,
          deletedAt: data.message.deletedAt ?? new Date().toISOString(),
          deletedBy: data.message.deletedBy ?? 'sender',
        });
      } catch (err) {
        toast.error(
          serverError(err) ||
            t('message-unsend-failed', { defaultValue: 'Could not unsend that message.' }),
        );
      }
    },
    [applyMutation, confirm, conversationId, t],
  );

  const handleHide = useCallback(
    async (messageId: string) => {
      const removed = messages.find((m) => m.id === messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      try {
        await api(hideMessageApi, {
          params: { conversationId },
          body: { messageId, hidden: true },
        });
        toast.success(
          t('message-hidden', { defaultValue: 'Removed from your copy of this conversation' }),
          {
            action: {
              label: t('undo', { defaultValue: 'Undo' }),
              onClick: () => {
                void api(hideMessageApi, {
                  params: { conversationId },
                  body: { messageId, hidden: false },
                }).then(() => {
                  if (removed) {
                    historyIds.current.add(removed.id);
                    setMessages((prev) => insertSorted(prev, removed));
                  }
                });
              },
            },
          },
        );
      } catch {
        if (removed) {
          setMessages((prev) => insertSorted(prev, removed));
        }
        toast.error(t('message-hide-failed', { defaultValue: 'Could not remove that message.' }));
      }
    },
    [conversationId, messages, setMessages, historyIds, t],
  );

  // Toggle the viewer's reaction row on a message (optimistic on raw rows).
  const applyRowToggle = useCallback(
    (messageId: string, emoji: string) => {
      const myId = session?.user.id;
      if (!myId) return;
      setMessages((prev) => toggleReactionRow(prev, messageId, emoji, myId));
    },
    [session?.user.id, setMessages],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!session) return;
      applyRowToggle(messageId, emoji);
      try {
        await api(reactMessageApi, { params: { conversationId }, body: { messageId, emoji } });
      } catch {
        // Roll back the optimistic toggle (toggling again is its own inverse).
        applyRowToggle(messageId, emoji);
      }
    },
    [session, conversationId, applyRowToggle],
  );

  return {
    reactionMenu,
    setReactionMenu,
    reactionTriggerFor,
    editingId,
    setEditingId,
    savingEdit,
    handleSaveEdit,
    handleUnsend,
    handleHide,
    toggleReaction,
  };
}
