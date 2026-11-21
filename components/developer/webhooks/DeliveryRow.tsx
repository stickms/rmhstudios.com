import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { WebhookDeliveryRow } from '@/lib/developer/webhooks.contract';
import { formatWhen } from './format';
import { DeliveryStatusBadge } from './StatusBadges';

interface DeliveryRowProps {
  delivery: WebhookDeliveryRow;
  redelivering: boolean;
  onRedeliver: (delivery: WebhookDeliveryRow) => void;
}

/** One delivery: a summary line that is a disclosure button, and the payload and error when open. */
export function DeliveryRow({ delivery, redelivering, onRedeliver }: DeliveryRowProps) {
  const { t } = useTranslation('dev-webhooks');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="border-b border-site-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-start"
      >
        <Chevron className="size-4 shrink-0 text-site-text-muted rtl:-scale-x-100" aria-hidden />
        <span className="t-body font-mono" dir="ltr">
          {delivery.event}
        </span>
        <DeliveryStatusBadge status={delivery.status} />
        <span className="t-meta" dir="ltr">
          {delivery.responseStatus === null
            ? t('row-no-response', { defaultValue: 'No response' })
            : t('row-http', { defaultValue: 'HTTP {{status}}', status: delivery.responseStatus })}
        </span>
        <span className="t-meta">
          {t('row-attempts', { defaultValue: 'Attempts: {{n}}', n: delivery.attempts })}
        </span>
        {delivery.durationMs !== null && (
          <span className="t-meta">
            {t('row-duration', { defaultValue: '{{ms}} ms', ms: delivery.durationMs })}
          </span>
        )}
        <time className="t-meta ms-auto" dateTime={delivery.createdAt}>
          {formatWhen(delivery.createdAt)}
        </time>
      </button>

      {open && (
        <div id={panelId} className="space-y-3 pb-3 ps-7">
          {delivery.redeliveryOfId && (
            <p className="t-meta">
              {t('row-redelivery-of', {
                defaultValue: 'Redelivery of {{id}}',
                id: delivery.redeliveryOfId,
              })}
            </p>
          )}
          {delivery.error && (
            <div>
              <p className="t-label">{t('row-error', { defaultValue: 'Error' })}</p>
              <p className="t-body break-words" dir="ltr">
                {delivery.error}
              </p>
            </div>
          )}
          <div>
            <p className="t-label">{t('row-payload', { defaultValue: 'Payload' })}</p>
            <pre
              dir="ltr"
              tabIndex={0}
              aria-label={t('row-payload-label', { defaultValue: 'Payload JSON' })}
              className="t-meta mt-1 max-h-72 overflow-auto rounded-site border border-site-border bg-site-bg-subtle p-3 text-site-text"
            >
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>
          {delivery.status !== 'PENDING' && (
            <Button size="sm" loading={redelivering} onClick={() => onRedeliver(delivery)}>
              <RotateCw aria-hidden /> {t('row-redeliver', { defaultValue: 'Redeliver' })}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
