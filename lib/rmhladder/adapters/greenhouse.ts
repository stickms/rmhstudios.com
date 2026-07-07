import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

export const greenhouseBoardUrl = (slug: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

interface GhJob {
  id: number;
  title: string;
  first_published?: string;
  updated_at?: string;
  requisition_id?: string | null;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
}

async function fetchBoard(ctx: AdapterContext): Promise<{ jobs: GhJob[] | null; status: number }> {
  const res = await politeFetch(greenhouseBoardUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return { jobs: null, status: res.status };
  try {
    const parsed = JSON.parse(res.body) as { jobs?: unknown };
    const jobs = parsed.jobs;
    return { jobs: Array.isArray(jobs) ? (jobs as GhJob[]) : null, status: res.status };
  } catch {
    return { jobs: null, status: res.status };
  }
}

function normalize(raw: GhJob): NormalizedJob {
  const locationRaw = raw.location?.name ?? '';
  return {
    externalId: String(raw.id),
    title: raw.title,
    locationRaw,
    country: null,
    remoteHint: /\bremote\b/i.test(locationRaw),
    postedAt: raw.first_published ? new Date(raw.first_published) : raw.updated_at ? new Date(raw.updated_at) : null,
    absoluteUrl: raw.absolute_url,
    applyUrl: null, // greenhouse absolute_url IS the apply page
    descriptionHtml: raw.content ?? null,
    requisitionId: raw.requisition_id ?? null,
  };
}

export const greenhouseAdapter: SourceAdapter = {
  platform: 'greenhouse',

  async discoverJobs(ctx) {
    const { jobs } = await fetchBoard(ctx);
    return (jobs ?? []).map(normalize);
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const { jobs, status } = await fetchBoard(ctx);
    const hit = jobs?.find((j) => String(j.id) === job.externalId) ?? null;
    const loc = hit ? classifyUSLocation({ locationRaw: hit.location?.name ?? '' }) : null;
    return {
      fetched: jobs !== null,
      httpStatus: status,
      apiSource: true,
      companyMatch: jobs !== null, // the board itself is company-scoped
      titleMatch: hit !== null && hit.title === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: hit !== null, // every greenhouse posting page carries the apply form
      reqIdPresent: Boolean(hit?.requisition_id),
      closedLanguage: false,
      blocked: status === 403 || status === 429,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: hit?.location?.name,
      platform: 'greenhouse',
    };
  },

  async detectExpired(ctx, externalId) {
    const { jobs } = await fetchBoard(ctx);
    if (jobs === null) return false; // fetch failure is NOT expiry evidence (3-strike rule is Plan 3)
    return !jobs.some((j) => String(j.id) === externalId);
  },
};
