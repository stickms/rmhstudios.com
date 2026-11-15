import { useTranslation } from 'react-i18next';
import { SpineItem } from '@/components/ui/spine';
import type { OtherUser } from './conversation-state';

/** The other participant's "is typing" line at the end of the thread: a dotted item with the words, nothing moving (M6). */
export function TypingBubble({ otherUser }: { otherUser: OtherUser | null }) {
  const { t } = useTranslation('feed');
  return (
    <SpineItem className="spine-item--tight">
      <p className="t-meta" role="status">
        {t('user-is-typing', {
          name: otherUser?.name || t('user-fallback', { defaultValue: 'User' }),
          defaultValue: '{{name}} is typing',
        })}
      </p>
    </SpineItem>
  );
}
