import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MedButton } from './controls/MedButton';

/**
 * An empty or failed state in a paper panel: centred, calm and short. One line in the body ink, an optional second in
 * the secondary size, and one action: the caller's own `action` (one ink primary per view), or a "Try again" button
 * when there is something to retry.
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
    <div className="medapp-panel medapp-empty-state">
      <p className="medapp-empty">{title}</p>
      {description ? <p className="medapp-meta">{description}</p> : null}
      {action || onRetry ? (
        <div className="medapp-actions">
          {action}
          {onRetry ? <MedButton onClick={onRetry}>{t('retry', { defaultValue: 'Try again' })}</MedButton> : null}
        </div>
      ) : null}
    </div>
  );
}
