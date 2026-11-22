/**
 * The clock's place in an untimed solo round (the no-timed-input assist): the word "Untimed"
 * and a "Finish" button. Nothing counts down and nothing moves; the player ends the round.
 */

import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UntimedReadout({ onFinish }: { onFinish?: () => void }) {
  const { t } = useTranslation('driftway-laundry-assists');
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="ls-panel px-3 py-2 sm:px-4" data-testid="laundry-untimed">
        <div className="ls-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest sm:text-xs">
          <Timer className="size-3 sm:size-3.5" aria-hidden="true" />
          {t('laundry-time-label', { defaultValue: 'Time' })}
        </div>
        <span className="ls-numeric block text-xl font-black leading-tight sm:text-3xl">
          {t('laundry-untimed', { defaultValue: 'Untimed' })}
        </span>
      </div>
      <Button size="sm" className="pointer-events-auto pointer-coarse:min-h-11" onClick={onFinish}>
        {t('laundry-finish', { defaultValue: 'Finish' })}
      </Button>
      <p className="sr-only" role="status">
        {t('laundry-untimed-status', { defaultValue: 'Untimed round. Choose Finish when you are done.' })}
      </p>
    </div>
  );
}
