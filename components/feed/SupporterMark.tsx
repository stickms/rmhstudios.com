import { useTranslation } from 'react-i18next';

/**
 * The word "Supporter" after a reply's name (sprint 14 #13). Seen only by the post's author, on replies from their
 * active supporters. A word in `t-meta`, no colour and no icon, so it means the same to everyone and to a screen reader.
 */
export function SupporterMark() {
  const { t } = useTranslation('supporter-marks');
  return (
    <span className="t-meta" data-slot="supporter-mark">
      {' · '}
      {t('supporter', { defaultValue: 'Supporter' })}
    </span>
  );
}
