/**
 * Admin Curated Builds Route
 */

import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageLayout } from '@/components/feed/PageLayout';
import { ArrowLeft } from 'lucide-react';
import { CuratedBuildsClient } from '@/app/admin/curated-builds/CuratedBuildsClient';
import { AdminRightSidebar } from '@/components/feed/AdminRightSidebar';

const fetchCuratedBuilds = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }

  const curatedBuilds = await prisma.userBuild.findMany({
    where: { isCurated: true },
    orderBy: { position: 'asc' },
    include: {
      user: { select: { name: true, username: true } },
      category: true,
    },
  });

  return { curatedBuilds };
});

export const Route = createFileRoute('/admin/curated-builds/')({
  head: () => ({
    meta: [{ title: 'Curated Builds - Admin | RMH Studios' }],
  }),
  loader: () => fetchCuratedBuilds(),
  component: AdminCuratedBuildsPage,
});

function AdminCuratedBuildsPage() {
  const { curatedBuilds } = Route.useLoaderData();

  return (
    <PageLayout title="Manage Curated Builds" wide rightSidebar={<AdminRightSidebar />}>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text-dim" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-site-text">Curated Builds</h1>
            <p className="text-site-text-muted mt-1">Manage the order and visibility of official builds.</p>
          </div>
        </div>

        <CuratedBuildsClient initialBuilds={curatedBuilds} />
      </div>
    </PageLayout>
  );
}
