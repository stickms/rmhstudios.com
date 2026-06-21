import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Flag, ExternalLink } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/reports')({
  head: () => ({ meta: [{ title: 'Moderation Queue | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminReportsPage,
});

type Status = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

interface ReportUser {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}
interface Report {
  id: string;
  reason: string;
  details: string | null;
  entityType: string;
  entityId: string;
  status: Status;
  createdAt: string;
  reporter: ReportUser;
  targetUser: ReportUser | null;
}

const STATUS_TABS: Status[] = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'];

function entityLink(r: Report): string | null {
  if (r.entityType === 'rmhark' && r.targetUser?.handle) return `/u/${r.targetUser.handle}/post/${r.entityId}`;
  if (r.entityType === 'user' && r.targetUser?.handle) return `/u/${r.targetUser.handle}`;
  if (r.entityType === 'build') return `/user-builds/${r.entityId}`;
  return null;
}

function AdminReportsPage() {
  const [status, setStatus] = useState<Status>('PENDING');
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (s: Status) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${s}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReports(data.items);
        setCounts(data.counts ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  const act = async (id: string, action: 'review' | 'resolve' | 'dismiss', deleteContent = false) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, deleteContent }),
      });
      if (res.ok) {
        // Remove from the current view when it leaves this status bucket.
        setReports((prev) => prev.filter((r) => r.id !== id));
        load(status);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageLayout title="Moderation Queue" wide>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Flag className="h-6 w-6 text-site-accent" />
          <div>
            <h1 className="text-2xl font-bold font-display text-site-text">Moderation Queue</h1>
            <p className="text-site-text-muted mt-1 text-sm">Review and resolve user reports.</p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                status === s
                  ? 'bg-site-accent text-white'
                  : 'bg-site-surface text-site-text-muted hover:text-site-text border border-site-border'
              }`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
              {counts[s] ? <span className="ml-1.5 opacity-80">{counts[s]}</span> : null}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-site-border bg-site-surface p-10 text-center text-site-text-muted">
            Nothing here. The queue is clear.
          </div>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => {
              const link = entityLink(r);
              return (
                <li key={r.id} className="rounded-xl border border-site-border bg-site-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-site-danger/15 px-2 py-0.5 text-xs font-semibold text-site-danger">
                      {r.reason.replace('_', ' ')}
                    </span>
                    <span className="rounded-md bg-site-bg px-2 py-0.5 text-xs text-site-text-muted border border-site-border">
                      {r.entityType}
                    </span>
                    <span className="text-xs text-site-text-dim">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </span>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs text-site-accent hover:underline"
                      >
                        View content <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {r.details && <p className="mt-2 text-sm text-site-text">{r.details}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-site-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <UserAvatar src={r.reporter.image} alt={r.reporter.name || 'Reporter'} size={20} fallbackName={r.reporter.name || 'R'} />
                      reported by <strong className="text-site-text">{r.reporter.name || r.reporter.handle}</strong>
                    </span>
                    {r.targetUser && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserAvatar src={r.targetUser.image} alt={r.targetUser.name || 'User'} size={20} fallbackName={r.targetUser.name || 'U'} />
                        against <strong className="text-site-text">{r.targetUser.name || r.targetUser.handle}</strong>
                      </span>
                    )}
                  </div>

                  {(status === 'PENDING' || status === 'REVIEWING') && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {status === 'PENDING' && (
                        <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => act(r.id, 'review')}>
                          Mark reviewing
                        </Button>
                      )}
                      <Button size="sm" variant="accent" disabled={busyId === r.id} onClick={() => act(r.id, 'resolve')}>
                        Resolve
                      </Button>
                      {(r.entityType === 'rmhark' || r.entityType === 'comment') && (
                        <Button size="sm" variant="destructive" disabled={busyId === r.id} onClick={() => act(r.id, 'resolve', true)}>
                          Resolve &amp; remove content
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => act(r.id, 'dismiss')}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
