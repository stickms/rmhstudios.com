import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MedSchoolDetailDto } from '../medschools.contract';

/** Interview format, type and website as wash-coloured tiles (degree and place sit under the title). */
export function SchoolFacts({ school }: { school: MedSchoolDetailDto['school'] }) {
  const { t } = useTranslation('medschools');
  const rows: { key: string; label: string; value: ReactNode }[] = [];
  if (school.interviewFormat) {
    rows.push({
      key: 'format',
      label: t('school-fact-format', { defaultValue: 'Interview format' }),
      value: school.interviewFormat,
    });
  }
  if (school.interviewType) {
    rows.push({
      key: 'type',
      label: t('school-fact-type', { defaultValue: 'Interview type' }),
      value: school.interviewType,
    });
  }
  if (school.website) {
    rows.push({
      key: 'website',
      label: t('school-fact-website', { defaultValue: 'Website' }),
      value: (
        <a href={school.website} target="_blank" rel="noopener noreferrer">
          {school.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      ),
    });
  }
  if (rows.length === 0) return null;
  return (
    <dl className="medapp-tiles">
      {rows.map((r) => (
        <div key={r.key} className="medapp-tile">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
