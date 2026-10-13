'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { readPending } from '@/lib/arcade/run-client';

/** Tells a player who arrived by seed or daily link that their next solo run uses it. */
export function ChallengeNotice() {
  const { t } = useTranslation('f-arcade');
  useEffect(() => {
    const p = readPending();
    if (!p) return;
    toast(
      p.kind === 'daily'
        ? t('notice-daily', {
            defaultValue:
              "Today's mutator is loaded. Start a solo run to take your one counted attempt.",
          })
        : t('notice-seed', { defaultValue: 'Shared seed loaded. Start a solo run to play it.' }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
