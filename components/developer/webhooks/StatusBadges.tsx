import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { WebhookDeliveryStatus } from '@/lib/developer/webhooks.contract';
import type { WebhookHealth } from '@/lib/webhooks/health';

/** An endpoint's health: words plus a glyph, never colour alone. */
export function HealthBadge({ health }: { health: WebhookHealth }) {
  const { t } = useTranslation('dev-webhooks');
  switch (health) {
    case 'healthy':
      return <Badge variant="success">{t('health-healthy', { defaultValue: 'Healthy' })}</Badge>;
    case 'degraded':
      return <Badge variant="warning">{t('health-degraded', { defaultValue: 'Degraded' })}</Badge>;
    case 'failing':
      return <Badge variant="danger">{t('health-failing', { defaultValue: 'Failing' })}</Badge>;
    default:
      return <Badge>{t('health-idle', { defaultValue: 'No deliveries yet' })}</Badge>;
  }
}

export function DeliveryStatusBadge({ status }: { status: WebhookDeliveryStatus }) {
  const { t } = useTranslation('dev-webhooks');
  switch (status) {
    case 'DELIVERED':
      return <Badge variant="success">{t('status-delivered', { defaultValue: 'Delivered' })}</Badge>;
    case 'FAILED':
      return <Badge variant="danger">{t('status-failed', { defaultValue: 'Failed' })}</Badge>;
    default:
      return (
        <Badge icon={<Clock aria-hidden />}>{t('status-pending', { defaultValue: 'Retrying' })}</Badge>
      );
  }
}
