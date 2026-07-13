import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { parseCsv } from '@/lib/rmhladder/csv';
import { updateApplication, type ActionsPrisma } from '@/lib/rmhladder/server/actions';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { readTextBodyLimited, RequestBodyTooLargeError } from '@/lib/http-body.server';

const bodySchema = z.object({
  csv: z.string().min(1).max(1_000_000),
  dryRun: z.boolean().default(true),
});
const statusSchema = z.enum([
  'not_applied', 'planning', 'applied', 'networking', 'interviewing',
  'final_round', 'rejected', 'offer', 'withdrawn',
]);
const MAX_IMPORT_BODY_BYTES = 1_100_000;
const MAX_IMPORT_ROWS = 1_000;

export const Route = createFileRoute('/api/rmhladder/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const limited = rateLimit(`${session.user.id}:${getClientIp(request)}`, {
          prefix: 'ladder-import', limit: 10, windowMs: 60 * 60_000,
        });
        if (!limited.allowed) {
          return Response.json({ error: 'Too many imports' }, {
            status: 429,
            headers: { 'Retry-After': String(limited.retryAfter) },
          });
        }
        let rawBody: string;
        try {
          rawBody = await readTextBodyLimited(request, MAX_IMPORT_BODY_BYTES);
        } catch (error) {
          if (!(error instanceof RequestBodyTooLargeError)) throw error;
          return Response.json({ error: 'Import is too large' }, { status: 413 });
        }
        let body: unknown = null;
        try { body = JSON.parse(rawBody); } catch { /* handled by schema */ }
        const parsedBody = bodySchema.safeParse(body);
        if (!parsedBody.success) return Response.json({ error: 'Invalid import' }, { status: 400 });

        let rows: string[][];
        try {
          rows = parseCsv(parsedBody.data.csv);
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : 'Invalid CSV' }, { status: 400 });
        }
        const [headers = [], ...dataRows] = rows;
        if (dataRows.length > MAX_IMPORT_ROWS) {
          return Response.json({ error: `Import is limited to ${MAX_IMPORT_ROWS} rows` }, { status: 400 });
        }
        const header = new Map(headers.map((value, index) => [value.trim(), index]));
        if (!header.has('jobId') || !header.has('status')) {
          return Response.json({ error: 'CSV must contain jobId and status columns' }, { status: 400 });
        }

        const candidates: Array<{ row: number; jobId: string; status: z.infer<typeof statusSchema>; appliedDate: Date | null; notes: string | null }> = [];
        const errors: Array<{ row: number; error: string }> = [];
        const seenJobIds = new Set<string>();
        for (const [index, cells] of dataRows.entries()) {
          const jobId = cells[header.get('jobId')!] ?? '';
          const parsedStatus = statusSchema.safeParse(cells[header.get('status')!] ?? '');
          const appliedRaw = header.has('appliedDate') ? cells[header.get('appliedDate')!] : '';
          const appliedDate = appliedRaw ? new Date(appliedRaw) : null;
          if (!jobId || !parsedStatus.success || (appliedRaw && Number.isNaN(appliedDate?.getTime()))) {
            errors.push({ row: index + 2, error: 'Invalid jobId, status, or appliedDate' });
            continue;
          }
          if (seenJobIds.has(jobId)) {
            errors.push({ row: index + 2, error: 'Duplicate jobId in import' });
            continue;
          }
          seenJobIds.add(jobId);
          candidates.push({
            row: index + 2,
            jobId,
            status: parsedStatus.data,
            appliedDate,
            notes: header.has('notes') ? (cells[header.get('notes')!] || null) : null,
          });
        }

        const existingJobs = await prisma.ladderJob.findMany({
          where: { id: { in: candidates.map((row) => row.jobId) } },
          select: { id: true },
        });
        const existingIds = new Set(existingJobs.map((job) => job.id));
        const valid = candidates.filter((candidate) => {
          if (existingIds.has(candidate.jobId)) return true;
          errors.push({ row: candidate.row, error: 'Job does not exist' });
          return false;
        });

        if (!parsedBody.data.dryRun && errors.length === 0) {
          for (const row of valid) {
            await updateApplication(prisma as unknown as ActionsPrisma, session.user.id, row.jobId, {
              status: row.status,
              appliedDate: row.appliedDate,
              notes: row.notes,
            });
          }
        }
        return Response.json({ dryRun: parsedBody.data.dryRun, valid: valid.length, errors });
      },
    },
  },
});
