import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { serverError } from '@/lib/http';
import { api } from '@/lib/contract/client';
import {
  adminEmailCampaigns,
  adminEmailResume,
  type EmailCampaignRow,
} from '@/lib/admin/email.contract';
import { cn } from '@/lib/utils';
import { categoryName } from '@/components/admin/email/labels';

function statusBadge(t: TFunction, status: EmailCampaignRow['status']) {
  switch (status) {
    case 'sending':
      return <Badge variant="warning">{t('email-status-sending', { defaultValue: 'Sending' })}</Badge>;
    case 'sent':
      return <Badge variant="success">{t('email-status-sent', { defaultValue: 'Sent' })}</Badge>;
    case 'failed':
      return <Badge variant="danger">{t('email-status-failed', { defaultValue: 'Failed' })}</Badge>;
  }
}

/** Recent sends with their progress. Refreshes every few seconds while one is sending. */
export function CampaignHistory({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation('admin');
  const [rows, setRows] = useState<EmailCampaignRow[] | null>(null);
  const arrival = useArrival(rows !== null);

  const load = useCallback(() => {
    api(adminEmailCampaigns)
      .then((r) => setRows(r.campaigns))
      .catch(() => setRows((prev) => prev ?? []));
  }, []);

  useEffect(load, [load, refreshKey]);

  const sending = rows?.some((r) => r.status === 'sending') ?? false;
  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [sending, rows, load]);

  async function resume(row: EmailCampaignRow) {
    try {
      await api(adminEmailResume, { params: { id: row.id } });
      toast.success(t('email-resumed', { defaultValue: 'Sending resumed' }));
      load();
    } catch (e) {
      toast.error(serverError(e) || t('email-resume-failed', { defaultValue: 'Could not resume' }));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="t-heading text-site-text">
        {t('email-history', { defaultValue: 'Sent emails' })}
      </h2>
      {rows === null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className={arrival}
          description={t('email-history-empty', { defaultValue: 'No emails sent yet.' })}
        />
      ) : (
        <ul className={cn('divide-y divide-site-border border-t border-site-border', arrival)}>
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1 basis-64 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(t, r.status)}
                  <Badge>{categoryName(t, r.category)}</Badge>
                </div>
                <p className="t-body break-words text-site-text">{r.subject}</p>
                {r.duplicates > 0 || r.throttled > 0 ? (
                  <p className="t-meta">
                    {t('email-history-skips', {
                      duplicates: r.duplicates,
                      throttled: r.throttled,
                      defaultValue:
                        'Skipped: {{duplicates}} already had it · {{throttled}} emailed too recently',
                    })}
                  </p>
                ) : null}
                <p className="t-meta">
                  {t('email-history-counts', {
                    sent: r.sent,
                    total: r.total,
                    failed: r.failed,
                    skipped: r.skipped,
                    defaultValue:
                      '{{sent}} of {{total}} sent · {{failed}} failed · {{skipped}} skipped',
                  })}
                </p>
                <p className="t-meta">
                  {new Date(r.createdAt).toLocaleString()}
                  {r.author ? ` · ${r.author}` : ''}
                </p>
              </div>
              {r.canResume ? (
                <Button
                  size="sm"
                  onClick={() => resume(r)}
                >
                  {t('email-resume', { defaultValue: 'Resume' })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
