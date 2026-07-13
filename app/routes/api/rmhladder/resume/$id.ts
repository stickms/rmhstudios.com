import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { deleteResume, downloadResume, type ResumePrisma } from '@/lib/rmhladder/resume/service.server';

const resumePrisma = prisma as unknown as ResumePrisma;

function safeDownloadName(filename: string): string {
  return filename.replace(/["\\\r\n]/g, '_').slice(0, 255) || 'resume.pdf';
}

export const Route = createFileRoute('/api/rmhladder/resume/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const file = await downloadResume(resumePrisma, session.user.id, params.id);
          return new Response(new Uint8Array(file.body), {
            headers: {
              'Content-Type': file.mimeType,
              'Content-Disposition': `attachment; filename="${safeDownloadName(file.filename)}"`,
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!/not found/i.test(message)) console.error('[rmhladder-resume] download failed:', error);
          return Response.json({ error: /not found/i.test(message) ? 'Resume not found.' : 'Could not download resume.' }, { status: /not found/i.test(message) ? 404 : 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed, retryAfter } = rateLimit(`${session.user.id}:${getClientIp(request)}`, {
            limit: 10, windowMs: 60 * 60_000, prefix: 'rmhladder-resume-delete',
          });
          if (!allowed) return Response.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
          return Response.json(await deleteResume(resumePrisma, session.user.id, params.id));
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!/not found/i.test(message)) console.error('[rmhladder-resume] delete failed:', error);
          return Response.json({ error: /not found/i.test(message) ? 'Resume not found.' : 'Could not delete resume.' }, { status: /not found/i.test(message) ? 404 : 500 });
        }
      },
    },
  },
});
