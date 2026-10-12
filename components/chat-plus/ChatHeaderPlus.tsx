'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, SlidersHorizontal } from 'lucide-react';
import type { ChatRef } from '@/lib/chat-plus/types';
import { useChatMeta } from './hooks';

const ChatOptionsSheet = lazy(() => import('./ChatOptionsSheet'));

/**
 * The header control for everything per-chat: disappearing timer, theme,
 * receipts/typing, folders and the Media & links panel. The sheet itself is
 * lazy — it is not downloaded until someone opens it. A small clock shows while
 * a disappearing timer is on, so nobody forgets messages here expire.
 */
export function ChatHeaderPlus({ chat, className }: { chat: ChatRef; className?: string }) {
  const { t } = useTranslation('f-messaging');
  const { data } = useChatMeta(chat);
  const [open, setOpen] = useState(false);
  const timer = data?.disappearAfterSec ?? null;
  const timerLabel =
    timer === 3600
      ? t('duration-1h', { defaultValue: '1 hour' })
      : timer === 86_400
        ? t('duration-1d', { defaultValue: '1 day' })
        : t('duration-7d', { defaultValue: '7 days' });

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {timer && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-site-accent-dim px-2 py-1 text-[11px] font-medium text-site-accent"
          title={t('timer-chip-title', {
            duration: timerLabel,
            defaultValue: 'Messages disappear after {{duration}}',
          })}
        >
          <Clock className="size-3" aria-hidden />
          {timerLabel}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('chat-options', { defaultValue: 'Chat options' })}
        title={t('chat-options', { defaultValue: 'Chat options' })}
        className="flex size-11 items-center justify-center rounded-full text-site-text-dim hover:bg-site-surface-hover hover:text-site-text focus-visible:ring-2 focus-visible:ring-site-accent"
      >
        <SlidersHorizontal className="size-5" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <ChatOptionsSheet chat={chat} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
