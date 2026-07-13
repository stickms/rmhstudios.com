import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import {
  ladderAiProviderConfigured,
  LadderAiConfigurationError,
  type LadderAiProviderName,
} from '@/lib/rmhladder/ai/provider.server';
import { analyzeResume, type ResumePrisma } from '@/lib/rmhladder/resume/service.server';
import { analyzeResumeSchema } from '@/lib/rmhladder/resume/schemas';
import { readTextBodyLimited, RequestBodyTooLargeError } from '@/lib/http-body.server';

const resumePrisma = prisma as unknown as ResumePrisma;

export const Route = createFileRoute('/api/rmhladder/resume/$id/analyze')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let reservedTaskId: string | null = null;
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const owner = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { emailVerified: true },
          });
          if (!owner?.emailVerified) {
            return Response.json({ error: 'Verify your email before using AI resume review.' }, { status: 403 });
          }
          const { allowed, retryAfter } = rateLimit(`${session.user.id}:${getClientIp(request)}`, {
            limit: 3, windowMs: 60 * 60_000, prefix: 'rmhladder-resume-analyze',
          });
          if (!allowed) return Response.json({ error: 'AI review limit reached. Try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
          let rawBody: string;
          try {
            rawBody = await readTextBodyLimited(request, 4 * 1024);
          } catch (error) {
            if (!(error instanceof RequestBodyTooLargeError)) throw error;
            return Response.json({ error: 'Analysis request is too large.' }, { status: 413 });
          }
          let body: unknown = {};
          try { body = JSON.parse(rawBody); } catch { /* handled by schema */ }
          const parsed = analyzeResumeSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid analysis request.' }, { status: 400 });
          const configuredProvider = (process.env.LADDER_AI_PROVIDER ?? 'deepseek') as LadderAiProviderName;
          if (!['deepseek', 'openai', 'anthropic'].includes(configuredProvider)
              || !ladderAiProviderConfigured(configuredProvider)) {
            return Response.json({ error: 'AI resume review is not configured.' }, { status: 503 });
          }
          const staleAt = new Date(Date.now() - 15 * 60 * 1000);
          await prisma.ladderAiTask.updateMany({
            where: {
              resumeVersionId: parsed.data.versionId,
              kind: 'resume_review',
              status: 'processing',
              startedAt: { lt: staleAt },
            },
            data: {
              status: 'failed',
              dedupeKey: null,
              error: 'Review timed out before completion',
              finishedAt: new Date(),
            },
          });
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const configuredLimit = Number(process.env.LADDER_AI_DAILY_REVIEW_LIMIT ?? 200);
          const globalLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 200;
          const reservation = await prisma.$transaction(async (tx) => {
            // One cross-process transaction lock makes the count + reservation
            // atomic for both the per-user and global daily budgets.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rmhladder-ai-review-budget'))`;
            const ownedVersion = await tx.ladderResumeVersion.findFirst({
              where: { id: parsed.data.versionId, userId: session.user.id, resumeId: params.id },
              select: { id: true },
            });
            if (!ownedVersion) return { error: 'not_found' as const };
            const inFlight = await tx.ladderAiTask.findFirst({
              where: { resumeVersionId: parsed.data.versionId, kind: 'resume_review', status: { in: ['queued', 'processing'] } },
              select: { id: true },
            });
            if (inFlight) return { error: 'in_flight' as const };
            const userDaily = await tx.ladderAiTask.count({
              where: { userId: session.user.id, kind: 'resume_review', createdAt: { gte: dayAgo } },
            });
            const globalDaily = await tx.ladderAiTask.count({
              where: { kind: 'resume_review', createdAt: { gte: dayAgo } },
            });
            if (userDaily >= 5 || globalDaily >= globalLimit) return { error: 'budget' as const };
            const task = await tx.ladderAiTask.create({
              data: {
                userId: session.user.id,
                kind: 'resume_review',
                status: 'queued',
                resumeVersionId: parsed.data.versionId,
                dedupeKey: `resume_review:${parsed.data.versionId}`,
              },
              select: { id: true },
            });
            return { taskId: task.id };
          });
          if ('error' in reservation && reservation.error === 'not_found') {
            return Response.json({ error: 'Resume version not found.' }, { status: 404 });
          }
          if ('error' in reservation && reservation.error === 'in_flight') {
            return Response.json({ error: 'This resume review is already running.' }, { status: 409 });
          }
          if ('error' in reservation && reservation.error === 'budget') {
            return Response.json({ error: 'AI review daily limit reached. Try again later.' }, { status: 429 });
          }
          if (!('taskId' in reservation)) throw new Error('AI review reservation failed');
          reservedTaskId = reservation.taskId;
          const result = await analyzeResume(resumePrisma, {
            userId: session.user.id,
            resumeId: params.id,
            versionId: parsed.data.versionId,
            reservedTaskId,
          });
          return Response.json(result);
        } catch (error) {
          if (reservedTaskId) {
            await prisma.ladderAiTask.updateMany({
              where: { id: reservedTaskId, status: 'queued' },
              data: { status: 'failed', dedupeKey: null, error: 'Review failed before processing', finishedAt: new Date() },
            }).catch(() => undefined);
          }
          if ((error as { code?: string } | null)?.code === 'P2002') {
            return Response.json({ error: 'This resume review is already running.' }, { status: 409 });
          }
          if (error instanceof LadderAiConfigurationError) return Response.json({ error: 'AI resume review is not configured.' }, { status: 503 });
          const message = error instanceof Error ? error.message : '';
          if (!/not found|not ready|too short/i.test(message)) console.error('[rmhladder-resume] analysis failed:', error);
          const status = /not found/i.test(message) ? 404 : /not ready|too short/i.test(message) ? 400 : 502;
          return Response.json({ error: status < 500 ? message : 'Resume analysis failed. Try again.' }, { status });
        }
      },
    },
  },
});
