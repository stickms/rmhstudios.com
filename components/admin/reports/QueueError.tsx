import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** The queue could not be loaded: say so and offer another try. */
export function QueueError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('report-triage');
  return (
    <EmptyState
      icon={Flag}
      title={t('load-failed', {
        defaultValue: 'The queue could not be loaded.',
      })}
      action={
        <Button size="sm" onClick={onRetry}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </Button>
      }
    />
  );
}
