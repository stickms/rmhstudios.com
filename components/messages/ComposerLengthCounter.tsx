import { useTranslation } from 'react-i18next';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';
import { lengthState } from '@/lib/messages/length-counter';
import { cn } from '@/lib/utils';

/**
 * Used/max counter under a message composer. Renders nothing until the draft is
 * within 10% of the limit, because the textarea's native `maxLength` otherwise
 * swallows keystrokes and pastes without telling anyone.
 */
export function ComposerLengthCounter({ used }: { used: number }) {
  const { t } = useTranslation('feed');
  const state = lengthState(used);
  if (state === 'hidden') return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'mt-1 text-right font-mono text-[11px]',
        state === 'full' ? 'text-site-danger' : 'text-site-text-muted',
      )}
    >
      {t('message-edit-length', {
        defaultValue: '{{used}}/{{max}}',
        used,
        max: MESSAGE_MAX_LENGTH,
      })}
    </p>
  );
}
