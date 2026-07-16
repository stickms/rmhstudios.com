import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, DiscoverResult, NormalizedJob, SourceAdapter } from './types';

export const ashbyBoardUrl = (slug: string) =>
  `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`;

interface AshbyJob {
  id: string;
  title: string;
  location: string;
  secondaryLocations?: string[];
  isRemote: boolean;
  isListed: boolean;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string | null;
  descriptionHtml?: string | null;
  address?: {
    postalAddress?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  };
}

async function fetchBoard(ctx: AdapterContext): Promise<{ jobs: AshbyJob[] | null; status: number }> {
  const res = await politeFetch(ashbyBoardUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return { jobs: null, status: res.status };
  try {
    const parsed: unknown = JSON.parse(res.body);
    if (typeof parsed === 'object' && parsed !== null && 'jobs' in parsed) {
      const jobs = (parsed as { jobs?: unknown }).jobs;
      return { jobs: Array.isArray(jobs) ? (jobs as AshbyJob[]) : null, status: res.status };
    }
    return { jobs: null, status: res.status };
  } catch {
    return { jobs: null, status: res.status };
  }
}

function normalize(raw: AshbyJob): NormalizedJob {
  const addressRegion = raw.address?.postalAddress?.addressRegion;
  const locationRaw = addressRegion && addressRegion !== raw.location ? `${raw.location}, ${addressRegion}` : raw.location;

  return {
    externalId: raw.id,
    title: raw.title,
    locationRaw,
    country: raw.address?.postalAddress?.addressCountry ?? null,
    remoteHint: raw.isRemote === true,
    postedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
    absoluteUrl: raw.jobUrl,
    applyUrl: raw.applyUrl ?? null,
    descriptionHtml: raw.descriptionHtml ?? null,
    requisitionId: null,
  };
}

export const ashbyAdapter: SourceAdapter = {
  platform: 'ashby',

  async discoverJobs(ctx): Promise<DiscoverResult> {
    const { jobs } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).filter((j) => j.isListed).map(normalize), fetchSucceeded: jobs !== null };
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const { jobs, status } = await fetchBoard(ctx);
    const hit = jobs?.find((j) => j.id === job.externalId) ?? null;
    const normalized = hit ? normalize(hit) : null;
    const loc = normalized ? classifyUSLocation({ locationRaw: normalized.locationRaw, country: normalized.country }) : null;
    return {
      fetched: jobs !== null,
      httpStatus: status,
      apiSource: true,
      companyMatch: jobs !== null,
      titleMatch: hit !== null && hit.title === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: Boolean(hit?.applyUrl),
      reqIdPresent: false,
      closedLanguage: false,
      blocked: status === 403 || status === 429,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: hit?.location,
      platform: 'ashby',
    };
  },

  async detectExpired(ctx, externalId) {
    const { jobs } = await fetchBoard(ctx);
    if (jobs === null) return false; // fetch failure is NOT expiry evidence (3-strike rule is Plan 3)
    const job = jobs.find((j) => j.id === externalId);
    return job === undefined || job.isListed === false;
  },
};
