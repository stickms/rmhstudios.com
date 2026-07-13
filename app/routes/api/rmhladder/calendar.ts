import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

function icsDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export const Route = createFileRoute('/api/rmhladder/calendar')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const applications = await prisma.ladderApplication.findMany({
          where: { userId: session.user.id },
          include: { job: { include: { company: true } } },
        });
        const events: string[] = [];
        const add = (uid: string, start: Date, summary: string, description: string) => {
          events.push([
            'BEGIN:VEVENT',
            `UID:${icsText(uid)}@rmhstudios.com`,
            `DTSTAMP:${icsDate(new Date())}`,
            `DTSTART:${icsDate(start)}`,
            `SUMMARY:${icsText(summary)}`,
            `DESCRIPTION:${icsText(description)}`,
            'END:VEVENT',
          ].join('\r\n'));
        };
        for (const application of applications) {
          const label = `${application.job.title} at ${application.job.company.name}`;
          if (application.followUpDate) add(`followup-${application.id}`, application.followUpDate, `Follow up: ${label}`, application.notes ?? 'RMHLadder follow-up reminder');
          for (const [index, interview] of application.interviewDates.entries()) {
            add(`interview-${application.id}-${index}`, interview, `Interview: ${label}`, 'RMHLadder interview reminder');
          }
          if (application.job.applicationDeadline) {
            add(`deadline-${application.job.id}`, application.job.applicationDeadline, `Deadline: ${label}`, application.job.originalPostingUrl);
          }
        }
        const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RMH Studios//RMHLadder//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
        return new Response(calendar, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="rmhladder-calendar.ics"',
            'Cache-Control': 'no-store',
          },
        });
      },
    },
  },
});
