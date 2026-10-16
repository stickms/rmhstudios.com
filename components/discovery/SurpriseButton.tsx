'use client';

import { useTranslation } from 'react-i18next';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSurprise } from './useSurprise';

export function SurpriseButton() {
  const { t } = useTranslation('f-discovery');
  const { run, busy } = useSurprise();
  return (
    <Button size="sm" variant="outline" loading={busy} onClick={() => void run()}>
      <Shuffle aria-hidden /> {t('surprise-label', { defaultValue: 'Surprise me' })}
    </Button>
  );
}
