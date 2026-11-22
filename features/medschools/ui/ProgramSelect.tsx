import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import type { MedDegreeId, MedLiveProgramFilter, MedProgramFilter } from '../medschools.contract';
import { useMedLabels } from './labels';

/* A school is MD or DO, so its page offers All, the degree and its PhD track, labelled by degree (O5). */

const PROGRAMS: readonly MedProgramFilter[] = ['ALL', 'REG', 'PHD'];

/** The values a school of this degree offers. Never the other degree's. */
export function programOptions(_degree: MedDegreeId): readonly MedProgramFilter[] {
  return PROGRAMS;
}

export function ProgramSelect({
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
  return (
    <Select
      controlSize="sm"
      aria-label={t('program-select-label', { defaultValue: 'Program' })}
      value={value}
      onChange={(e) => onChange(e.target.value as MedProgramFilter)}
    >
      {programOptions(degree).map((p) => (
        <option key={p} value={p}>
          {programFilterLabel(p, degree)}
        </option>
      ))}
    </Select>
  );
}

/* Index and live: many schools, so one select that sets `degree` and `program` together. */

export type DegreeProgramValue = { degree?: MedDegreeId | undefined; program: MedLiveProgramFilter };
type OptionValue = 'ALL' | 'MD' | 'MD-PHD' | 'DO' | 'DO-PHD' | 'NONE';

export function degreeProgramOptions(o: {
  schoolDegree?: MedDegreeId | undefined;
  allowNone?: boolean | undefined;
}): OptionValue[] {
  const out: OptionValue[] = ['ALL'];
  if (o.schoolDegree !== 'DO') out.push('MD', 'MD-PHD');
  if (o.schoolDegree !== 'MD') out.push('DO', 'DO-PHD');
  if (o.allowNone) out.push('NONE');
  return out;
}

export function degreeProgramToValue(v: DegreeProgramValue): OptionValue {
  if (v.program === 'NONE') return 'NONE';
  if (!v.degree) return 'ALL';
  if (v.program === 'REG') return v.degree;
  if (v.program === 'PHD') return v.degree === 'MD' ? 'MD-PHD' : 'DO-PHD';
  return 'ALL';
}

export function degreeProgramFromValue(v: string): DegreeProgramValue {
  switch (v) {
    case 'MD':
    case 'DO':
      return { degree: v, program: 'REG' };
    case 'MD-PHD':
      return { degree: 'MD', program: 'PHD' };
    case 'DO-PHD':
      return { degree: 'DO', program: 'PHD' };
    case 'NONE':
      return { program: 'NONE' };
    default:
      return { program: 'ALL' };
  }
}

export function DegreeProgramSelect({
  value,
  onChange,
  allowNone,
  schoolDegree,
}: {
  value: DegreeProgramValue;
  onChange: (v: DegreeProgramValue) => void;
  allowNone?: boolean;
  /** The one school the list is filtered to: only its degree's options show (O5). */
  schoolDegree?: MedDegreeId;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const options = degreeProgramOptions({ schoolDegree, allowNone });
  const current = degreeProgramToValue(value);
  const label = (o: OptionValue): string => {
    switch (o) {
      case 'MD':
        return programFilterLabel('REG', 'MD');
      case 'MD-PHD':
        return programFilterLabel('PHD', 'MD');
      case 'DO':
        return programFilterLabel('REG', 'DO');
      case 'DO-PHD':
        return programFilterLabel('PHD', 'DO');
      default:
        return programFilterLabel(o);
    }
  };
  return (
    <Select
      controlSize="sm"
      aria-label={t('program-select-label', { defaultValue: 'Program' })}
      value={options.includes(current) ? current : 'ALL'}
      onChange={(e) => onChange(degreeProgramFromValue(e.target.value))}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </Select>
  );
}
