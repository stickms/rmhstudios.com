import { useTranslation } from 'react-i18next';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useSurprise } from './useSurprise';

/** The "take me somewhere" button. `iconOnly` is the compact form beside a search field; its label is the tooltip. */
export function SurpriseButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation('f-discovery');
  const { run, busy } = useSurprise();
  const label = t('surprise-label', { defaultValue: 'Surprise me' });
  if (iconOnly) {
    return <IconButton icon={Shuffle} label={label} variant="default" size="icon" loading={busy} onClick={() => void run()} />;
  }
  return (
    <Button size="sm" variant="default" loading={busy} onClick={() => void run()}>
      <Shuffle aria-hidden /> {label}
    </Button>
  );
}
