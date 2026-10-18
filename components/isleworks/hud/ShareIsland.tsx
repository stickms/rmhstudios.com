'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShareWorldDialog } from '@/components/worlds/ShareWorldDialog';
import { toSavedCity } from '@/lib/isleworks/city';
import { useIsleworks } from '@/lib/isleworks/store';

/** R6: publish a read-only snapshot of the island and collect postcards. */
export function ShareIsland() {
  const { t } = useTranslation('f-worlds');
  const [open, setOpen] = useState(false);

  return (
    <section className="isw-panel isw-section">
      <button
        type="button"
        className="isw-btn"
        style={{ width: '100%' }}
        onClick={() => setOpen(true)}
      >
        <Share2 size={14} aria-hidden />
        {t('isle-share', { defaultValue: 'Share island' })}
      </button>
      {open && (
        <ShareWorldDialog
          kind="isleworks"
          open={open}
          onOpenChange={setOpen}
          title={t('isle-share-title', { defaultValue: 'Share your island' })}
          getPayload={() => toSavedCity(useIsleworks.getState().city)}
        />
      )}
    </section>
  );
}
