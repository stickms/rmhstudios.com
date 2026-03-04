import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { PageLayout } from '@/components/feed/PageLayout';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CuratedBuildsClient } from './CuratedBuildsClient';
import { AdminRightSidebar } from '@/components/feed/AdminRightSidebar';

export const metadata = {
    title: 'Curated Builds - Admin | RMH Studios',
};

export default async function AdminCuratedBuildsPage() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session || !(session.user as any).isAdmin) {
        redirect('/');
    }

    const curatedBuilds = await prisma.userBuild.findMany({
        where: {
            isCurated: true,
            status: 'PUBLISHED',
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
                    <Link href="/admin" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
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
