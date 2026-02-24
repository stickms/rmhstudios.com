'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { OAEditor } from '@/components/rmh-jobs/OAEditor';

interface AssessmentData {
    assessment: {
        id: string;
        status: string;
        problemId: string;
        startedAt: string;
        expiresAt: string;
        submittedAt: string | null;
        evaluationResult: string | null;
        rejectionMessage: string | null;
        code: string | null;
        language: string | null;
    };
    problem: {
        id: string;
        title: string;
        difficulty: string;
        complexityRequirement: string;
        gameReference: string;
        description: string;
        examples: { input: string; output: string; explanation: string }[];
        constraints: string[];
        starterCode: Record<string, string>;
        timeLimit: number;
    } | null;
    job: {
        title: string;
        company: string;
    };
}

export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession();
    const [data, setData] = useState<AssessmentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isPending) return;
        if (!session?.user) {
            router.push('/login');
            return;
        }

        fetch(`/api/rmh-jobs/assessment/${id}`)
            .then(async (r) => {
                if (!r.ok) {
                    const err = await r.json();
                    throw new Error(err.error ?? 'Failed to load assessment');
                }
                return r.json();
            })
            .then((d) => {
                setData(d);
                setLoading(false);
            })
            .catch((e) => {
                setError(e.message);
                setLoading(false);
            });
    }, [id, session, isPending, router]);

    if (isPending || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--jobs-accent)' }} />
            </div>
        );
    }

    if (error || !data?.problem) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-lg" style={{ color: 'var(--jobs-danger)' }}>{error ?? 'Problem not found'}</p>
                <button
                    onClick={() => router.push('/rmh-jobs/applications')}
                    className="text-sm"
                    style={{ color: 'var(--jobs-accent)' }}
                >
                    ← Back to applications
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
