'use client';

import { useTranslation } from 'react-i18next';
import { Forward, MessageSquareText, Pin } from 'lucide-react';
import { forwardLabel } from '@/lib/chat-plus/flags';
import { useChatPlusUi } from '@/lib/chat-plus/ui-store';
import { cn } from '@/lib/utils';

/**
 * The small marks that sit above a bubble: "Forwarded" / "Forwarded many times"
 * (M10) and a pin (M6). Renders nothing for an ordinary message, so it costs
 * nothing in the common case.
 */
export function MessageBadges({
  forwardCount,
  pinned,
  className,
}: {
  forwardCount?: number | null;
  pinned?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('f-messaging');
  const label = forwardLabel(forwardCount);
  if (label === 'none' && !pinned) return null;
  return (
    <div
      className={cn(
        'mb-0.5 flex items-center gap-2 px-1 text-[11px] text-site-text-dim',
        className,
      )}
    >
      {label !== 'none' && (
        <span className="inline-flex items-center gap-1">
          <Forward className="size-3" aria-hidden />
          {label === 'many'
            ? t('forwarded-many', { defaultValue: 'Forwarded many times' })
            : t('forwarded', { defaultValue: 'Forwarded' })}
        </span>
      )}
      {pinned && (
        <span className="inline-flex items-center gap-1">
          <Pin className="size-3" aria-hidden />
          {t('pinned', { defaultValue: 'Pinned' })}
        </span>
      )}
    </div>
  );
}

/** "3 replies" under a group message that has a side thread (M7). */
export function ThreadChip({
  groupId,
  messageId,
  count,
  className,
}: {
  groupId: string;
  messageId: string;
  count: number;
  className?: string;
}) {
  const { t } = useTranslation('f-messaging');
  const openThread = useChatPlusUi((s) => s.openThread);
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={() => openThread({ groupId, parentId: messageId })}
      className={cn(
        'mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-site-accent hover:bg-site-accent-dim focus-visible:ring-2 focus-visible:ring-site-accent',
        className,
      )}
    >
      <MessageSquareText className="size-3.5" aria-hidden />
      {t('thread-replies', { count, defaultValue: '{{count}} replies' })}
    </button>
  );
}

/** "Seen" under the viewer's latest message once the other side has read it (M8). */
export function SeenIndicator({ className }: { className?: string }) {
  const { t } = useTranslation('f-messaging');
  return (
    <p className={cn('mt-0.5 px-1 text-right text-[10px] text-site-text-dim', className)}>
      {t('seen', { defaultValue: 'Seen' })}
    </p>
  );
}

/** The inbox label for the note-to-self conversation (M2). */
export function SavedMessagesLabel() {
  const { t } = useTranslation('f-messaging');
  return <>{t('saved-messages', { defaultValue: 'Saved Messages' })}</>;
}
