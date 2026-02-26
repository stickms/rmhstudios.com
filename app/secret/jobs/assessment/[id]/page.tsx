'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useJobsDataStore } from '@/lib/store/useJobsDataStore';
import { OAEditor } from '@/components/rmh-jobs/OAEditor';
import { problemBank } from '@/lib/rmh-jobs/problems';

export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const data = useJobsDataStore((s) => s.getAssessment(id));

    if (!data || !data.problem) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-lg" style={{ color: 'var(--jobs-danger)' }}>Assessment not found</p>
                <button
                    onClick={() => router.push('/secret/jobs/applications')}
                    className="text-sm"
                    style={{ color: 'var(--jobs-accent)' }}
                >
                    &larr; Back to applications
                </button>
            </div>
        );
    }

    return (
        <>
            <div className="scanline-overlay" />
            <OAEditor
                problem={data.problem}
                job={data.job}
                assessmentId={data.assessment.id}
                startedAt={data.assessment.startedAt}
                initialCode={data.assessment.code ?? undefined}
                initialLanguage={data.assessment.language ?? undefined}
                isSubmitted={!!data.assessment.submittedAt}
                existingResult={
                    data.assessment.submittedAt
                        ? {
                              evaluationResult: data.assessment.evaluationResult ?? 'fail',
                              totalTests: 247,
                              passedTests: data.assessment.evaluationResult === 'pass' ? 247 : 14,
                              message:
                                  data.assessment.evaluationResult === 'pass'
                                      ? 'All 247 test cases passed! Warning: solution appears to be O(2^n).'
                                      : '14/247 test cases passed — Time Limit Exceeded on remaining.',
                              rejectionMessage: data.assessment.rejectionMessage ?? '',
                          }
                        : null
                }
            />
        </>
    );
}
