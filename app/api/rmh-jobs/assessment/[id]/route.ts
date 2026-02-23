import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { problemBank } from '@/lib/rmh-jobs/problems';
import { getRandomRejectionMessage } from '@/lib/rmh-jobs/rejections';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const assessment = await prisma.assessment.findUnique({
        where: { id },
        include: {
            application: {
                include: {
                    job: { select: { title: true, company: true } },
                },
            },
        },
    });

    if (!assessment) {
        return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    if (assessment.application.userId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Start the timer on first access
    if (!assessment.startedAt && assessment.status === 'pending') {
        await prisma.assessment.update({
            where: { id },
            data: {
                startedAt: new Date(),
                status: 'in_progress',
            },
        });
    }

    const problem = problemBank.find((p) => p.id === assessment.problemId);

    return NextResponse.json({
        assessment: {
            id: assessment.id,
            status: assessment.startedAt ? 'in_progress' : assessment.status,
            problemId: assessment.problemId,
            startedAt: assessment.startedAt ?? new Date().toISOString(),
            expiresAt: assessment.expiresAt,
            submittedAt: assessment.submittedAt,
            evaluationResult: assessment.evaluationResult,
            rejectionMessage: assessment.rejectionMessage,
            code: assessment.code,
            language: assessment.language,
        },
        problem: problem
            ? {
                  id: problem.id,
                  title: problem.title,
                  difficulty: problem.difficulty,
                  complexityRequirement: problem.complexityRequirement,
                  gameReference: problem.gameReference,
                  description: problem.description,
                  examples: problem.examples,
                  constraints: problem.constraints,
                  starterCode: problem.starterCode,
                  timeLimit: problem.timeLimit,
              }
            : null,
        job: {
            title: assessment.application.job.title,
            company: assessment.application.job.company,
        },
    });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { code, language } = body;

    const assessment = await prisma.assessment.findUnique({
        where: { id },
        include: {
            application: {
                include: { job: { select: { title: true, company: true } } },
            },
        },
    });

    if (!assessment) {
        return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    if (assessment.application.userId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (assessment.submittedAt) {
        return NextResponse.json({ error: 'Already submitted' }, { status: 409 });
    }

    // Spoofed evaluation
    const passed = Math.random() < 0.4;
    const totalTests = 247;
    const passedTests = passed ? totalTests : Math.floor(Math.random() * 20) + 1;

    const evaluationResult = passed ? 'pass' : 'fail';
    const rejectionMessage = getRandomRejectionMessage(
        assessment.application.job.title,
        assessment.application.job.company,
        true,
        passed
    );

    await prisma.$transaction([
        prisma.assessment.update({
            where: { id },
            data: {
                code: typeof code === 'string' ? code.slice(0, 50000) : '',
                language: language ?? 'javascript',
                submittedAt: new Date(),
                status: 'evaluated',
                evaluationResult,
                rejectionMessage,
            },
        }),
        prisma.jobApplication.update({
            where: { id: assessment.applicationId },
            data: {
                status: 'rejected',
                rejectionMessage,
            },
        }),
    ]);

    return NextResponse.json({
        evaluationResult,
        totalTests,
        passedTests,
        message: passed
            ? `All ${totalTests} test cases passed! Warning: solution appears to be O(2^n), expected ${problemBank.find((p) => p.id === assessment.problemId)?.complexityRequirement ?? 'O(n²)'}.`
            : `${passedTests}/${totalTests} test cases passed — Time Limit Exceeded on remaining.`,
        rejectionMessage,
    });
}
