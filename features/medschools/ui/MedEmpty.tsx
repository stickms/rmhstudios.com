import { useTranslation } from 'react-i18next';

/** An empty or failed state in a paper panel: one line, and a "Try again" chip when there is something to retry. */
export function MedEmpty({ title, onRetry }: { title: string; onRetry?: () => void }) {
  const { t } = useTranslation('medschools');
  return (
    <div className="medapp-panel medapp-panel--padded">
      <p className="medapp-empty">{title}</p>
      {onRetry ? (
        <button type="button" className="medapp-chip" onClick={onRetry}>
          {t('retry', { defaultValue: 'Try again' })}
        </button>
      ) : null}
    </div>
  );
}
