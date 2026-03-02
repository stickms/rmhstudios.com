'use client';

import { ArrowLeft, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useJobsDataStore } from '@/lib/store/useJobsDataStore';
import { ApplicationTimeline } from '@/components/rmh-jobs/ApplicationTimeline';

export default function ApplicationsPage() {
    const getApplications = useJobsDataStore((s) => s.getApplications);
    const assessments = useJobsDataStore((s) => s.assessments);
    const applications = getApplications();

    // Transform to the format ApplicationTimeline expects
    const transformed = applications.map((app) => ({
        id: app.id,
        status: app.status,
        outcome: app.outcome,
        rejectionMessage: app.rejectionMessage ?? null,
        createdAt: app.appliedAt,
        job: {
            id: app.jobId,
            title: app.jobTitle,
            company: app.company,
            type: 'real',
        },
        assessment: app.assessmentId
            ? (() => {
                  const a = assessments.find((x) => x.id === app.assessmentId);
                  return a
                      ? {
                            id: a.id,
                            status: a.status,
                            problemId: a.problemId,
                            expiresAt: new Date(new Date(a.startedAt).getTime() + 15 * 60 * 1000).toISOString(),
                            startedAt: a.startedAt,
                            submittedAt: a.submittedAt,
                            evaluationResult: a.evaluationResult,
                        }
                      : null;
              })()
            : null,
    }));

    return (
        <div className="min-h-screen">
            <header
                className="sticky top-0 z-30 border-b backdrop-blur-md"
                style={{ background: 'rgba(10, 10, 15, 0.85)', borderColor: 'var(--jobs-border)' }}
            >
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <Link
                        href="/secret/jobs"
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
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--jobs-surface-2)', color: 'var(--jobs-text-muted)' }}>
                        {transformed.length}
                    </span>
                </div>

                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <ApplicationTimeline applications={transformed as any} />
            </main>
        </div>
    );
}
