import { useTranslation } from 'react-i18next';

export function ReportedNote() {
  const { t } = useTranslation('medschools');
  return (
    <p className="t-meta m-0">
      {t('reported-note', {
        defaultValue: 'Reported events, not applicants. Sources overlap and are never added together.',
      })}
    </p>
  );
}
