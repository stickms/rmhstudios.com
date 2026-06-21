import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState } from 'react';
import { BarChart3, Loader2, Users, FileText, Flag, Coins } from 'lucide-react';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) throw redirect({ to: '/' });
  return null;
});

export const Route = createFileRoute('/_site/admin/analytics')({
  head: () => ({ meta: [{ title: 'Analytics | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AnalyticsPage,
});

interface Analytics {
  users: { total: number; new7: number; new30: number; active7: number };
  content: { posts: number; posts7: number; comments: number; builds: number };
  moderation: { pendingReports: number };
  economy: { coinsInCirculation: number };
  postsPerDay: { day: string; count: number }[];
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-site-border bg-site-surface p-4">
      <div className="flex items-center gap-2 text-site-text-muted">
        <Icon className="h-4 w-4 text-site-accent" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-site-text">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-site-text-dim">{sub}</p>}
    </div>
  );
}

function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/analytics', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const maxCount = data ? Math.max(1, ...data.postsPerDay.map((d) => d.count)) : 1;

  return (
    <PageLayout title="Analytics" wide>
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-site-accent" />
          <h1 className="font-display text-2xl font-bold text-site-text">Analytics</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
          </div>
        ) : !data ? (
          <p className="text-center text-sm text-site-text-muted">Could not load analytics.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={Users} label="Users" value={data.users.total} sub={`+${data.users.new7} this week`} />
              <Stat icon={Users} label="Active (7d)" value={data.users.active7} sub="posted recently" />
              <Stat icon={FileText} label="Posts" value={data.content.posts} sub={`+${data.content.posts7} this week`} />
              <Stat icon={FileText} label="Comments" value={data.content.comments} />
              <Stat icon={FileText} label="Builds" value={data.content.builds} />
              <Stat icon={Users} label="New (30d)" value={data.users.new30} />
              <Stat icon={Flag} label="Open reports" value={data.moderation.pendingReports} />
              <Stat icon={Coins} label="Coins in circulation" value={data.economy.coinsInCirculation} />
            </div>

            <div className="rounded-xl border border-site-border bg-site-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-site-text">Posts per day (14 days)</h2>
              <div className="flex h-40 items-end gap-1">
                {data.postsPerDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                    <div
                      className="w-full rounded-t bg-site-accent"
                      style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }}
                    />
                    <span className="text-[9px] text-site-text-dim">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
