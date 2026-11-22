/**
 * "You've read this for {{minutes}} minutes" — one muted line in a reader's tools
 * panel, shown only while the member is tracking their reading time.
 */

import { useTranslation } from 'react-i18next';
import { minutesOf } from '@/lib/reading/time';

export function ReadingTimeLine({
  tracking,
  seconds,
  className,
}: {
  tracking: boolean;
  /** Total seconds read of this document; null until known. */
  seconds: number | null;
  className?: string;
}) {
  const { t } = useTranslation('reading-time');
  if (!tracking || seconds === null) return null;
  const minutes = minutesOf(seconds);
  return (
    <p className={className ? `t-meta ${className}` : 't-meta'}>
      {t('doc-line', {
        count: minutes,
        defaultValue: "You've read this for {{count}} minute",
        defaultValue_other: "You've read this for {{count}} minutes",
      })}
    </p>
  );
}
