import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jobSeedData, type JobSeedEntry } from '@/lib/rmh-jobs/job-seed-data';
import { rollOutcome, type ApplicationOutcome } from '@/lib/rmh-jobs/outcomes';
import { getRandomRejectionMessage } from '@/lib/rmh-jobs/rejections';
import { problemBank } from '@/lib/rmh-jobs/problems';

export interface Job {
    id: string;
    title: string;
    company: string;
    description: string;
    type: string;
    location: string;
    salaryRange: string | null;
    publishAt: string;
}

export interface Application {
    id: string;
    jobId: string;
    jobTitle: string;
    company: string;
    status: 'applied' | 'rejected' | 'oa_invited' | 'oa_completed';
    outcome: ApplicationOutcome;
    processAt: string;
    appliedAt: string;
    rejectionMessage?: string;
    assessmentId?: string;
}

export interface Assessment {
    id: string;
    applicationId: string;
    problemId: string;
    status: 'pending' | 'submitted';
    startedAt: string;
    submittedAt: string | null;
    code: string | null;
    language: string | null;
    evaluationResult: string | null;
    rejectionMessage: string | null;
}

// Generate stable jobs from seed data
function generateJobs(): Job[] {
    return jobSeedData.map((entry: JobSeedEntry, i: number) => ({
        id: `job-${i}`,
        title: entry.title,
        company: entry.company,
        description: entry.description,
        type: entry.type,
        location: entry.location,
        salaryRange: entry.salaryRange,
        publishAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    }));
}

let cachedJobs: Job[] | null = null;
function getJobs(): Job[] {
    if (!cachedJobs) cachedJobs = generateJobs();
    return cachedJobs;
}

interface JobsDataState {
    applications: Application[];
    assessments: Assessment[];

    getJobs: (query: string, sort: string, page: number, limit: number) => { jobs: Job[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
    getJob: (id: string) => Job | undefined;
    applyToJob: (jobId: string) => Application;
    getApplications: () => Application[];
    processApplications: () => void;
    getAssessment: (id: string) => { assessment: Assessment; problem: (typeof problemBank)[0] | undefined; job: { title: string; company: string } } | null;
    submitAssessment: (id: string, code: string, language: string) => Assessment;
}

export const useJobsDataStore = create<JobsDataState>()(
    persist(
        (set, get) => ({
            applications: [],
            assessments: [],

            getJobs: (query, sort, page, limit) => {
                let filtered = getJobs();

                if (query) {
                    const q = query.toLowerCase();
                    filtered = filtered.filter(
                        (j) =>
                            j.title.toLowerCase().includes(q) ||
                            j.company.toLowerCase().includes(q) ||
                            j.description.toLowerCase().includes(q)
                    );
                }

                if (sort === 'newest') {
                    filtered = [...filtered].sort((a, b) => new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime());
                } else if (sort === 'oldest') {
                    filtered = [...filtered].sort((a, b) => new Date(a.publishAt).getTime() - new Date(b.publishAt).getTime());
                } else if (sort === 'company') {
                    filtered = [...filtered].sort((a, b) => a.company.localeCompare(b.company));
                }

                const total = filtered.length;
                const totalPages = Math.ceil(total / limit);
                const start = (page - 1) * limit;
                const jobs = filtered.slice(start, start + limit);

                return { jobs, pagination: { page, limit, total, totalPages } };
            },

            getJob: (id) => getJobs().find((j) => j.id === id),

            applyToJob: (jobId) => {
                const job = getJobs().find((j) => j.id === jobId);
                if (!job) throw new Error('Job not found');

                const existing = get().applications.find((a) => a.jobId === jobId);
                if (existing) throw new Error('Already applied');

                const { outcome, processAt } = rollOutcome();
                const app: Application = {
                    id: `app-${Date.now()}`,
                    jobId,
                    jobTitle: job.title,
                    company: job.company,
                    status: outcome === 'instant_reject' ? 'rejected' : 'applied',
                    outcome,
                    processAt: processAt.toISOString(),
                    appliedAt: new Date().toISOString(),
                    rejectionMessage: outcome === 'instant_reject' ? getRandomRejectionMessage(job.title, job.company) : undefined,
                };

                if (outcome === 'oa_invite') {
                    const problem = problemBank[Math.floor(Math.random() * problemBank.length)];
                    const assessment: Assessment = {
                        id: `oa-${Date.now()}`,
                        applicationId: app.id,
                        problemId: problem.id,
                        status: 'pending',
                        startedAt: new Date().toISOString(),
                        submittedAt: null,
                        code: null,
                        language: null,
                        evaluationResult: null,
                        rejectionMessage: null,
                    };
                    app.assessmentId = assessment.id;
                    set((s) => ({ applications: [...s.applications, app], assessments: [...s.assessments, assessment] }));
                } else {
                    set((s) => ({ applications: [...s.applications, app] }));
                }

                return app;
            },

            getApplications: () => {
                get().processApplications();
                return get().applications;
            },

            processApplications: () => {
                const now = Date.now();
                const apps = get().applications;
                let changed = false;
                const updated = apps.map((app) => {
                    if (app.status !== 'applied') return app;
                    if (new Date(app.processAt).getTime() > now) return app;

                    changed = true;
                    if (app.outcome === 'delayed_reject') {
                        return { ...app, status: 'rejected' as const, rejectionMessage: getRandomRejectionMessage(app.jobTitle, app.company) };
                    }
                    if (app.outcome === 'oa_invite') {
                        return { ...app, status: 'oa_invited' as const };
                    }
                    return app;
                });
                if (changed) set({ applications: updated });
            },

            getAssessment: (id) => {
                const assessment = get().assessments.find((a) => a.id === id);
                if (!assessment) return null;
                const app = get().applications.find((a) => a.assessmentId === id);
                const problem = problemBank.find((p) => p.id === assessment.problemId);
                return {
                    assessment,
                    problem,
                    job: { title: app?.jobTitle ?? 'Unknown', company: app?.company ?? 'Unknown' },
                };
            },

            submitAssessment: (id, code, language) => {
                const assessments = get().assessments;
                const idx = assessments.findIndex((a) => a.id === id);
                if (idx === -1) throw new Error('Assessment not found');

                const assessment = assessments[idx];
                const app = get().applications.find((a) => a.assessmentId === id);
                const oaPassed = Math.random() < 0.3;
                const rejMsg = app
                    ? getRandomRejectionMessage(app.jobTitle, app.company, true, oaPassed)
                    : 'Thank you for your submission.';

                const updated: Assessment = {
                    ...assessment,
                    status: 'submitted',
                    submittedAt: new Date().toISOString(),
                    code,
                    language,
                    evaluationResult: oaPassed ? 'pass' : 'fail',
                    rejectionMessage: rejMsg,
                };

                const newAssessments = [...assessments];
                newAssessments[idx] = updated;

                const apps = get().applications.map((a) => {
                    if (a.assessmentId === id) {
                        return { ...a, status: 'oa_completed' as const, rejectionMessage: rejMsg };
                    }
                    return a;
                });

                set({ assessments: newAssessments, applications: apps });
                return updated;
            },
        }),
        {
            name: 'rmh-jobs-data',
            partialize: (state) => ({
                applications: state.applications,
                assessments: state.assessments,
            }),
        }
    )
);
