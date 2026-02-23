'use client';

import { useEffect, useState, useCallback } from 'react';
import { useJobSearchStore } from '@/lib/store/useJobSearchStore';
import { JobCard } from '@/components/rmh-jobs/JobCard';
import { JobSearch } from '@/components/rmh-jobs/JobSearch';
import { Briefcase, ChevronLeft, ChevronRight, Loader2, ClipboardList } from 'lucide-react';
import Link from 'next/link';

interface Job {
    id: string;
    title: string;
    company: string;
    description: string;
    type: string;
    location: string;
    salaryRange: string | null;
    publishAt: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function RMHJobsPage() {
    const { query, type, sort, page, setPage } = useJobSearchStore();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '20');
        params.set('sort', sort);
        if (type !== 'all') params.set('type', type);
        if (query) params.set('q', query);

        try {
            const res = await fetch(`/api/rmh-jobs/jobs?${params}`);
            if (res.ok) {
                const data = await res.json();
                setJobs(data.jobs);
                setPagination(data.pagination);
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [query, type, sort, page]);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    return (
        <div className="min-h-screen">
            {/* Top bar */}
            <header
                className="sticky top-0 z-30 border-b backdrop-blur-md"
                style={{ background: 'rgba(10, 10, 15, 0.85)', borderColor: 'var(--jobs-border)' }}
            >
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Briefcase size={18} style={{ color: 'var(--jobs-accent)' }} />
                        <h1 className="text-base font-semibold">RMH Job Search</h1>
                    </div>
                    <Link
                        href="/rmh-jobs/applications"
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-[var(--jobs-surface-2)] transition-colors"
                        style={{ color: 'var(--jobs-text-muted)' }}
                    >
                        <ClipboardList size={14} />
                        My Applications
                    </Link>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6">
                {/* Hero */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold mb-2">
                        Find Your Dream Job
                        <span className="text-xs font-normal ml-2" style={{ color: 'var(--jobs-text-subtle)' }}>
                            (rejection guaranteed)
                        </span>
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
                        {pagination ? `${pagination.total} open positions` : 'Loading positions...'}
                        {' '}— realistic, ridiculous, and everything in between.
                    </p>
                </div>

                {/* Search & Filters */}
                <div className="mb-6">
                    <JobSearch />
                </div>

                {/* Job list */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--jobs-accent)' }} />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-16" style={{ color: 'var(--jobs-text-muted)' }}>
                        <p className="text-lg mb-2">No jobs found</p>
                        <p className="text-sm">Try adjusting your search or filters.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3">
                            {jobs.map((job) => (
                                <JobCard key={job.id} {...job} />
                            ))}
                        </div>

                        {/* Pagination */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-3 mt-8">
                                <button
                                    onClick={() => setPage(page - 1)}
                                    disabled={page <= 1}
                                    className="jobs-btn-secondary flex items-center gap-1 px-3 py-2 rounded-lg text-sm disabled:opacity-30"
                                    style={{ borderRadius: 'var(--jobs-radius)' }}
                                >
                                    <ChevronLeft size={14} />
                                    Previous
                                </button>
                                <span className="text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(page + 1)}
                                    disabled={page >= pagination.totalPages}
                                    className="jobs-btn-secondary flex items-center gap-1 px-3 py-2 rounded-lg text-sm disabled:opacity-30"
                                    style={{ borderRadius: 'var(--jobs-radius)' }}
                                >
                                    Next
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
