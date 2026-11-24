import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PROGRAM_KEYS, toggleProgramKey, type ProgramKey } from '../engine/programs';
import { useMedLabels } from './labels';

/**
 * The index, live feed, activity rail and preferences' program control (owner 2026-11-23): four independent toggles,
 * MD, MD-PhD, DO and DO-PhD, in one labelled group. At least one stays on; all four on is "no filter" (it is also the
 * only set that includes events that did not report a program). The same shape as `CategoryToggles` and
 * `ProgramToggles`: `aria-pressed` buttons, never a tab strip, pressed is a filled wash, a stronger border and weight 600
 * (`.medapp-chip` in the `.medapp-chips` well), never colour alone. `size="xs"` is the compact variant the narrow rail
 * uses.
 */
export function ProgramSetToggles({
  value,
  onChange,
  size = 'sm',
  className,
}: {
  value: readonly ProgramKey[];
  onChange: (next: ProgramKey[]) => void;
  size?: 'sm' | 'xs';
  className?: string;
}) {
  const { t } = useTranslation('medschools');
  const { programKeyLabel } = useMedLabels();
  const onCount = PROGRAM_KEYS.filter((k) => value.includes(k)).length;
  return (
    <div
      role="group"
      aria-label={t('program-set-label', { defaultValue: 'Programs' })}
      className={cn('medapp-chips', size === 'xs' && 'medapp-chips--xs', className)}
    >
      {PROGRAM_KEYS.map((key) => {
        const pressed = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            className="medapp-chip"
            aria-pressed={pressed}
            aria-disabled={pressed && onCount <= 1 ? true : undefined}
            onClick={() => onChange(toggleProgramKey(value, key))}
          >
            {programKeyLabel(key)}
          </button>
        );
      })}
    </div>
  );
}
