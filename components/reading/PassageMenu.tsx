/**
 * The two passage actions, shared by the selection toolbar and a highlight's menu, and the one-line notice an
 * arrival shows when the linked passage is gone. Strings are the `passage-links` namespace.
 */

import { Link2, MessageSquareQuote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ARRIVE } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export function PassageMenuItems({ onCopy, onPost }: { onCopy: () => void; onPost: () => void }) {
  const { t } = useTranslation('passage-links');
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
        <Link2 aria-hidden />
        {t('copy-link', { defaultValue: 'Copy link to passage' })}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onPost}>
        <MessageSquareQuote aria-hidden />
        {t('post-passage', { defaultValue: 'Post this passage' })}
      </Button>
    </>
  );
}

/** One line on a rule, never a box (D8 is open). */
export function PassageMissingNote({ className }: { className?: string }) {
  const { t } = useTranslation('passage-links');
  return (
    <p role="status" className={cn('t-meta mb-4 border-b border-site-border pb-2', ARRIVE, className)}>
      {t('passage-missing', { defaultValue: 'That passage is no longer in this text.' })}
    </p>
  );
}
