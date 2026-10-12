'use client';

import { useTranslation } from 'react-i18next';
import { Clock, Coins, Palette, Pin } from 'lucide-react';
import type { SystemAction } from '@/lib/chat-plus/types';

/**
 * A centred in-chat line for things that happen *to* the chat rather than being
 * said in it: the disappearing timer or theme changing (M3, M9), a pin (M6) and
 * a `/tip` (M4). Rendered from `meta`, so it is translated for each reader; the
 * English `content` fallback is only for previews and search.
 */
export function ChatSystemLine({
  meta,
  fallback,
  viewerId,
  nameOf,
}: {
  meta: unknown;
  fallback: string;
  viewerId: string;
  /** Display name for another participant; null when unknown. */
  nameOf: (userId: string) => string | null;
}) {
  const { t } = useTranslation('f-messaging');
  const action = meta as SystemAction | null;
  const who = (id: string) =>
    id === viewerId
      ? t('you', { defaultValue: 'You' })
      : (nameOf(id) ?? t('someone', { defaultValue: 'Someone' }));

  let text = fallback;
  let Icon = Clock;
  if (action && typeof action === 'object' && 'action' in action) {
    switch (action.action) {
      case 'timer': {
        Icon = Clock;
        if (!action.seconds) {
          text = t('line-timer-off', {
            name: who(action.actorId),
            defaultValue: '{{name}} turned off disappearing messages',
          });
        } else {
          const duration =
            action.seconds === 3600
              ? t('duration-1h', { defaultValue: '1 hour' })
              : action.seconds === 86_400
                ? t('duration-1d', { defaultValue: '1 day' })
                : t('duration-7d', { defaultValue: '7 days' });
          text = t('line-timer-on', {
            name: who(action.actorId),
            duration,
            defaultValue: '{{name}} set messages to disappear after {{duration}}',
          });
        }
        break;
      }
      case 'theme':
        Icon = Palette;
        text = action.themeKey
          ? t('line-theme-set', {
              name: who(action.actorId),
              defaultValue: '{{name}} changed the chat theme',
            })
          : t('line-theme-reset', {
              name: who(action.actorId),
              defaultValue: '{{name}} reset the chat theme',
            });
        break;
      case 'pin':
        Icon = Pin;
        text = action.pinned
          ? t('line-pinned', {
              name: who(action.actorId),
              defaultValue: '{{name}} pinned a message',
            })
          : t('line-unpinned', {
              name: who(action.actorId),
              defaultValue: '{{name}} unpinned a message',
            });
        break;
      case 'tip':
        Icon = Coins;
        text = t('line-tip', {
          from: who(action.fromId),
          to: who(action.toId),
          amount: action.amount,
          defaultValue: '{{from}} tipped {{to}} {{amount}} coins',
        });
        break;
    }
  }

  return (
    <div
      role="note"
      className="my-3 flex items-center justify-center gap-1.5 px-6 text-center text-xs text-site-text-dim"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
