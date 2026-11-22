import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { webhooksQuery } from '@/lib/developer/developer.queries';
import { updateWebhookApi, type WebhookEndpointRow } from '@/lib/developer/webhooks.contract';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { WebhookDetail } from './WebhookDetail';
import { EndpointFormDialog, type EndpointSaved } from './webhooks/EndpointFormDialog';
import { failureText, formatWhen } from './webhooks/format';
import { SecretDialog, type RevealedSecret } from './webhooks/SecretDialog';
import { HealthBadge } from './webhooks/StatusBadges';

/** The webhooks console: the member's endpoints, and the detail view of the one they open. */
export function WebhooksConsole() {
  const { t } = useTranslation('dev-webhooks');
  const queryClient = useQueryClient();
  const query = webhooksQuery();
  const { data, isPending, isError, isFetching, refetch } = useQuery(query);
  const arrival = useArrival(!isPending);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(updateWebhookApi, { params: { id }, body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['developer', 'webhooks'] }),
    onError: (err) =>
      toast.error(failureText(err, t('console-toggle-failed', { defaultValue: 'Could not change the endpoint.' }))),
  });

  function created(saved: EndpointSaved) {
    setCreating(false);
    void queryClient.invalidateQueries({ queryKey: ['developer', 'webhooks'] });
    if (saved.secret) setRevealed({ secret: saved.secret, reason: 'created' });
  }

  if (openId) return <WebhookDetail id={openId} onBack={() => setOpenId(null)} />;

  const endpoints = data?.endpoints ?? [];
  const max = data?.max ?? 10;
  const full = endpoints.length >= max;

  return (
    <section aria-labelledby="webhooks-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="webhooks-heading" className="t-heading">
            {t('console-heading', { defaultValue: 'Endpoints' })}
          </h2>
          {data && (
            <p className="t-meta">
              {t('console-count', {
                defaultValue: '{{n}} of {{max}} endpoints',
                n: endpoints.length,
                max,
              })}
            </p>
          )}
        </div>
        {endpoints.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" loading={isFetching} onClick={() => void refetch()}>
              <RefreshCw aria-hidden /> {t('console-refresh', { defaultValue: 'Refresh' })}
            </Button>
            <Button variant="primary" disabled={full} onClick={() => setCreating(true)}>
              <Plus aria-hidden /> {t('console-create', { defaultValue: 'Create endpoint' })}
            </Button>
          </div>
        )}
      </div>

      {isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
          <span className="sr-only">{t('console-loading', { defaultValue: 'Loading endpoints' })}</span>
        </div>
      ) : isError ? (
        <EmptyState
          title={t('console-error-title', { defaultValue: 'Could not load your endpoints' })}
          description={t('console-error-body', { defaultValue: 'Check your connection and try again.' })}
          action={
            <Button onClick={() => void refetch()}>
              <RefreshCw aria-hidden /> {t('console-retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : endpoints.length === 0 ? (
        <EmptyState
          className={arrival}
          icon={Webhook}
          title={t('console-empty-title', { defaultValue: 'No webhook endpoints yet' })}
          description={t('console-empty-body', {
            defaultValue: 'Register a URL and we will send it a signed POST when something happens on your account.',
          })}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> {t('console-create', { defaultValue: 'Create endpoint' })}
            </Button>
          }
        />
      ) : (
        <ul className={cn('border-t border-site-border', arrival)}>
          {endpoints.map((endpoint) => (
            <EndpointListRow
              key={endpoint.id}
              endpoint={endpoint}
              toggling={toggle.isPending && toggle.variables?.id === endpoint.id}
              onOpen={() => setOpenId(endpoint.id)}
              onToggle={(enabled) => toggle.mutate({ id: endpoint.id, enabled })}
            />
          ))}
        </ul>
      )}

      <EndpointFormDialog open={creating} onOpenChange={setCreating} onSaved={created} />
      <SecretDialog revealed={revealed} onClose={() => setRevealed(null)} />
    </section>
  );
}

function EndpointListRow({
  endpoint,
  toggling,
  onOpen,
  onToggle,
}: {
  endpoint: WebhookEndpointRow;
  toggling: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useTranslation('dev-webhooks');
  return (
    <li className="flex items-start gap-3 border-b border-site-border py-3">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 space-y-1 text-start">
        <span className="t-body block break-all font-medium" dir="ltr">
          {endpoint.url}
        </span>
        {endpoint.description && <span className="t-meta block">{endpoint.description}</span>}
        <span className="t-meta block break-words" dir="ltr">
          {endpoint.events.join(', ')}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <HealthBadge health={endpoint.health} />
          {endpoint.failureCount > 0 && (
            <span className="t-meta">
              {t('row-failures', {
                defaultValue: 'Failures in a row: {{n}}',
                n: endpoint.failureCount,
              })}
            </span>
          )}
          <span className="t-meta">
            {endpoint.lastDeliveryAt
              ? t('row-last-delivery', {
                  defaultValue: 'Last delivery {{when}}',
                  when: formatWhen(endpoint.lastDeliveryAt),
                })
              : t('row-never', { defaultValue: 'Never delivered' })}
          </span>
        </span>
        {!endpoint.enabled && (
          <span className="t-meta block text-site-danger">
            {endpoint.disabledReason
              ? t('row-disabled-reason', {
                  defaultValue: 'Disabled. Last error: {{error}}',
                  error: endpoint.disabledReason,
                })
              : t('row-disabled', { defaultValue: 'Disabled' })}
          </span>
        )}
      </button>
      <Switch
        checked={endpoint.enabled}
        disabled={toggling}
        onCheckedChange={onToggle}
        aria-label={t('row-enabled', { defaultValue: 'Enabled: {{url}}', url: endpoint.url })}
        className="mt-1"
      />
    </li>
  );
}
