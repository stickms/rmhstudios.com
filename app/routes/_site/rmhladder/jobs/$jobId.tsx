import { createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { JobDetail } from '@/components/rmhladder/JobDetail';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getJobDetail, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import { setJobAction, type ActionsPrisma } from '@/lib/rmhladder/server/actions';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { jobPostingSchema, jsonLdScript } from '@/lib/schema';
import { safeExternalUrl } from '@/components/rmhladder/url';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;
const jobIdSchema = z.object({ jobId: z.string().min(1).max(200) });
const actionSchema = jobIdSchema.extend({ action: z.enum(['saved', 'applied', 'ignored']).nullable() });

const fetchJob = createServerFn({ method: 'GET' })
  .validator((input: unknown) => jobIdSchema.parse(input))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers }).catch(() => null);
    const job = await getJobDetail(queriesPrisma, session?.user?.id ?? null, data.jobId);
    if (!job) throw notFound();
    return { job, isAuthenticated: Boolean(session?.user) };
  });

const updateTracking = createServerFn({ method: 'POST' })
  .validator((input: unknown) => actionSchema.parse(input))
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    if (!session?.user) {
      throw redirect({ to: '/login', search: { callbackURL: `/rmhladder/jobs/${data.jobId}` } });
    }
    return setJobAction(actionsPrisma, session.user.id, data.jobId, data.action);
  });

export const Route = createFileRoute('/_site/rmhladder/jobs/$jobId')({
  loader: ({ params }) => fetchJob({ data: params }),
  head: ({ loaderData, params }) => {
    const job = loaderData?.job;
    if (!job) {
      return {
        meta: [
          { title: 'Job unavailable | RMH Ladder' },
          { name: 'robots', content: 'noindex, nofollow' },
        ],
      };
    }
    const path = `/rmhladder/jobs/${params.jobId}`;
    const companyName = ((job.company as { name?: string } | null)?.name) ?? 'Company';
    const description = (job.descriptionSummary as string | null) ||
      `${job.title as string} at ${companyName}, verified by RMH Ladder.`;
    return {
      meta: buildMeta({
        title: `${job.title as string} | RMH Ladder`,
        description,
        path,
      }),
      links: [buildCanonical(path)],
      scripts: [jsonLdScript(jobPostingSchema({
        id: job.id as string,
        title: job.title as string,
        description,
        companyName,
        path,
        sourceUrl: safeExternalUrl(job.originalPostingUrl) ?? undefined,
        datePosted: job.postingDate ? new Date(job.postingDate as Date).toISOString() : undefined,
        validThrough: job.applicationDeadline ? new Date(job.applicationDeadline as Date).toISOString() : undefined,
        employmentType: job.employmentType ? String(job.employmentType).toUpperCase() : undefined,
        city: job.city as string | undefined,
        region: job.state as string | undefined,
        remote: job.remoteStatus === 'remote_us',
      }))],
    };
  },
  component: JobDetailPage,
});

function JobDetailPage() {
  const { job, isAuthenticated } = Route.useLoaderData();
  const router = useRouter();
  return (
    <JobDetail
      job={job}
      isAuthenticated={isAuthenticated}
      onAction={async (action) => {
        await updateTracking({ data: { jobId: job.id as string, action } });
        await router.invalidate();
      }}
    />
  );
}
