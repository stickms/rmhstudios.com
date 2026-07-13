import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { candidateProfileSchema } from '@/lib/rmhladder/resume/schemas';
import { confirmResumeProfile, type ResumePrisma } from '@/lib/rmhladder/resume/service.server';

const resumePrisma = prisma as unknown as ResumePrisma;
const bodySchema = z.object({
  versionId: z.string().trim().min(1).max(100),
  profile: candidateProfileSchema,
});

export const Route = createFileRoute('/api/rmhladder/resume/$id/confirm')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed, retryAfter } = rateLimit(`${session.user.id}:${getClientIp(request)}`, {
            limit: 10, windowMs: 60 * 60_000, prefix: 'rmhladder-resume-confirm',
          });
          if (!allowed) return Response.json({ error: 'Too many match refreshes.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
          const parsed = bodySchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return Response.json({ error: 'Review the extracted profile before confirming it.' }, { status: 400 });
          return Response.json(await confirmResumeProfile(resumePrisma, {
            userId: session.user.id,
            resumeId: params.id,
            versionId: parsed.data.versionId,
            profile: parsed.data.profile,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!/not found|invalid/i.test(message)) console.error('[rmhladder-resume] profile confirmation failed:', error);
          return Response.json({ error: /not found/i.test(message) ? 'Resume not found.' : 'Could not refresh matches.' }, { status: /not found/i.test(message) ? 404 : 500 });
        }
      },
    },
  },
});
