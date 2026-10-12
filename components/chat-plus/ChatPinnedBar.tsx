'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ChatRef } from '@/lib/chat-plus/types';
import type { PinView } from '@/lib/chat-plus/settings.client';
import { chatMetaKey, useChatMeta } from './hooks';

/**
 * M6 — the pinned-messages bar under the chat header. Shows the most recent pin
 * and a count; tapping opens the full list, where anyone can unpin. Renders
 * nothing when the chat has no pins.
 */
export function ChatPinnedBar({
  chat,
  viewerId,
  names,
}: {
  chat: ChatRef;
  viewerId: string;
  /** Known display names by user id (DM: the other person; groups: members). */
  names: Record<string, string | null | undefined>;
}) {
  const { t } = useTranslation('f-messaging');
  const nameOf = (userId: string, fallback: string | null) =>
    userId === viewerId
      ? t('you', { defaultValue: 'You' })
      : (names[userId] ?? fallback ?? t('someone', { defaultValue: 'Someone' }));
  const { data } = useChatMeta(chat);
  const [open, setOpen] = useState(false);
  const pins = data?.pins ?? [];
  if (pins.length === 0) return null;
  const latest = pins[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-chrome flex w-full shrink-0 items-center gap-2 px-4 py-2 text-left focus-visible:ring-2 focus-visible:ring-site-accent"
        aria-haspopup="dialog"
      >
        <Pin className="size-4 shrink-0 text-site-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-site-accent">
            {pins.length > 1
              ? t('pinned-bar-count', {
                  count: pins.length,
                  defaultValue: '{{count}} pinned messages',
                })
              : t('pinned-bar-one', { defaultValue: 'Pinned message' })}
          </span>
          <span className="block truncate text-sm text-site-text-muted">
            {latest.text || t('pinned-media', { defaultValue: 'Photo or media' })}
          </span>
        </span>
      </button>
      {open && <PinsSheet chat={chat} pins={pins} nameOf={nameOf} onClose={() => setOpen(false)} />}
    </>
  );
}

function PinsSheet({
  chat,
  pins,
  nameOf,
  onClose,
}: {
  chat: ChatRef;
  pins: PinView[];
  nameOf: (userId: string, fallback: string | null) => string;
  onClose: () => void;
}) {
  const { t } = useTranslation('f-messaging');
  const qc = useQueryClient();

  const unpin = async (messageId: string) => {
    try {
      const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/pin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, pinned: false }),
      });
      if (!res.ok) throw new Error('unpin failed');
      await qc.invalidateQueries({ queryKey: chatMetaKey(chat) });
    } catch {
      toast.error(t('pin-failed', { defaultValue: 'Could not update the pin' }));
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('pins-title', { defaultValue: 'Pinned messages' })}</SheetTitle>
          <SheetDescription>
            {t('pins-description', { defaultValue: 'Anyone in this chat can pin or unpin.' })}
          </SheetDescription>
        </SheetHeader>
        {pins.length === 0 ? (
          <p className="py-6 text-center text-sm text-site-text-dim">
            {t('pins-empty', { defaultValue: 'Nothing is pinned.' })}
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-site-border overflow-y-auto">
            {pins.map((p) => (
              <li key={p.messageId} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-site-text-dim">
                    {nameOf(p.senderId, p.senderName)} ·{' '}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 break-words text-sm text-site-text">
                    {p.hasMedia && (
                      <ImageIcon className="size-4 shrink-0 text-site-text-dim" aria-hidden />
                    )}
                    {p.text || t('pinned-media', { defaultValue: 'Photo or media' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void unpin(p.messageId)}
                  aria-label={t('unpin-message', { defaultValue: 'Unpin message' })}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-site-text-dim hover:bg-site-surface-hover hover:text-site-text focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <PinOff className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
