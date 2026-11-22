import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, RefreshCw, RotateCw, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import {
  deleteWebhookApi,
  getWebhookApi,
  redeliverWebhookApi,
  rotateWebhookSecretApi,
  testWebhookApi,
  updateWebhookApi,
  type WebhookDeliveryRow,
} from '@/lib/developer/webhooks.contract';
import { DELIVERY_STATUS_FILTERS } from '@/lib/developer/webhooks-schema';
import { toast } from '@/lib/toast';
import { WEBHOOK_EVENT_NAMES, WEBHOOK_PING_EVENT } from '@/lib/webhooks/events';
import { cn } from '@/lib/utils';
import { AdminDisabledLine } from './webhooks/AdminDisabledLine';
import { DeliveryRow } from './webhooks/DeliveryRow';
import { EndpointFormDialog } from './webhooks/EndpointFormDialog';
import { failureText, formatWhen } from './webhooks/format';
import { SecretDialog, type RevealedSecret } from './webhooks/SecretDialog';
import { HealthBadge } from './webhooks/StatusBadges';

type StatusFilter = (typeof DELIVERY_STATUS_FILTERS)[number];

type TestEvent = 'ping' | 'personal_best.created' | 'achievement.unlocked';

const EVENT_FILTERS = [WEBHOOK_PING_EVENT, ...WEBHOOK_EVENT_NAMES];

/** One endpoint: its settings and actions, and its delivery log with filters. */
export function WebhookDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation('dev-webhooks');
  const [testEvent, setTestEvent] = useState<TestEvent>('ping');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [event, setEvent] = useState('');
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  const deliveries = useInfiniteQuery({
    queryKey: ['developer', 'webhooks', id, 'deliveries', status, event],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(getWebhookApi, {
        params: { id },
        query: {
          ...(status === 'all' ? {} : { status }),
          ...(event ? { event } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  const arrival = useArrival(!deliveries.isPending);
  const endpoint = deliveries.data?.pages[0]?.endpoint;
  const rows = deliveries.data?.pages.flatMap((p) => p.deliveries) ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['developer', 'webhooks'] });
  const fail = (fallback: string) => (err: unknown) => toast.error(failureText(err, fallback));

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => api(updateWebhookApi, { params: { id }, body: { enabled } }),
    onSuccess: refresh,
    onError: fail(t('detail-toggle-failed', { defaultValue: 'Could not change the endpoint.' })),
  });

  const sendTest = useMutation({
    mutationFn: () => api(testWebhookApi, { params: { id }, query: testEvent === 'ping' ? {} : { event: testEvent } }),
    onSuccess: ({ delivery }) => {
      void refresh();
      if (delivery.status === 'DELIVERED') {
        toast.success(
          t('detail-test-ok', {
            defaultValue: 'Test event delivered (HTTP {{status}}).',
            status: delivery.responseStatus ?? 0,
          }),
        );
      } else {
        toast.error(
          t('detail-test-failed', {
            defaultValue: 'Test event not delivered: {{error}}',
            error: delivery.error ?? '',
          }),
        );
      }
    },
    onError: fail(t('detail-test-error', { defaultValue: 'Could not send the test event.' })),
  });

  const redeliver = useMutation({
    mutationFn: (delivery: WebhookDeliveryRow) => api(redeliverWebhookApi, { params: { id: delivery.id } }),
    onSuccess: () => {
      void refresh();
      toast.success(t('detail-redelivered', { defaultValue: 'Sent again as a new delivery.' }));
    },
    onError: fail(t('detail-redeliver-error', { defaultValue: 'Could not redeliver.' })),
  });

  async function rotate() {
    const ok = await confirm({
      title: t('detail-rotate-title', { defaultValue: 'Rotate the signing secret?' }),
      description: t('detail-rotate-body', {
        defaultValue:
          'You get a new secret now. The current one keeps working for 24 hours, and every delivery carries both signatures until then.',
      }),
      confirmLabel: t('detail-rotate-confirm', { defaultValue: 'Rotate secret' }),
    });
    if (!ok) return;
    try {
      const rotated = await api(rotateWebhookSecretApi, { params: { id } });
      setRevealed({ secret: rotated.secret, reason: 'rotated' });
      await refresh();
    } catch (err) {
      toast.error(failureText(err, t('detail-rotate-error', { defaultValue: 'Could not rotate the secret.' })));
    }
  }

  async function remove() {
    if (!endpoint) return;
    const ok = await confirm({
      title: t('detail-delete-title', { defaultValue: 'Delete this endpoint?' }),
      description: t('detail-delete-body', {
        defaultValue: 'Delete {{url}} and its delivery log. This cannot be undone.',
        url: endpoint.url,
      }),
      confirmLabel: t('detail-delete-confirm', { defaultValue: 'Delete endpoint' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteWebhookApi, { params: { id } });
      // Leave first: refreshing while this detail is still mounted would re-request the deleted endpoint.
      onBack();
      void queryClient.invalidateQueries({ queryKey: ['developer', 'webhooks'] });
    } catch (err) {
      toast.error(failureText(err, t('detail-delete-error', { defaultValue: 'Could not delete the endpoint.' })));
    }
  }

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ms-3">
      <ArrowLeft className="rtl:-scale-x-100" aria-hidden /> {t('detail-back', { defaultValue: 'All endpoints' })}
    </Button>
  );

  if (deliveries.isError && !endpoint) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState
          title={t('detail-error-title', { defaultValue: 'Could not load this endpoint' })}
          description={t('detail-error-body', {
            defaultValue: 'It may have been deleted, or the connection dropped.',
          })}
          action={
            <Button onClick={() => void deliveries.refetch()}>
              <RefreshCw aria-hidden /> {t('console-retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      </div>
    );
  }

  const tabs = DELIVERY_STATUS_FILTERS.map((f) => ({
    id: f,
    label:
      f === 'all'
        ? t('filter-all', { defaultValue: 'All' })
        : f === 'delivered'
          ? t('filter-delivered', { defaultValue: 'Delivered' })
          : f === 'pending'
            ? t('filter-pending', { defaultValue: 'Retrying' })
            : t('filter-failed', { defaultValue: 'Failed' }),
  }));
  const filtered = status !== 'all' || event !== '';

  return (
    <div className="space-y-5">
      {back}

      {!endpoint ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-9 w-full" />
          <span className="sr-only">{t('detail-loading', { defaultValue: 'Loading endpoint' })}</span>
        </div>
      ) : (
        <header className={cn('space-y-3', arrival)}>
          <div className="space-y-1">
            <h2 className="t-heading break-all" dir="ltr">
              {endpoint.url}
            </h2>
            {endpoint.description && <p className="t-body text-site-text-muted">{endpoint.description}</p>}
            <p className="t-meta break-words" dir="ltr">
              {endpoint.events.join(', ')}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <HealthBadge health={endpoint.health} />
              <span className="t-meta">
                {endpoint.lastDeliveryAt
                  ? t('row-last-delivery', {
                      defaultValue: 'Last delivery {{when}}',
                      when: formatWhen(endpoint.lastDeliveryAt),
                    })
                  : t('row-never', { defaultValue: 'Never delivered' })}
              </span>
            </div>
          </div>

          {endpoint.adminDisabled && (
            <div className="space-y-2 border-y border-site-border py-3">
              <p className="t-body font-medium text-site-danger">
                {t('detail-disabled', { defaultValue: 'This endpoint is disabled.' })}
              </p>
              <AdminDisabledLine at={endpoint.adminDisabled.at} reason={endpoint.adminDisabled.reason} />
            </div>
          )}

          {!endpoint.enabled && !endpoint.adminDisabled && (
            <div className="space-y-2 border-y border-site-border py-3">
              <p className="t-body font-medium text-site-danger">
                {t('detail-disabled', { defaultValue: 'This endpoint is disabled.' })}
              </p>
              {endpoint.disabledReason && (
                <p className="t-body break-words" dir="ltr">
                  {t('detail-disabled-error', {
                    defaultValue: 'Last error: {{error}}',
                    error: endpoint.disabledReason,
                  })}
                </p>
              )}
              <p className="t-meta">
                {t('detail-disabled-hint', {
                  defaultValue:
                    'Endpoints switch off after repeated failed deliveries. Enabling it resets the failure count.',
                })}
              </p>
              <p className="t-meta">
                {t('detail-disabled-staff-hint', {
                  defaultValue:
                    'If RMH Studios staff disabled it to secure your account, its secret was replaced. Rotate the secret below to get a new one, then enable the endpoint.',
                })}
              </p>
              <Button loading={setEnabled.isPending} onClick={() => setEnabled.mutate(true)}>
                {t('detail-enable', { defaultValue: 'Enable endpoint' })}
              </Button>
            </div>
          )}

          {endpoint.previousSecretExpiresAt && (
            <p className="t-meta">
              {t('detail-overlap', {
                defaultValue: 'The previous signing secret is still accepted until {{when}}.',
                when: formatWhen(endpoint.previousSecretExpiresAt),
              })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select
              id="webhook-test-event"
              className="w-auto"
              aria-label={t('test-event-label', { ns: 'game-webhooks', defaultValue: 'Test event' })}
              value={testEvent}
              onChange={(e) => setTestEvent(e.target.value as TestEvent)}
            >
              <option value="ping">{t('test-event-ping', { ns: 'game-webhooks', defaultValue: 'ping' })}</option>
              <option value="personal_best.created">
                {t('test-event-pb', { ns: 'game-webhooks', defaultValue: 'personal_best.created' })}
              </option>
              <option value="achievement.unlocked">
                {t('test-event-achievement', { ns: 'game-webhooks', defaultValue: 'achievement.unlocked' })}
              </option>
            </Select>
            <Button loading={sendTest.isPending} onClick={() => sendTest.mutate()}>
              <Send aria-hidden /> {t('detail-test', { defaultValue: 'Send test event' })}
            </Button>
            <Button onClick={() => setEditing(true)}>
              <Pencil aria-hidden /> {t('detail-edit', { defaultValue: 'Edit' })}
            </Button>
            <Button onClick={() => void rotate()}>
              <RotateCw aria-hidden /> {t('detail-rotate', { defaultValue: 'Rotate secret' })}
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              <Trash2 aria-hidden /> {t('detail-delete', { defaultValue: 'Delete' })}
            </Button>
            {endpoint.enabled && (
              <label className="ms-auto flex items-center gap-2 t-body">
                {t('detail-enabled', { defaultValue: 'Enabled' })}
                <Switch
                  checked={endpoint.enabled}
                  disabled={setEnabled.isPending}
                  onCheckedChange={(enabled) => setEnabled.mutate(enabled)}
                  aria-label={t('detail-enabled', { defaultValue: 'Enabled' })}
                />
              </label>
            )}
          </div>
        </header>
      )}

      <section aria-labelledby="deliveries-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="deliveries-heading" className="t-heading">
            {t('deliveries-heading', { defaultValue: 'Deliveries' })}
          </h3>
          <Button
            variant="ghost"
            loading={deliveries.isFetching && !deliveries.isFetchingNextPage}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden /> {t('console-refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>

        <Tabs
          tabs={tabs}
          value={status}
          onChange={(next) => setStatus(next as StatusFilter)}
          aria-label={t('filter-status-label', { defaultValue: 'Filter by status' })}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="webhook-event-filter" className="t-label">
            {t('filter-event', { defaultValue: 'Event' })}
          </label>
          <Select id="webhook-event-filter" value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">{t('filter-event-any', { defaultValue: 'Any event' })}</option>
            {EVENT_FILTERS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        {deliveries.isPending ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            className={arrival}
            title={
              filtered
                ? t('deliveries-none-filtered', { defaultValue: 'No deliveries match these filters' })
                : t('deliveries-none', { defaultValue: 'No deliveries yet' })
            }
            description={
              filtered
                ? undefined
                : t('deliveries-none-body', {
                    defaultValue: 'Send a test event to see how your endpoint responds.',
                  })
            }
          />
        ) : (
          <>
            <ul className={cn('border-t border-site-border', arrival)}>
              {rows.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  redelivering={redeliver.isPending && redeliver.variables?.id === delivery.id}
                  onRedeliver={(d) => redeliver.mutate(d)}
                />
              ))}
            </ul>
            {deliveries.hasNextPage && (
              <Button loading={deliveries.isFetchingNextPage} onClick={() => void deliveries.fetchNextPage()}>
                {t('deliveries-more', { defaultValue: 'Load more' })}
              </Button>
            )}
          </>
        )}
      </section>

      <EndpointFormDialog
        open={editing}
        onOpenChange={setEditing}
        endpoint={endpoint}
        onSaved={() => {
          setEditing(false);
          void refresh();
        }}
      />
      <SecretDialog revealed={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}
