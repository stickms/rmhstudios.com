import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

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

async function fetchBoard(ctx: AdapterContext): Promise<LeverJob[] | null> {
  const res = await politeFetch(leverPostingsUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return null;
  try {
    return (JSON.parse(res.body) as LeverJob[]) ?? [];
  } catch {
    return null;
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

  async discoverJobs(ctx) {
    const jobs = await fetchBoard(ctx);
    return (jobs ?? []).map(normalize);
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const board = await fetchBoard(ctx);
    const hit = board?.find((j) => j.id === job.externalId) ?? null;
    const loc = hit ? classifyUSLocation({ locationRaw: hit.categories?.location ?? '', country: hit.country ?? null }) : null;
    return {
      fetched: board !== null,
      httpStatus: board !== null ? 200 : 404,
      apiSource: true,
      companyMatch: board !== null,
      titleMatch: hit !== null && hit.text === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: Boolean(hit?.applyUrl),
      reqIdPresent: false,
      closedLanguage: false,
      blocked: false,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: hit?.categories?.location,
      platform: 'lever',
    };
  },

  async detectExpired(ctx, externalId) {
    const board = await fetchBoard(ctx);
    if (board === null) return false;
    return !board.some((j) => j.id === externalId);
  },
};
