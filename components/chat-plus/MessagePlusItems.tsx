'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Forward, MessageSquareText, MoreHorizontal, Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { isPlainKind, type ChatRef } from '@/lib/chat-plus/types';
import { useChatPlusUi } from '@/lib/chat-plus/ui-store';
import type { ChatMeta } from '@/lib/chat-plus/settings.client';
import { chatMetaKey, useChatMeta } from './hooks';

export interface PlusMessage {
  id: string;
  content: string;
  kind?: string | null;
  forwardCount?: number | null;
  hasAudio?: boolean;
  /** Group top-level messages can open a side thread. */
  threadable?: boolean;
}

/**
 * Pin / Forward / Reply-in-thread rows, appended to a message's action menu.
 * The DM view slots this into the existing `MessageActions` menu; the group view
 * uses {@link GroupMessageMenu}. Dialogs are opened through the UI store, so the
 * menu can close the moment a row is chosen.
 */
export function MessagePlusItems({
  chat,
  message,
  onDone,
}: {
  chat: ChatRef;
  message: PlusMessage;
  onDone: () => void;
}) {
  const { t } = useTranslation('f-messaging');
  const qc = useQueryClient();
  const { data: meta } = useChatMeta(chat);
  const openForward = useChatPlusUi((s) => s.openForward);
  const openThread = useChatPlusUi((s) => s.openThread);

  const plain = isPlainKind(message.kind);
  const pinned = !!meta?.pins.some((p) => p.messageId === message.id);
  const canPin = message.kind !== 'system' && message.kind !== 'tip';
  const canForward = plain && !message.hasAudio;

  const togglePin = async () => {
    onDone();
    try {
      const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/pin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, pinned: !pinned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('pin-failed', { defaultValue: 'Could not update the pin' }));
        return;
      }
      void qc.invalidateQueries({ queryKey: chatMetaKey(chat) });
    } catch {
      toast.error(t('pin-failed', { defaultValue: 'Could not update the pin' }));
    }
  };

  return (
    <>
      {message.threadable && chat.kind === 'group' && (
        <MenuItem
          icon={MessageSquareText}
          onSelect={() => {
            onDone();
            openThread({ groupId: chat.id, parentId: message.id });
          }}
        >
          {t('thread-reply-action', { defaultValue: 'Reply in thread' })}
        </MenuItem>
      )}
      {canPin && (
        <MenuItem icon={pinned ? PinOff : Pin} onSelect={() => void togglePin()}>
          {pinned
            ? t('unpin-message', { defaultValue: 'Unpin message' })
            : t('pin-message', { defaultValue: 'Pin message' })}
        </MenuItem>
      )}
      {canForward && (
        <MenuItem
          icon={Forward}
          onSelect={() => {
            onDone();
            openForward({
              source: chat,
              messageId: message.id,
              preview: message.content.slice(0, 140),
              forwardCount: message.forwardCount ?? 0,
            });
          }}
        >
          {t('forward-message', { defaultValue: 'Forward' })}
        </MenuItem>
      )}
    </>
  );
}

/** The group chat's per-message menu (the group view has no MessageActions). */
export function GroupMessageMenu({
  chat,
  message,
  extra,
  className,
}: {
  chat: ChatRef;
  message: PlusMessage;
  /** Extra rows from the host (e.g. Copy). */
  extra?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('f-messaging');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('message-more', { defaultValue: 'More message actions' })}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-site-text-dim opacity-60 transition-opacity hover:bg-site-surface-hover hover:opacity-100 focus-visible:opacity-100',
          className,
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        side="top"
        align="end"
        label={t('message-more', { defaultValue: 'More message actions' })}
        className="w-56"
      >
        <MessagePlusItems chat={chat} message={message} onDone={() => setOpen(false)} />
        {extra}
      </AnchoredMenu>
    </>
  );
}

export type { ChatMeta };
