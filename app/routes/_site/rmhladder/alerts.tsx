import { Bell, CheckCheck } from 'lucide-react';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listAlerts, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import { markAlertsRead, type ActionsPrisma } from '@/lib/rmhladder/server/actions';
import { timeAgo } from '@/components/rmhladder/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma & {
  ladderAlertEvent: { updateMany(args: Record<string, unknown>): Promise<unknown> };
};
type AnyRow = Record<string, unknown>;

const fetchAlerts = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/alerts' } });
  return { alerts: await listAlerts(queriesPrisma, session.user.id) };
});

const markReadSchema = z.object({ alertId: z.string().min(1).max(200).optional() });
const doMarkRead = createServerFn({ method: 'POST' })
  .validator((input: unknown) => markReadSchema.parse(input))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/alerts' } });
    return markAlertsRead(actionsPrisma, session.user.id, data.alertId);
  });

export const Route = createFileRoute('/_site/rmhladder/alerts')({
  loader: () => fetchAlerts(),
  component: AlertsPage,
});

const TYPE_LABELS: Record<string, string> = {
  immediate: 'New match', daily_digest: 'Daily digest', weekly_digest: 'Weekly digest',
  deadline: 'Deadline reminder', changed: 'Posting changed', expired: 'Posting expired',
  review_needed: 'Review needed', saved_search: 'Saved search', follow_up: 'Follow-up due',
  interview: 'Interview reminder',
};

function AlertsPage() {
  const { t } = useTranslation('site');
  const { alerts } = Route.useLoaderData();
  const router = useRouter();
  const rows = alerts as AnyRow[];
  const unread = rows.filter((alert) => !alert.readAt).length;

  async function markAllRead() {
    await doMarkRead({ data: {} });
    await router.invalidate();
  }

  return (
    <div className="space-y-4">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void markAllRead()}>
            <CheckCheck aria-hidden />
            {t('ladder.markAllRead', { defaultValue: 'Mark all as read' })}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t('ladder.noAlerts', { defaultValue: 'No alerts yet' })}
          description={t('ladder.noAlertsDescription', { defaultValue: 'New matches and application reminders will appear here.' })}
        />
      ) : (
        <ul className="divide-y divide-site-border overflow-hidden rounded-site border border-site-border bg-site-surface">
          {rows.map((alert) => {
            const job = alert.job as AnyRow | undefined;
            const payload = (alert.payload as AnyRow | undefined) ?? {};
            const company = (job?.company as AnyRow | undefined)?.name as string | undefined;
            const title = (job?.title as string | undefined) ?? (payload.title as string | undefined) ?? 'RMH Ladder update';
            const alertText = typeof payload.text === 'string' ? payload.text : null;
            const payloadLink = typeof payload.link === 'string' && payload.link.startsWith('/rmhladder/')
              ? payload.link
              : null;
            const content = (
              <>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alert.readAt ? 'outline' : 'accent'} size="sm">
                      {TYPE_LABELS[alert.type as string] ?? (alert.type as string)}
                    </Badge>
                    {!alert.readAt && <span className="sr-only">{t('ladder.unread', { defaultValue: 'Unread' })}</span>}
                  </div>
                  <span className="font-semibold text-site-text">{title}{company ? ` — ${company}` : ''}</span>
                  {alertText && <span className="text-sm text-site-text-muted">{alertText}</span>}
                  <span className="text-xs text-site-text-dim">{timeAgo(alert.createdAt as Date)}</span>
                </div>
              </>
            );
            return (
              <li key={alert.id as string} className={alert.readAt ? '' : 'bg-site-accent-dim'}>
                {alert.jobId ? (
                  <Link
                    to="/rmhladder/jobs/$jobId"
                    params={{ jobId: alert.jobId as string }}
                    className="flex min-h-24 items-start gap-3 p-4 transition-colors hover:bg-site-surface-hover"
                    onClick={() => void doMarkRead({ data: { alertId: alert.id as string } })}
                  >
                    {content}
                  </Link>
                ) : payloadLink ? (
                  <a
                    href={payloadLink}
                    className="flex min-h-24 items-start gap-3 p-4 transition-colors hover:bg-site-surface-hover"
                    onClick={() => void doMarkRead({ data: { alertId: alert.id as string } })}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="flex min-h-24 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-site-surface-hover"
                    onClick={async () => {
                      await doMarkRead({ data: { alertId: alert.id as string } });
                      await router.invalidate();
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
