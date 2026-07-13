import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { encodeCsv } from '@/lib/rmhladder/csv';

export const Route = createFileRoute('/api/rmhladder/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const url = new URL(request.url);
        const kind = url.searchParams.get('kind') ?? 'applications';
        let csv: string;

        if (kind === 'saved') {
          const rows = await prisma.ladderJobAction.findMany({
            where: { userId: session.user.id, action: 'saved' },
            include: { job: { include: { company: true } } },
            orderBy: { createdAt: 'desc' },
          });
          csv = encodeCsv(rows.map(({ job, createdAt }) => ({
            jobId: job.id,
            title: job.title,
            company: job.company.name,
            location: [job.city, job.state].filter(Boolean).join(', '),
            sourceUrl: job.originalPostingUrl,
            savedAt: createdAt,
          })), ['jobId', 'title', 'company', 'location', 'sourceUrl', 'savedAt']);
        } else {
          const rows = await prisma.ladderApplication.findMany({
            where: { userId: session.user.id },
            include: { job: { include: { company: true } }, selectedResumeVersion: true },
            orderBy: { updatedAt: 'desc' },
          });
          csv = encodeCsv(rows.map((application) => ({
            jobId: application.jobId,
            title: application.job.title,
            company: application.job.company.name,
            status: application.status,
            appliedDate: application.appliedDate,
            followUpDate: application.followUpDate,
            resume: application.selectedResumeVersion?.filename ?? application.resumeVersion,
            notes: application.notes,
            sourceUrl: application.job.originalPostingUrl,
          })), ['jobId', 'title', 'company', 'status', 'appliedDate', 'followUpDate', 'resume', 'notes', 'sourceUrl']);
        }

        const stamp = new Date().toISOString().slice(0, 10);
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="rmhladder-${kind}-${stamp}.csv"`,
            'Cache-Control': 'no-store',
          },
        });
      },
    },
  },
});

