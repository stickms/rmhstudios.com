'use client';

import { useRef, useState } from 'react';
import { Copy, EyeOff, MoreHorizontal, Pencil, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { canEdit, editWindowRemainingMs, MESSAGE_EDIT_WINDOW_MS } from '@/lib/messages/edit-policy';

/**
 * Per-message actions: edit, unsend, delete for me, copy.
 *
 * ## Why these three deletes are three different things
 *
 * - **Edit** rewrites the text for both sides, and only inside the window.
 * - **Unsend** retracts it for both sides, forever, sender only — and leaves a
 *   tombstone rather than a gap.
 * - **Delete for me** removes it from *this* copy of the conversation and
 *   changes nothing for the other person.
 *
 * They are one menu because they are all "make this message go away", and they
 * are separately labelled because confusing them is how someone believes they
 * retracted a message they only hid from themselves.
 *
 * The trigger is a real 44px button rather than a hover affordance: hover does
 * not exist on the device most of these are read on, and long-press is already
 * taken by the reaction menu.
 */
export function MessageActions({
  message,
  viewerId,
  onEdit,
  onUnsend,
  onHide,
  className,
}: {
  message: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
    deletedAt: string | null;
  };
  viewerId: string;
  onEdit: () => void;
  onUnsend: () => void;
  onHide: () => void;
  className?: string;
}) {
  const { t } = useTranslation('feed');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const isSender = message.senderId === viewerId;
  const deleted = !!message.deletedAt;
  const editable = !deleted && canEdit(message, viewerId);
  const copyable = !deleted && message.content.trim().length > 0;

  const remainingMinutes = Math.ceil(editWindowRemainingMs(message.createdAt) / 60_000);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('message-actions', { defaultValue: 'Message actions' })}
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
        label={t('message-actions', { defaultValue: 'Message actions' })}
        className="w-56"
      >
        {editable && (
          <MenuItem
            icon={Pencil}
            hint={t('message-edit-remaining', {
              minutes: remainingMinutes,
              defaultValue: '{{minutes}}m left',
            })}
            onSelect={() => {
              setOpen(false);
              onEdit();
            }}
          >
            {t('message-edit', { defaultValue: 'Edit' })}
          </MenuItem>
        )}

        {isSender && !deleted && !editable && (
          // Shown, disabled, with the reason. Silently omitting it makes the
          // feature look broken to the one person it exists for.
          <p className="px-3 py-2 text-xs text-site-text-dim">
            {t('message-edit-window-closed', {
              minutes: Math.round(MESSAGE_EDIT_WINDOW_MS / 60_000),
              defaultValue: 'Editing closes {{minutes}} minutes after sending',
            })}
          </p>
        )}

        {copyable && (
          <MenuItem
            icon={Copy}
            onSelect={() => {
              setOpen(false);
              void navigator.clipboard?.writeText(message.content);
            }}
          >
            {t('message-copy', { defaultValue: 'Copy text' })}
          </MenuItem>
        )}

        <MenuItem
          icon={EyeOff}
          onSelect={() => {
            setOpen(false);
            onHide();
          }}
        >
          {t('message-delete-for-me', { defaultValue: 'Delete for me' })}
        </MenuItem>

        {isSender && !deleted && (
          <MenuItem
            icon={Undo2}
            tone="danger"
            onSelect={() => {
              setOpen(false);
              onUnsend();
            }}
          >
            {t('message-unsend', { defaultValue: 'Unsend for everyone' })}
          </MenuItem>
        )}
      </AnchoredMenu>
    </>
  );
}
