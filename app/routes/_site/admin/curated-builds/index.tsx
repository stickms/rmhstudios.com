/**
 * Admin Official Builds Route
 */

import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageLayout } from '@/components/feed/PageLayout';
import { ArrowLeft, Edit, ExternalLink } from 'lucide-react';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

const fetchOfficialBuilds = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }

  const allSlugs = [...games.map(g => g.id), ...apps.filter(a => !a.hidden).map(a => a.id)];

  const dbBuilds = await prisma.userBuild.findMany({
    where: { slug: { in: allSlugs } },
    select: {
      id: true,
      slug: true,
      likeCount: true,
      commentCount: true,
      viewCount: true,
      visibility: true,
    },
  });

  const dbMap = new Map(dbBuilds.map(b => [b.slug, b]));

  const officialBuilds = [
    ...games.map(g => ({ ...g, type: 'game' as const })),
    ...apps.filter(a => !a.hidden).map(a => ({ ...a, type: 'app' as const })),
  ].map(b => {
    const db = dbMap.get(b.id);
    return {
      codeId: b.id,
      dbId: db?.id ?? null,
      title: b.title,
      type: b.type,
      status: b.status,
      href: b.href,
      likeCount: db?.likeCount ?? 0,
      commentCount: db?.commentCount ?? 0,
      viewCount: db?.viewCount ?? 0,
      visibility: db?.visibility ?? 'PUBLIC',
      hasBuildPage: !!db,
    };
  });

  return { officialBuilds };
});

export const Route = createFileRoute('/_site/admin/curated-builds/')({
  head: () => ({
    meta: [{ title: 'Official Builds - Admin | RMH Studios' }],
  }),
  loader: () => fetchOfficialBuilds(),
  component: AdminOfficialBuildsPage,
});

function AdminOfficialBuildsPage() {
  const { officialBuilds } = Route.useLoaderData();

  return (
    <PageLayout title="Official Builds" wide>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text-dim" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-site-text">Official Builds</h1>
            <p className="text-site-text-muted mt-1">
              Official builds are defined in code (<code className="text-xs bg-site-bg px-1 py-0.5 rounded">lib/games.ts</code> and <code className="text-xs bg-site-bg px-1 py-0.5 rounded">lib/apps.ts</code>). Edit build detail pages below.
            </p>
          </div>
        </div>

        <div className="bg-site-surface border border-site-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-site-border bg-site-bg/50">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs font-semibold text-site-text-dim uppercase tracking-wider">
              <div>Build</div>
              <div className="w-20 text-center">Type</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-24 text-right">Actions</div>
            </div>
          </div>

          <div className="divide-y divide-site-border">
            {officialBuilds.map((build) => (
              <div key={build.codeId} className="p-4 flex items-center gap-4 hover:bg-site-surface-hover transition-colors">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-site-text truncate">{build.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-site-text-dim mt-0.5">
                    <span>{build.likeCount} likes</span>
                    <span>{build.commentCount} comments</span>
                    <span>{build.viewCount} views</span>
                  </div>
                </div>

                <div className="w-20 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    build.type === 'game'
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    {build.type === 'game' ? 'Game' : 'App'}
                  </span>
                </div>

                <div className="w-24 text-center">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-site-accent-dim text-site-accent">
                    {build.status}
                  </span>
                </div>

                <div className="w-24 flex justify-end gap-1">
                  {build.dbId && (
                    <Link
                      to={`/admin/curated-builds/${build.dbId}/edit` as string}
                      className="p-2 text-site-text-muted hover:text-site-accent hover:bg-site-surface transition-colors rounded-lg"
                      title="Edit Build Page"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                  )}
                  <a
                    href={build.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-site-text-muted hover:text-site-accent hover:bg-site-surface transition-colors rounded-lg"
                    title="View Live"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}

            {officialBuilds.length === 0 && (
              <div className="p-8 text-center text-site-text-muted">
                No official builds found. Add games to <code>lib/games.ts</code> or apps to <code>lib/apps.ts</code>.
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
