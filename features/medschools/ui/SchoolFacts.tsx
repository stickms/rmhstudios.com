import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MedSchoolDetailDto } from '../medschools.contract';

/** Interview format, type and website as `t-meta` rows on rules (degree and place sit under the title). */
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
        <a href={school.website} target="_blank" rel="noopener noreferrer" className="underline">
          {school.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      ),
    });
  }
  return (
    <dl className="m-0">
      {rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-4 border-b border-site-border py-2">
          <dt className="t-meta">{r.label}</dt>
          <dd className="t-body m-0 min-w-0 break-words text-end">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
