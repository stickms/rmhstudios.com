import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

export const smartRecruitersPostingsUrl = (slug: string) =>
  `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;

export const smartRecruitersJobUrl = (slug: string, id: string) =>
  `https://jobs.smartrecruiters.com/${slug}/${id}`;

interface SrJob {
  id: string;
  uuid?: string;
  name: string;
  refNumber?: string | null;
  releasedDate?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
  };
  company?: {
    identifier?: string;
    name?: string;
  };
}

interface SrPostingsResponse {
  totalFound?: number;
  content?: unknown;
}

async function fetchBoard(ctx: AdapterContext): Promise<SrJob[] | null> {
  const res = await politeFetch(smartRecruitersPostingsUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return null;
  try {
    const parsed: unknown = JSON.parse(res.body);
    if (typeof parsed === 'object' && parsed !== null) {
      const data = parsed as SrPostingsResponse;
      const content = data.content;
      return Array.isArray(content) ? (content as SrJob[]) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function normalize(raw: SrJob, ctx: AdapterContext): NormalizedJob {
  const city = raw.location?.city ?? '';
  const region = raw.location?.region;
  const locationRaw = region ? `${city}, ${region}` : city;
  const countryRaw = raw.location?.country;
  const country = countryRaw ? countryRaw.toUpperCase() : null;

  return {
    externalId: raw.id,
    title: raw.name,
    locationRaw,
    country,
    remoteHint: raw.location?.remote === true,
    postedAt: raw.releasedDate ? new Date(raw.releasedDate) : null,
    absoluteUrl: smartRecruitersJobUrl(ctx.slug, raw.id),
    applyUrl: null,
    descriptionHtml: null,
    requisitionId: raw.refNumber ?? null,
  };
}

export const smartRecruitersAdapter: SourceAdapter = {
  platform: 'smartrecruiters',

  async discoverJobs(ctx) {
    const jobs = await fetchBoard(ctx);
    return (jobs ?? []).map((job) => normalize(job, ctx));
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const board = await fetchBoard(ctx);
    const hit = board?.find((j) => j.id === job.externalId) ?? null;
    const normalized = hit ? normalize(hit, ctx) : null;
    const loc = normalized ? classifyUSLocation({ locationRaw: normalized.locationRaw, country: normalized.country }) : null;
    return {
      fetched: board !== null,
      httpStatus: board !== null ? 200 : 404,
      apiSource: true,
      companyMatch: board !== null,
      titleMatch: hit !== null && hit.name === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: hit !== null, // the hosted jobs.smartrecruiters.com page always carries the apply flow
      reqIdPresent: Boolean(hit?.refNumber),
      closedLanguage: false,
      blocked: false,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: normalized?.locationRaw,
      platform: 'smartrecruiters',
    };
  },

  async detectExpired(ctx, externalId) {
    const board = await fetchBoard(ctx);
    if (board === null) return false; // fetch failure is NOT expiry evidence (3-strike rule is Plan 3)
    return !board.some((j) => j.id === externalId);
  },
};
