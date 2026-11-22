import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { JsonBlock } from '@/components/admin/JsonBlock';
import { apiQuery } from '@/lib/contract/client';
import { getAdminOutboxEventApi } from '@/lib/admin/outbox.contract';
import { formatUtc } from '@/lib/admin/jobs';
import type { OutboxAction } from '@/lib/admin/outbox-admin';

/** One outbox event: its timestamps, its whole last error, its payload, and requeue or discard when it is dead. */
export function OutboxEventDialog({
  id,
  onClose,
  onAction,
}: {
  /** The open event's id; null keeps the dialog closed. */
  id: string | null;
  onClose: () => void;
  onAction: (action: OutboxAction, id: string) => void;
}) {
  const { t } = useTranslation('admin-outbox');
  const { data, isPending, isError } = useQuery({
    ...apiQuery(getAdminOutboxEventApi, {
      params: {
        id: id ?? '',
      },
    }),
    enabled: id !== null,
  });
  // M9: the details replace the skeleton, so they fade in when they arrive.
  const arrival = useArrival(!isPending);
  const event = data?.event;
  const none = t('detail-none', {
    defaultValue: 'None',
  });
  const time = (iso: string | null) => formatUtc(iso) || none;
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" aria-describedby="outbox-detail-desc">
        <DialogHeader>
          <DialogTitle>
            {t('detail-title', {
              defaultValue: 'Outbox event',
            })}
          </DialogTitle>
          <DialogDescription id="outbox-detail-desc" className="t-meta break-all">
            {event ? `${event.topic} · ${event.id}` : id}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError || !event ? (
          <p role="alert" className="t-body text-site-danger">
            {t('detail-error', {
              defaultValue: 'This event could not be loaded. It may have been discarded.',
            })}
          </p>
        ) : (
          <div className={cn('max-h-[70vh] space-y-4 overflow-y-auto', arrival)}>
            <dl className="t-meta grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt>
                {t('detail-created', {
                  defaultValue: 'Created',
                })}
              </dt>
              <dd className="text-site-text">{time(event.createdAt)}</dd>
              <dt>
                {t('detail-attempts', {
                  defaultValue: 'Attempts',
                })}
              </dt>
              <dd className="text-site-text">{event.attempts}</dd>
              <dt>
                {t('detail-next-attempt', {
                  defaultValue: 'Next attempt',
                })}
              </dt>
              <dd className="text-site-text">{time(event.nextAttempt)}</dd>
              <dt>
                {t('detail-dead', {
                  defaultValue: 'Gave up',
                })}
              </dt>
              <dd className="text-site-text">{time(event.deadAt)}</dd>
              <dt>
                {t('detail-delivered', {
                  defaultValue: 'Delivered',
                })}
              </dt>
              <dd className="text-site-text">{time(event.deliveredAt)}</dd>
            </dl>
            {event.lastError ? (
              <JsonBlock
                label={t('detail-error-label', {
                  defaultValue: 'Last error',
                })}
                field={{
                  text: event.lastError,
                  truncated: false,
                }}
                truncatedNote=""
              />
            ) : (
              <p className="t-meta">
                {t('detail-no-error', {
                  defaultValue: 'No error recorded.',
                })}
              </p>
            )}
            <JsonBlock
              label={t('detail-payload', {
                defaultValue: 'Payload',
              })}
              field={event.payload}
              truncatedNote={t('detail-truncated', {
                defaultValue: 'Truncated at 8 KB.',
              })}
            />
            {event.deadAt && !event.deliveredAt ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => onAction('requeue', event.id)}>
                  {t('action-requeue', {
                    defaultValue: 'Requeue',
                  })}
                </Button>
                <Button variant="danger" onClick={() => onAction('discard', event.id)}>
                  {t('action-discard', {
                    defaultValue: 'Discard',
                  })}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
