'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { ApplicationTimeline } from '@/components/rmh-jobs/ApplicationTimeline';

export default function ApplicationsPage() {
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession();
    const [applications, setApplications] = useState<unknown[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isPending) return;
        if (!session?.user) {
            router.push('/login');
            return;
        }

        fetch('/api/rmh-jobs/applications')
            .then((r) => (r.ok ? r.json() : { applications: [] }))
            .then((data) => {
                setApplications(data.applications);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [session, isPending, router]);

    if (isPending || (!session?.user && !isPending)) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--jobs-accent)' }} />
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            {/* Top bar */}
            <header
                className="sticky top-0 z-30 border-b backdrop-blur-md"
                style={{ background: 'rgba(10, 10, 15, 0.85)', borderColor: 'var(--jobs-border)' }}
            >
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <Link
                        href="/rmh-jobs"
                        className="flex items-center gap-1.5 text-sm hover:text-(--jobs-accent) transition-colors"
                        style={{ color: 'var(--jobs-text-muted)' }}
                    >
                        <ArrowLeft size={14} />
                        Back to jobs
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-8">
                <div className="flex items-center gap-2.5 mb-6">
                    <ClipboardList size={20} style={{ color: 'var(--jobs-accent)' }} />
                    <h1 className="text-xl font-bold">My Applications</h1>
                    {!loading && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--jobs-surface-2)', color: 'var(--jobs-text-muted)' }}>
                            {applications.length}
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--jobs-accent)' }} />
                    </div>
                ) : (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <ApplicationTimeline applications={applications as any} />
                )}
            </main>
        </div>
    );
}
