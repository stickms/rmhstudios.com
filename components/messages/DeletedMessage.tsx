'use client';

import { Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { DELETED_BY_MODERATOR } from '@/lib/messages/edit-policy';

/**
 * The tombstone left behind by an unsend.
 *
 * It says *something was here and is gone*, which is the whole reason unsend
 * tombstones instead of deleting the row: a message that vanishes without trace
 * lets one party deny having sent it, and the conversation backs them up. It
 * never shows what the message said — that text stays in the database for
 * moderation only (`lib/messages/message-view.ts`).
 *
 * Rendered inside a message bubble, so its colour is inherited and it carries no
 * glass of its own — bubbles are repeated list items and the blur budget for
 * those is zero.
 */
export function DeletedMessage({
  deletedBy,
  className,
}: {
  deletedBy?: string | null;
  className?: string;
}) {
  const { t } = useTranslation('feed');

  return (
    <p className={cn('flex items-center gap-1.5 text-sm italic opacity-70', className)}>
      <Ban className="size-3.5 shrink-0" aria-hidden="true" />
      {deletedBy === DELETED_BY_MODERATOR
        ? t('message-removed-by-moderator', {
            defaultValue: 'This message was removed by a moderator',
          })
        : t('message-was-deleted', { defaultValue: 'This message was deleted' })}
    </p>
  );
}
