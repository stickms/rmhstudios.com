import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * An empty or failed state in a paper panel: one line (and an optional second, muted one), and a "Try again" chip when
 * there is something to retry, or the caller's own `action` (one ink primary per view).
 */
export function MedEmpty({
  title,
  description,
  action,
  onRetry,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('medschools');
  return (
    <div className="medapp-panel medapp-panel--padded">
      <p className="medapp-empty">{title}</p>
      {description ? <p className="medapp-meta medapp-empty__body">{description}</p> : null}
      {action ? <div className="medapp-empty__action">{action}</div> : null}
      {onRetry ? (
        <button type="button" className="medapp-chip" onClick={onRetry}>
          {t('retry', { defaultValue: 'Try again' })}
        </button>
      ) : null}
    </div>
  );
}
