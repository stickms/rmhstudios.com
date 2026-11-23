import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MedDegreeId, MedProgramFilter } from '../medschools.contract';
import { useMedLabels } from './labels';

/**
 * The school page's program control (owner O7 addition): two toggle buttons for the school's own degree, "MD" and
 * "MD-PhD" (a DO school: "DO", "DO-PhD"), a multi-select. Both on is today's `ALL`, only the degree is `REG`, only the
 * PhD track is `PHD`; at least one stays on. The URL's `program` param is unchanged (ALL | REG | PHD), so links and the
 * API are too. A labelled group of `aria-pressed` buttons like `CategoryToggles`, not a tab strip.
 */
export interface ProgramOn {
  reg: boolean;
  phd: boolean;
}

export const programToOn = (p: MedProgramFilter): ProgramOn => ({ reg: p !== 'PHD', phd: p !== 'REG' });

export function programFromOn(on: ProgramOn): MedProgramFilter {
  if (on.reg && on.phd) return 'ALL';
  return on.phd ? 'PHD' : 'REG';
}

/** Press one: the last one that is on cannot be turned off. */
export function toggleProgram(value: MedProgramFilter, which: 'reg' | 'phd'): MedProgramFilter {
  const on = programToOn(value);
  const next = { ...on, [which]: !on[which] };
  if (!next.reg && !next.phd) return value;
  return programFromOn(next);
}

export function ProgramToggles({
  degree,
  value,
  onChange,
}: {
  degree: MedDegreeId;
  value: MedProgramFilter;
  onChange: (v: MedProgramFilter) => void;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const on = programToOn(value);
  const onCount = Number(on.reg) + Number(on.phd);
  return (
    <div
      role="group"
      aria-label={t('program-toggles-label', { defaultValue: 'Programs' })}
      className="flex flex-wrap gap-2"
    >
      {(['reg', 'phd'] as const).map((which) => {
        const pressed = on[which];
        return (
          <Button
            key={which}
            type="button"
            variant="default"
            size="sm"
            aria-pressed={pressed}
            aria-disabled={pressed && onCount <= 1 ? true : undefined}
            className={cn(pressed ? 'border-site-text font-semibold' : 'text-site-text-muted')}
            onClick={() => onChange(toggleProgram(value, which))}
          >
            {programFilterLabel(which === 'reg' ? 'REG' : 'PHD', degree)}
          </Button>
        );
      })}
    </div>
  );
}
