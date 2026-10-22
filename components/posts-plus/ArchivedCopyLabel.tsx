'use client';

import { Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { waybackTimestampToIso } from '@/lib/posts-plus/wayback';

/**
 * X11 - shown on a link card whose page has gone and which now points at its
 * Wayback Machine snapshot. Says so plainly, with the capture date when known.
 */
export function ArchivedCopyLabel({ archivedAt }: { archivedAt?: string | null }) {
  const { t } = useTranslation('f-posts-plus');
  const iso = archivedAt ? waybackTimestampToIso(archivedAt) : null;
  return (
    <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-site-warning">
      <Archive className="w-3 h-3" aria-hidden />
      {iso
        ? t('archived-copy-dated', {
            defaultValue: 'Archived copy · saved {{date}}',
            date: new Date(iso).toLocaleDateString(),
          })
        : t('archived-copy', { defaultValue: 'Archived copy' })}
    </p>
  );
}
