import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { OtherUser } from './conversation-state';

/** The other participant's "is typing" bubble at the end of the thread. */
export function TypingBubble({ otherUser }: { otherUser: OtherUser | null }) {
  const { t } = useTranslation('feed');
  return (
    <div className="flex items-end gap-2 mb-3">
      <UserAvatar
        src={otherUser?.image ?? undefined}
        alt={otherUser?.name || 'User'}
        size={28}
        fallbackName={otherUser?.name ?? undefined}
      />
      <div className="bg-site-text text-site-bg rounded-tl-site-sm rounded-tr-site rounded-br-site rounded-bl-site-sm px-4 py-3">
        <div
          className="flex items-center gap-1"
          aria-label={t('user-is-typing', {
            name: otherUser?.name || t('user-fallback', { defaultValue: 'User' }),
            defaultValue: '{{name}} is typing',
          })}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-site-bg/50 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-site-bg/50 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-site-bg/50 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
