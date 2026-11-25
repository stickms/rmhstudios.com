import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MedSchoolDetailDto } from '../medschools.contract';

/** Interview format and type, and the school's own website, admissions and combined-degree pages, as wash-coloured tiles (degree and place sit under the title). */
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
  const link = (url: string, text?: string) => (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {text ??
        url
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')}
    </a>
  );
  if (school.website) {
    rows.push({
      key: 'website',
      label: t('school-fact-website', { defaultValue: 'Website' }),
      value: link(school.website),
    });
  }
  const isDo = school.degree === 'DO';
  if (school.admissionsUrl) {
    rows.push({
      key: 'admissions',
      label: isDo
        ? t('school-fact-admissions-do', { defaultValue: 'DO admissions' })
        : t('school-fact-admissions-md', { defaultValue: 'MD admissions' }),
      value: link(school.admissionsUrl),
    });
  }
  if (school.mdphdUrl) {
    rows.push({
      key: 'mdphd',
      label: isDo
        ? t('school-fact-mdphd-do', { defaultValue: 'DO-PhD program' })
        : t('school-fact-mdphd-md', { defaultValue: 'MD-PhD program' }),
      value: link(school.mdphdUrl),
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
