import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import {
  listUserResumes,
  uploadResume,
  type ResumePrisma,
} from '@/lib/rmhladder/resume/service.server';
import { RESUME_MAX_BYTES } from '@/lib/rmhladder/resume/schemas';
import { resumeSubsystemReadiness } from '@/lib/rmhladder/resume/readiness.server';
import { readRequestBodyLimited, RequestBodyTooLargeError } from '@/lib/http-body.server';

const resumePrisma = prisma as unknown as ResumePrisma;

export const Route = createFileRoute('/api/rmhladder/resume/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json({ resumes: await listUserResumes(resumePrisma, session.user.id) });
        } catch (error) {
          console.error('[rmhladder-resume] list failed:', error);
          return Response.json({ error: 'Could not load resumes.' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed, retryAfter } = rateLimit(`${session.user.id}:${getClientIp(request)}`, {
            limit: 4,
            windowMs: 60 * 60_000,
            prefix: 'rmhladder-resume-upload',
          });
          if (!allowed)
            return Response.json(
              { error: 'Too many resume uploads. Try again later.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          if (process.env.NODE_ENV === 'production') {
            const readiness = resumeSubsystemReadiness();
            if (!readiness.ready) {
              // Operators get the actionable detail in logs / on /rmhladder/health;
              // end users get a generic message (never leak internal env var names).
              console.error(
                `[rmhladder-resume] upload blocked — resume subsystem not ready: missing ${readiness.missing.join('; ')}`,
              );
              return Response.json(
                { error: 'Resume uploads are temporarily unavailable. Please try again later.' },
                { status: 503 },
              );
            }
          }

          let multipartBody: Uint8Array;
          try {
            multipartBody = await readRequestBodyLimited(request, RESUME_MAX_BYTES + 1024 * 1024);
          } catch (error) {
            if (!(error instanceof RequestBodyTooLargeError)) throw error;
            return Response.json({ error: 'Resume exceeds the 10 MiB limit.' }, { status: 413 });
          }
          const contentType = request.headers.get('content-type');
          if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
            return Response.json({ error: 'Expected a multipart resume upload.' }, { status: 400 });
          }
          const form = await new Response(multipartBody.slice().buffer as ArrayBuffer, {
            headers: { 'Content-Type': contentType },
          }).formData();
          const file = form.get('resume');
          if (!(file instanceof File) || file.size === 0)
            return Response.json({ error: 'Choose a PDF or DOCX resume.' }, { status: 400 });
          if (file.size > RESUME_MAX_BYTES)
            return Response.json({ error: 'Resume exceeds the 10 MiB limit.' }, { status: 413 });
          const result = await uploadResume(resumePrisma, {
            userId: session.user.id,
            resumeId:
              typeof form.get('resumeId') === 'string' ? String(form.get('resumeId')) : undefined,
            name: typeof form.get('name') === 'string' ? String(form.get('name')) : undefined,
            file: {
              buffer: Buffer.from(await file.arrayBuffer()),
              filename: file.name,
              mimeType:
                file.type ||
                (file.name.toLowerCase().endsWith('.docx')
                  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : file.name.toLowerCase().endsWith('.pdf')
                    ? 'application/pdf'
                    : ''),
            },
          });
          await prisma.ladderUserPrefs.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id },
            update: {},
          });
          return Response.json(result, { status: 201 });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Resume upload failed';
          const userError =
            /empty|limit|PDF|DOCX|filename|not found|supported|document body|parse/i.test(message);
          if (!userError) console.error('[rmhladder-resume] upload failed:', error);
          return Response.json(
            { error: userError ? message : 'Resume upload failed.' },
            { status: userError ? 400 : 500 },
          );
        }
      },
    },
  },
});
