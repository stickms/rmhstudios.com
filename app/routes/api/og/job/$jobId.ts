import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getJobDetail, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import { renderPageCard } from '@/lib/og/page-card.server';

const queriesPrisma = prisma as unknown as QueriesPrisma;

/** "Remote", "New York, NY", "London" — whatever the row actually knows. */
function placeLabel(job: Record<string, unknown>): string {
  const remote = job.remoteStatus as string | undefined;
  if (remote === 'remote') return 'Remote';
  const city = job.city as string | null;
  const state = job.state as string | null;
  const country = job.country as string | null;
  const local = [city, state].filter(Boolean).join(', ') || country || null;
  if (!local) return remote === 'hybrid' ? 'Hybrid' : 'On site';
  return remote === 'hybrid' ? `${local} · hybrid` : local;
}

/** "$120–145K", "$45/hr", or nothing when the posting didn't say. */
function payLabel(job: Record<string, unknown>): string | null {
  const min = job.compensationMin as number | null;
  const max = job.compensationMax as number | null;
  if (!min && !max) return null;
  const currency = (job.compensationCurrency as string | null) === 'USD' ? '$' : '';
  const interval = job.compensationInterval as string | null;
  const short = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
  const range = min && max && min !== max ? `${short(min)}–${short(max)}` : short(max ?? min ?? 0);
  const suffix = interval === 'hourly' ? '/hr' : interval === 'monthly' ? '/mo' : '';
  return `${currency}${range}${suffix}`;
}

/**
 * GET /api/og/job/$jobId — the Open Graph card for a verified Ladder job.
 *
 * A shared job link previewed as the site's generic image, so the one thing a
 * recipient needs — which role, at which company, where, for how much — was
 * only visible after the click. `getJobDetail` is reused rather than querying
 * around it, so the same visibility rules apply: an expired, unverified or
 * non-early-career posting 404s here exactly as it does on the page.
 */
export const Route = createFileRoute('/api/og/job/$jobId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const job = (await getJobDetail(queriesPrisma, null, params.jobId)) as Record<
          string,
          unknown
        > | null;
        if (!job) return new Response('Not found', { status: 404 });

        const company = ((job.company as { name?: string } | null)?.name ?? '').trim();
        const pay = payLabel(job);
        const updatedAt = job.updatedAt instanceof Date ? job.updatedAt.getTime() : 0;

        const png = await renderPageCard({
          cacheKey: `job:${params.jobId}:${updatedAt}`,
          eyebrow: 'RMH Ladder',
          title: String(job.title ?? 'Early-career role'),
          subtitle:
            (job.descriptionSummary as string | null) ||
            `Verified early-career opening${company ? ` at ${company}` : ''}, tracked by RMH Ladder.`,
          lead: company || null,
          path: `/rmhladder/jobs/${params.jobId}`,
          stats: [
            { value: placeLabel(job), label: 'location', lead: true },
            ...(pay ? [{ value: pay, label: 'pay' }] : []),
          ],
        });

        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400',
          },
        });
      }),
    },
  },
});
