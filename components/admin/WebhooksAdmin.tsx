import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { getAdminWebhookApi, listAdminWebhooksApi, patchAdminWebhookApi } from '@/lib/admin/webhooks.contract';
import {
  DISABLE_REASON_MAX,
  DISABLE_REASON_MIN,
  type AdminWebhookRow,
  type WebhookFilter,
  type WebhookStatus,
} from '@/lib/admin/webhooks';

/**
 * /admin/webhooks: endpoints on rules, newest first, with the filter tabs, the owner and host search, the 24-hour
 * figures in `t-meta`, the turn-off and lift actions and each endpoint's last 50 deliveries. A row carries the
 * redacted URL only (scheme, host, first path segment); no secret, payload or signature is ever in it.
 */
export function WebhooksAdmin({
  filter,
  onFilterChange,
}: {
  filter: WebhookFilter;
  onFilterChange: (next: WebhookFilter) => void;
}) {
  const { t } = useTranslation('admin-webhooks');
  const refusalText = useRefusalText();
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const [ownerText, setOwnerText] = useState('');
  const [owner, setOwner] = useState('');
  const [hostText, setHostText] = useState('');
  const [host, setHost] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const filters = {
    ...(filter === 'all' ? {} : { filter }),
    ...(owner ? { owner } : {}),
    ...(host ? { host } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: [listAdminWebhooksApi.path, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listAdminWebhooksApi, { query: { ...filters, ...(pageParam ? { cursor: pageParam } : {}) }, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.webhooks) ?? [];
  const arrival = useArrival(!list.isPending);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const o = ownerText.trim();
    const h = hostText.trim().toLowerCase();
    if (o.includes('@') && !o.startsWith('@')) {
      setInputError(t('owner-not-email', { defaultValue: 'Enter a handle, not an e-mail address.' }));
      return;
    }
    if (o.length > 0 && !/^@?[A-Za-z0-9_.-]{1,40}$/.test(o)) {
      setInputError(
        t('owner-invalid', { defaultValue: 'A handle has letters, digits, dots, dashes and underscores.' }),
      );
      return;
    }
    if (h.length > 0 && !/^[^\s/?#@:]{1,253}$/.test(h)) {
      setInputError(t('host-invalid', { defaultValue: 'Enter a host such as hooks.example.com, with no path.' }));
      return;
    }
    setInputError(null);
    setOwner(o);
    setHost(h);
  };

  const change = async (row: AdminWebhookRow, disable: { reason: string } | null, done: string) => {
    setBusy(row.id);
    try {
      await api(patchAdminWebhookApi, { params: { id: row.id }, body: { disable } });
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: [listAdminWebhooksApi.path] });
      await queryClient.invalidateQueries({ queryKey: [getAdminWebhookApi.path] });
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('change-failed', { defaultValue: 'That change did not save. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async (row: AdminWebhookRow) => {
    const reason = await prompt({
      title: t('disable-title', { defaultValue: 'Turn off this webhook' }),
      label: t('disable-label', { defaultValue: 'Reason (the owner can read it)' }),
      confirmLabel: t('disable-confirm', { defaultValue: 'Turn off' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      validate: (v) => {
        const n = v.trim().length;
        return n < DISABLE_REASON_MIN || n > DISABLE_REASON_MAX
          ? t('disable-reason-length', {
              defaultValue: 'The reason is {{min}} to {{max}} characters.',
              min: DISABLE_REASON_MIN,
              max: DISABLE_REASON_MAX,
            })
          : null;
      },
    });
    if (reason === null) return;
    await change(row, { reason: reason.trim() }, t('disabled-toast', { defaultValue: 'Webhook turned off.' }));
  };

  const lift = async (row: AdminWebhookRow) => {
    const ok = await confirm({
      title: t('lift-title', { defaultValue: 'Lift the admin block?' }),
      description: t('lift-description', {
        defaultValue: 'The webhook stays off until its owner turns it on again.',
      }),
      confirmLabel: t('lift-confirm', { defaultValue: 'Lift block' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
    });
    if (!ok) return;
    await change(row, null, t('lifted-toast', { defaultValue: 'Block lifted. The webhook is still off.' }));
  };

  const tabs = [
    { id: 'failing', label: t('filter-failing', { defaultValue: 'Failing' }) },
    { id: 'auto_disabled', label: t('filter-auto-disabled', { defaultValue: 'Auto-disabled' }) },
    { id: 'admin_disabled', label: t('filter-admin-disabled', { defaultValue: 'Disabled by admin' }) },
    { id: 'all', label: t('filter-all', { defaultValue: 'All' }) },
  ];
  const statusLabel = (s: WebhookStatus): string => {
    switch (s) {
      case 'active':
        return t('status-active', { defaultValue: 'Active' });
      case 'failing':
        return t('status-failing', { defaultValue: 'Failing' });
      case 'disabled':
        return t('status-disabled', { defaultValue: 'Off (by owner)' });
      case 'auto_disabled':
        return t('status-auto-disabled', { defaultValue: 'Auto-disabled' });
      case 'admin_disabled':
        return t('status-admin-disabled', { defaultValue: 'Disabled by admin' });
    }
  };
  const pct = (n: number) => fmt.number(n, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={filter}
        onChange={(id) => onFilterChange(id as WebhookFilter)}
        aria-label={t('filter-label', { defaultValue: 'Filter webhooks' })}
      />
      <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2" role="search">
        <SearchField
          value={ownerText}
          onValueChange={(v) => {
            setOwnerText(v);
            setInputError(null);
            if (v.trim() === '') setOwner('');
          }}
          placeholder={t('owner-placeholder', { defaultValue: 'Owner handle' })}
          aria-label={t('owner-label', { defaultValue: 'Filter by owner handle' })}
          containerClassName="min-w-0 flex-1 sm:max-w-xs"
          maxLength={41}
        />
        <SearchField
          value={hostText}
          onValueChange={(v) => {
            setHostText(v);
            setInputError(null);
            if (v.trim() === '') setHost('');
          }}
          placeholder={t('host-placeholder', { defaultValue: 'Destination host' })}
          aria-label={t('host-label', { defaultValue: 'Filter by destination host' })}
          containerClassName="min-w-0 flex-1 sm:max-w-xs"
          maxLength={253}
        />
        <Button type="submit" variant="default">
          {t('search-apply', { defaultValue: 'Filter' })}
        </Button>
      </form>
      {inputError ? (
        <p role="alert" className="t-meta text-site-danger">
          {inputError}
        </p>
      ) : null}

      {list.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('loading', { defaultValue: 'Loading webhooks' })}>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <div role="alert" className="space-y-3 border-b border-site-border py-4">
          <p className="t-body text-site-danger">{t('load-failed', { defaultValue: 'The webhooks did not load.' })}</p>
          <Button variant="default" onClick={() => void list.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No webhooks match' })}
          description={t('empty-description', { defaultValue: 'Change a filter to see more webhooks.' })}
        />
      ) : (
        <div className={arrival}>
          <ul className="divide-y divide-site-border border-y border-site-border">
            {rows.map((row) => {
              const working = busy === row.id;
              const f = row.figures;
              return (
                <li key={row.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="t-heading min-w-0 break-all text-site-text" dir="ltr">
                      {row.url}
                    </span>
                    <span
                      className={row.status === 'active' ? 't-meta text-site-text-muted' : 't-meta text-site-danger'}
                    >
                      {statusLabel(row.status)}
                    </span>
                    <span className="t-meta text-site-text-muted">
                      {row.owner.handle ? (
                        <bdi>@{row.owner.handle}</bdi>
                      ) : (
                        t('owner-unknown', { defaultValue: 'No handle' })
                      )}
                    </span>
                  </div>
                  <p className="t-meta break-words text-site-text-muted" dir="ltr">
                    {row.events.join(', ')}
                  </p>
                  <p className="t-meta break-words text-site-text">
                    {t('row-failures', { defaultValue: 'Failures in a row: {{n}}', n: row.failureCount })} ·{' '}
                    {row.lastDeliveryAt
                      ? t('row-last-delivery', {
                          defaultValue: 'last delivery {{date}}',
                          date: fmt.dateTime(row.lastDeliveryAt),
                        })
                      : t('row-never-delivered', { defaultValue: 'never delivered' })}{' '}
                    ·{' '}
                    {t('row-24h', {
                      defaultValue: 'Deliveries in 24 hours: {{n}}',
                      n: f.deliveries,
                    })}{' '}
                    ·{' '}
                    {f.failureRate === null
                      ? t('row-rate-none', { defaultValue: 'no failure rate' })
                      : t('row-rate', { defaultValue: '{{rate}} failed', rate: pct(f.failureRate) })}{' '}
                    ·{' '}
                    {f.medianMs === null
                      ? t('row-median-none', { defaultValue: 'no median time' })
                      : t('row-median', { defaultValue: 'median {{ms}} ms', ms: fmt.number(f.medianMs) })}
                  </p>
                  {row.adminDisabledAt ? (
                    <p className="t-meta break-words text-site-text-muted" dir="auto">
                      {t('row-admin-note', {
                        defaultValue: 'Turned off {{date}}: {{reason}}',
                        date: fmt.date(row.adminDisabledAt),
                        reason: row.adminDisabledReason ?? '',
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {row.status === 'admin_disabled' ? (
                      <Button variant="default" disabled={working} onClick={() => void lift(row)}>
                        {t('lift', { defaultValue: 'Lift block' })}
                      </Button>
                    ) : (
                      <Button variant="default" disabled={working} onClick={() => void turnOff(row)}>
                        {t('turn-off', { defaultValue: 'Turn off' })}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      aria-expanded={open === row.id}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                    >
                      {open === row.id
                        ? t('hide-deliveries', { defaultValue: 'Hide deliveries' })
                        : t('show-deliveries', { defaultValue: 'Recent deliveries' })}
                    </Button>
                  </div>
                  {open === row.id ? <Deliveries id={row.id} /> : null}
                </li>
              );
            })}
          </ul>
          {list.hasNextPage ? (
            <div className="pt-4">
              <Button variant="default" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {t('show-more', { defaultValue: 'Show more' })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The last 50 deliveries of one endpoint: event, status, response status, duration and redacted error text. */
function Deliveries({ id }: { id: string }) {
  const { t } = useTranslation('admin-webhooks');
  const fmt = useLocaleFormat();
  const detail = useQuery({
    queryKey: [getAdminWebhookApi.path, id],
    queryFn: ({ signal }) => api(getAdminWebhookApi, { params: { id }, signal }),
  });
  const arrival = useArrival(!detail.isPending);
  if (detail.isPending)
    return (
      <Skeleton className="h-12 w-full" aria-label={t('deliveries-loading', { defaultValue: 'Loading deliveries' })} />
    );
  if (detail.isError)
    return (
      <p role="alert" className="t-meta text-site-danger">
        {t('deliveries-failed', { defaultValue: 'The deliveries did not load.' })}
      </p>
    );
  const rows = detail.data.deliveries;
  if (rows.length === 0)
    return (
      <p className="t-meta text-site-text-muted">{t('deliveries-empty', { defaultValue: 'No deliveries yet.' })}</p>
    );
  return (
    <ul className={`divide-y divide-site-border border-t border-site-border ${arrival}`}>
      {rows.map((d) => (
        <li key={d.id} className="py-2">
          <p className="t-meta break-words text-site-text">
            <span dir="ltr">{d.event}</span> · {fmt.dateTime(d.createdAt)} ·{' '}
            {d.status === 'DELIVERED'
              ? t('delivery-delivered', { defaultValue: 'Delivered' })
              : d.status === 'FAILED'
                ? t('delivery-failed', { defaultValue: 'Failed' })
                : t('delivery-pending', { defaultValue: 'Pending' })}{' '}
            ·{' '}
            {d.responseStatus === null
              ? t('delivery-no-response', { defaultValue: 'no response' })
              : t('delivery-response', { defaultValue: 'HTTP {{status}}', status: d.responseStatus })}{' '}
            ·{' '}
            {d.durationMs === null
              ? t('delivery-no-duration', { defaultValue: 'no time' })
              : t('delivery-duration', { defaultValue: '{{ms}} ms', ms: fmt.number(d.durationMs) })}
          </p>
          {d.error ? (
            <p className="t-meta break-words text-site-text-muted" dir="auto">
              {d.error}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
