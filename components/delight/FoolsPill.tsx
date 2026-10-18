'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Z8 — the always-visible off switch while April Fools mode is on. */
export default function FoolsPill({ onOff }: { onOff: () => void }) {
  const { t } = useTranslation('f-delight');
  return (
    <div
      role="status"
      data-floating="feature-overlay"
      className="glass-overlay fixed inset-x-0 top-3 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-site px-3 py-1.5 text-sm text-site-text"
    >
      <span>{t('fools-on', { defaultValue: 'April Fools mode is on' })}</span>
      <Button size="sm" variant="ghost" onClick={onOff}>
        {t('fools-off', { defaultValue: 'Turn off' })}
      </Button>
    </div>
  );
}
