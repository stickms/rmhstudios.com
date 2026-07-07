import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

export const smartRecruitersPostingsUrl = (slug: string, offset = 0) =>
  `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${offset}`;

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

async function fetchBoard(ctx: AdapterContext): Promise<{ jobs: SrJob[] | null; status: number; totalFound: number }> {
  const aggregated: SrJob[] = [];
  let totalFound = 0;
  let status = 200;
  let offset = 0;
  const hardCap = 500;

  while (aggregated.length < hardCap) {
    const res = await politeFetch(smartRecruitersPostingsUrl(ctx.slug, offset), { fetchImpl: ctx.fetchImpl });

    if (!res.ok) {
      // If the first page fails, return null; otherwise return what we have so far
      if (offset === 0) {
        return { jobs: null, status: res.status, totalFound: 0 };
      }
      break;
    }

    try {
      const parsed: unknown = JSON.parse(res.body);
      if (typeof parsed === 'object' && parsed !== null) {
        const data = parsed as SrPostingsResponse;
        // Capture totalFound from the first page
        if (offset === 0) {
          totalFound = data.totalFound ?? 0;
          status = res.status;
        }
        const content = data.content;
        if (Array.isArray(content)) {
          aggregated.push(...(content as SrJob[]));
        } else {
          // If content is not an array on first page, return null
          if (offset === 0) {
            return { jobs: null, status: res.status, totalFound: 0 };
          }
          break;
        }
      } else {
        if (offset === 0) {
          return { jobs: null, status: res.status, totalFound: 0 };
        }
        break;
      }
    } catch {
      if (offset === 0) {
        return { jobs: null, status: res.status, totalFound: 0 };
      }
      break;
    }

    // Stop if we've reached totalFound or aggregated >= hardCap
    if (aggregated.length >= totalFound || aggregated.length >= hardCap) {
      break;
    }

    offset += 100;
  }

  return { jobs: aggregated.length > 0 ? aggregated : null, status, totalFound };
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
    const { jobs } = await fetchBoard(ctx);
    return (jobs ?? []).map((job) => normalize(job, ctx));
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const { jobs, status } = await fetchBoard(ctx);
    const hit = jobs?.find((j) => j.id === job.externalId) ?? null;
    const normalized = hit ? normalize(hit, ctx) : null;
    const loc = normalized ? classifyUSLocation({ locationRaw: normalized.locationRaw, country: normalized.country }) : null;
    return {
      fetched: jobs !== null,
      httpStatus: status,
      apiSource: true,
      companyMatch: jobs !== null,
      titleMatch: hit !== null && hit.name === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: hit !== null, // the hosted jobs.smartrecruiters.com page always carries the apply flow
      reqIdPresent: Boolean(hit?.refNumber),
      closedLanguage: false,
      blocked: status === 403 || status === 429,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: normalized?.locationRaw,
      platform: 'smartrecruiters',
    };
  },

  async detectExpired(ctx, externalId) {
    const { jobs, totalFound } = await fetchBoard(ctx);
    if (totalFound === 0) return false; // empty board is not expiry evidence
    if (jobs === null) return false; // fetch failure is NOT expiry evidence (3-strike rule is Plan 3)
    return !jobs.some((j) => j.id === externalId);
  },
};
