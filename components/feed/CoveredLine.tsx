import { useTranslation } from 'react-i18next';

/** The reason on its own line, with its kicker: what stands in for a covered post's text. */
export function CoveredLine({ reason, className, id }: { reason: string | null; className?: string; id?: string }) {
  const { t } = useTranslation('content-warnings');
  return (
    <p id={id} className={className}>
      <span className="t-label me-2">{t('covered-kicker', { defaultValue: 'Content warning' })}</span>
      {reason}
    </p>
  );
}
