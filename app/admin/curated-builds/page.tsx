import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { PageLayout } from '@/components/feed/PageLayout';
import { ArrowLeft } from 'lucide-react';
import { CuratedBuildsClient } from './CuratedBuildsClient';
import { AdminRightSidebar } from '@/components/feed/AdminRightSidebar';
import { Link, redirect } from '@tanstack/react-router';

export const metadata = {
    title: 'Curated Builds - Admin | RMH Studios',
};

export default async function AdminCuratedBuildsPage() {
    // TODO: Move auth check to TanStack Start loader
    const session = await auth.api.getSession({ headers: new Headers() });

    if (!session || !(session.user as any).isAdmin) {
        throw redirect({ to: '/' });
    }

    const curatedBuilds = await prisma.userBuild.findMany({
        where: {
            isCurated: true,
        },
        orderBy: {
            position: 'asc'
        },
        include: {
            user: { select: { name: true, username: true } },
            category: true
        }
    });

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
