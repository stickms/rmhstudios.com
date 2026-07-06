import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

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

async function fetchBoard(ctx: AdapterContext): Promise<AshbyJob[] | null> {
  const res = await politeFetch(ashbyBoardUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return null;
  try {
    const parsed: unknown = JSON.parse(res.body);
    if (typeof parsed === 'object' && parsed !== null && 'jobs' in parsed) {
      const jobs = (parsed as { jobs?: unknown }).jobs;
      return Array.isArray(jobs) ? (jobs as AshbyJob[]) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function normalize(raw: AshbyJob): NormalizedJob {
  const addressRegion = raw.address?.postalAddress?.addressRegion;
  const locality = raw.address?.postalAddress?.addressLocality ?? raw.location;
  const locationRaw = addressRegion && addressRegion !== locality ? `${locality}, ${addressRegion}` : locality;

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

  async discoverJobs(ctx) {
    const jobs = await fetchBoard(ctx);
    return (jobs ?? []).filter((j) => j.isListed).map(normalize);
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const board = await fetchBoard(ctx);
    const hit = board?.find((j) => j.id === job.externalId) ?? null;
    const loc = hit ? classifyUSLocation({ locationRaw: hit.location, country: hit.address?.postalAddress?.addressCountry ?? null }) : null;
    return {
      fetched: board !== null,
      httpStatus: board !== null ? 200 : 404,
      apiSource: true,
      companyMatch: board !== null,
      titleMatch: hit !== null && hit.title === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: Boolean(hit?.applyUrl),
      reqIdPresent: false,
      closedLanguage: false,
      blocked: false,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: hit?.location,
      platform: 'ashby',
    };
  },

  async detectExpired(ctx, externalId) {
    const board = await fetchBoard(ctx);
    if (board === null) return false; // fetch failure is NOT expiry evidence (3-strike rule is Plan 3)
    const job = board.find((j) => j.id === externalId);
    return job === undefined || job.isListed === false;
  },
};
