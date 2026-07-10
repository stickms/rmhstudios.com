/**
 * RMH Ladder — Alerts (in-app center).
 *
 * Lists delivered alerts newest-first and marks them read on view.
 * Delivery itself (email/Discord/digests) arrives with Plan 5.
 */

import { useEffect, useRef } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listAlerts, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import { markAlertsRead, type ActionsPrisma } from '@/lib/rmhladder/server/actions';
import { timeAgo } from '@/components/rmhladder/time';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma & {
  ladderAlert: { updateMany(args: Record<string, unknown>): Promise<unknown> };
};

type AnyRow = Record<string, unknown>;

const fetchAlerts = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/alerts' } });
  return { alerts: await listAlerts(queriesPrisma, session.user.id) };
});

const doMarkRead = createServerFn({ method: 'POST' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/alerts' } });
  return markAlertsRead(actionsPrisma, session.user.id);
});

export const Route = createFileRoute('/rmhladder/alerts')({
  loader: () => fetchAlerts(),
  component: AlertsPage,
});

const TYPE_LABELS: Record<string, string> = {
  immediate: 'New match',
  daily_digest: 'Daily digest',
  weekly_digest: 'Weekly digest',
  deadline: 'Deadline reminder',
  changed: 'Posting changed',
  expired: 'Posting expired',
  review_needed: 'Review needed',
};

function AlertsPage() {
  const { alerts } = Route.useLoaderData();

  // Mark everything read once on view
  const marked = useRef(false);
  useEffect(() => {
    if (!marked.current && (alerts as AnyRow[]).some((a) => !a.readAt)) {
      marked.current = true;
      void doMarkRead();
    }
  }, [alerts]);

  return (
    <div>
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · ALERTS</p>
        <h1 className="rl-display">Alerts</h1>
      </div>

      {(alerts as AnyRow[]).length === 0 ? (
        <div className="rl-empty-state">
          <p>
            No alerts yet. The worker checks every 6 hours; email and Discord
            delivery arrive with Plan 5.
          </p>
        </div>
      ) : (
        <ul className="rl-review-list">
          {(alerts as AnyRow[]).map((alert) => {
            const job = alert.job as AnyRow | undefined;
            const company = (job?.company as AnyRow | undefined)?.name as string | undefined;
            return (
              <li
                key={alert.id as string}
                className={`rl-review-row rl-hairline${alert.readAt ? '' : ' rl-alert--unread'}`}
              >
                <div className="rl-review-row__main">
                  <span className="rl-eyebrow">
                    {TYPE_LABELS[alert.type as string] ?? (alert.type as string)}
                  </span>
                  <span className="rl-review-row__title">
                    {(job?.title as string) ?? 'Posting'}
                    {company ? ` — ${company}` : ''}
                  </span>
                  <span className="rl-mono rl-review-row__meta">{timeAgo(alert.sentAt as Date)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
