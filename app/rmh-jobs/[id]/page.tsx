'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Building2,
    MapPin,
    Banknote,
    Clock,
    Send,
    Loader2,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

interface Job {
    id: string;
    title: string;
    company: string;
    description: string;
    type: string;
    location: string;
    salaryRange: string | null;
    publishAt: string;
    createdAt: string;
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState<{ status: string; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data: session } = authClient.useSession();

    useEffect(() => {
        fetch(`/api/rmh-jobs/jobs/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                setJob(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [id]);

    const handleApply = async () => {
        if (!session?.user) {
            router.push('/login');
            return;
        }

        setApplying(true);
        setError(null);

        try {
            const res = await fetch('/api/rmh-jobs/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId: id }),
            });

            const data = await res.json();

            if (res.ok) {
                setApplied({ status: data.status, message: data.message });
            } else {
                setError(data.error ?? 'Failed to apply');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setApplying(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--jobs-accent)' }} />
            </div>
        );
    }

    if (!job) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-lg" style={{ color: 'var(--jobs-text-muted)' }}>Job not found</p>
                <Link href="/rmh-jobs" className="text-sm" style={{ color: 'var(--jobs-accent)' }}>
                    ← Back to job board
                </Link>
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
                <div className="max-w-3xl mx-auto px-4 py-3">
                    <Link
                        href="/rmh-jobs"
                        className="flex items-center gap-1.5 text-sm hover:text-[var(--jobs-accent)] transition-colors"
                        style={{ color: 'var(--jobs-text-muted)' }}
                    >
                        <ArrowLeft size={14} />
                        Back to jobs
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-8">
                {/* Job header */}
                <div className="mb-6">
                    <div className="flex items-start justify-between gap-4 mb-3">
                        <h1 className="text-2xl font-bold">{job.title}</h1>
                        <span
                            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${job.type === 'silly' ? 'badge-silly' : 'badge-real'}`}
                        >
                            {job.type === 'silly' ? 'Absurd' : 'Realistic'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
                        <span className="flex items-center gap-1.5">
                            <Building2 size={14} />
                            {job.company}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <MapPin size={14} />
                            {job.location}
                        </span>
                        {job.salaryRange && (
                            <span className="flex items-center gap-1.5">
                                <Banknote size={14} />
                                {job.salaryRange}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5">
                            <Clock size={14} />
                            Posted {new Date(job.publishAt).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t mb-6" style={{ borderColor: 'var(--jobs-border)' }} />

                {/* Description */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--jobs-text-muted)' }}>
                        About this role
                    </h2>
                    <p className="leading-relaxed whitespace-pre-wrap">{job.description}</p>
                </div>

                {/* Apply section */}
                <div
                    className="p-5 rounded-lg border"
                    style={{ background: 'var(--jobs-surface)', borderColor: 'var(--jobs-border)', borderRadius: 'var(--jobs-radius-lg)' }}
                >
                    {applied ? (
                        <div className="flex items-start gap-3">
                            {applied.status === 'rejected' ? (
                                <XCircle size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--jobs-danger)' }} />
                            ) : (
                                <CheckCircle2 size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--jobs-accent)' }} />
                            )}
                            <div>
                                <p className="font-semibold mb-1">
                                    {applied.status === 'rejected' ? 'Application Reviewed' : 'Application Submitted'}
                                </p>
                                <p className="text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
                                    {applied.message}
                                </p>
                                <Link
                                    href="/rmh-jobs/applications"
                                    className="text-sm mt-2 inline-block"
                                    style={{ color: 'var(--jobs-accent)' }}
                                >
                                    View your applications →
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h3 className="font-semibold mb-2">Ready to apply?</h3>
                            <p className="text-sm mb-4" style={{ color: 'var(--jobs-text-muted)' }}>
                                {session?.user
                                    ? 'Click below to submit your application. Results may vary.'
                                    : 'Sign in to apply for this position.'}
                            </p>
                            {error && (
                                <p className="text-sm mb-3" style={{ color: 'var(--jobs-danger)' }}>{error}</p>
                            )}
                            <button
                                onClick={handleApply}
                                disabled={applying}
                                className="jobs-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm"
                                style={{ borderRadius: 'var(--jobs-radius)' }}
                            >
                                {applying ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Send size={14} />
                                )}
                                {session?.user ? 'Apply Now' : 'Sign In to Apply'}
                            </button>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
