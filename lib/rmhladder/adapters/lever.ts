import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, DiscoverResult, NormalizedJob, SourceAdapter } from './types';

export const leverPostingsUrl = (slug: string) =>
  `https://api.lever.co/v0/postings/${slug}?mode=json`;

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string };
  country?: string;
  workplaceType?: string;
  description?: string;
}

async function fetchBoard(
  ctx: AdapterContext,
): Promise<{ jobs: LeverJob[] | null; status: number }> {
  const res = await politeFetch(leverPostingsUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return { jobs: null, status: res.status };
  try {
    const parsed: unknown = JSON.parse(res.body);
    return { jobs: Array.isArray(parsed) ? (parsed as LeverJob[]) : null, status: res.status };
  } catch {
    return { jobs: null, status: res.status };
  }
}

function normalize(raw: LeverJob): NormalizedJob {
  const locationRaw = raw.categories?.location ?? '';
  return {
    externalId: raw.id,
    title: raw.text,
    locationRaw,
    country: raw.country ?? null,
    remoteHint: raw.workplaceType === 'remote',
    postedAt: raw.createdAt ? new Date(raw.createdAt) : null,
    absoluteUrl: raw.hostedUrl,
    applyUrl: raw.applyUrl ?? null,
    descriptionHtml: raw.description ?? null,
    requisitionId: null,
  };
}

export const leverAdapter: SourceAdapter = {
  platform: 'lever',

  async discoverJobs(ctx): Promise<DiscoverResult> {
    const { jobs } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).map(normalize), fetchSucceeded: jobs !== null };
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const { jobs, status } = await fetchBoard(ctx);
    const hit = jobs?.find((j) => j.id === job.externalId) ?? null;
    const loc = hit
      ? classifyUSLocation({
          locationRaw: hit.categories?.location ?? '',
          country: hit.country ?? null,
        })
      : null;
    return {
      fetched: jobs !== null,
      httpStatus: status,
      apiSource: true,
      companyMatch: jobs !== null,
      titleMatch: hit !== null && hit.text === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: Boolean(hit?.applyUrl),
      reqIdPresent: false,
      closedLanguage: false,
      blocked: status === 403 || status === 429,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: hit?.categories?.location,
      platform: 'lever',
    };
  },

  async detectExpired(ctx, externalId) {
    const { jobs } = await fetchBoard(ctx);
    if (jobs === null) return false;
    return !jobs.some((j) => j.id === externalId);
  },
};
