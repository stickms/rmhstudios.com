import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { parse as parseHtml } from 'node-html-parser';
import { politeFetch } from './http';
import type { AdapterContext, DiscoverResult, NormalizedJob, SourceAdapter } from './types';

const PAGE_SIZE = 20; // Workday CXS rejects larger page sizes.
const HARD_CAP = 2_000;

export interface WorkdaySourceConfig {
  origin: string;
  tenant: string;
  site: string;
}

interface WorkdayPosting {
  title?: unknown;
  externalPath?: unknown;
  locationsText?: unknown;
  postedOn?: unknown;
  remoteType?: unknown;
  bulletFields?: unknown;
}

interface WorkdayBoardResponse {
  total?: unknown;
  jobPostings?: unknown;
}

interface WorkdayBoardResult {
  jobs: WorkdayPosting[] | null;
  status: number;
  total: number;
}

/** Parse a public `*.myworkdayjobs.com/<site>` career URL into CXS coordinates. */
export function parseWorkdaySource(value: string): WorkdaySourceConfig | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.myworkdayjobs\.com$/.test(host)
  ) {
    return null;
  }

  const tenant = host.split('.')[0];
  const segments = url.pathname.split('/').filter(Boolean);
  if (/^[a-z]{2}-[a-z]{2}$/i.test(segments[0] ?? '')) segments.shift();
  const site = segments[0];
  if (!tenant || !site || !/^[A-Za-z0-9_-]+$/.test(site)) return null;

  return { origin: url.origin, tenant, site };
}

export function workdayBoardUrl(config: WorkdaySourceConfig): string {
  return `${config.origin}/wday/cxs/${encodeURIComponent(config.tenant)}/${encodeURIComponent(config.site)}/jobs`;
}

/** Stable source identity: one Workday tenant can expose several distinct sites. */
export function workdaySourceSlug(config: WorkdaySourceConfig): string {
  return `${config.tenant}:${config.site}`;
}

export function discoverWorkdaySourceUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();

  const add = (candidate: string): void => {
    const config = parseWorkdaySource(candidate);
    if (config) urls.add(`${config.origin}/${encodeURIComponent(config.site)}`);
  };

  // 1. Anchor hrefs (resolves relative URLs against the page).
  const root = parseHtml(html);
  for (const anchor of root.querySelectorAll('a')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    try {
      add(new URL(href, pageUrl).toString());
    } catch {
      // ignore unparseable href
    }
  }

  // 2. Absolute *.myworkdayjobs.com URLs embedded anywhere in the HTML
  //    (scripts, JSON config, iframes, meta-refresh). parseWorkdaySource is the
  //    trust boundary — junk and lookalike hosts are rejected there.
  const EMBEDDED = /https?:\/\/[a-z0-9.-]+\.myworkdayjobs\.com\/[A-Za-z0-9/_-]+/gi;
  for (const match of html.match(EMBEDDED) ?? []) {
    add(match);
  }

  return [...urls];
}

export async function probeWorkdaySourceUrl(
  sourceUrl: string,
  fetchImpl?: typeof fetch,
): Promise<{ live: boolean; jobCount: number }> {
  const config = parseWorkdaySource(sourceUrl);
  if (!config) return { live: false, jobCount: 0 };
  const res = await politeFetch(workdayBoardUrl(config), {
    fetchImpl,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
    },
  });
  if (!res.ok) return { live: false, jobCount: 0 };
  try {
    const body = JSON.parse(res.body) as WorkdayBoardResponse;
    if (
      !Number.isInteger(body.total) ||
      (body.total as number) < 0 ||
      !Array.isArray(body.jobPostings)
    ) {
      return { live: false, jobCount: 0 };
    }
    return { live: true, jobCount: body.total as number };
  } catch {
    return { live: false, jobCount: 0 };
  }
}

function resolveConfig(ctx: AdapterContext): WorkdaySourceConfig | null {
  if (ctx.sourceUrl) {
    const fromUrl = parseWorkdaySource(ctx.sourceUrl);
    if (fromUrl) return fromUrl;
  }
  return parseWorkdaySource(ctx.slug);
}

function validPosting(value: WorkdayPosting): value is WorkdayPosting & {
  title: string;
  externalPath: string;
} {
  return (
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    typeof value.externalPath === 'string' &&
    value.externalPath.startsWith('/job/')
  );
}

async function fetchBoard(ctx: AdapterContext): Promise<WorkdayBoardResult> {
  const config = resolveConfig(ctx);
  if (!config) return { jobs: null, status: 0, total: 0 };

  const jobs: WorkdayPosting[] = [];
  let total = 0;
  let status = 200;

  while (jobs.length < HARD_CAP) {
    const res = await politeFetch(workdayBoardUrl(config), {
      fetchImpl: ctx.fetchImpl,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appliedFacets: {},
          limit: PAGE_SIZE,
          offset: jobs.length,
          searchText: '',
        }),
      },
    });
    status = res.status;
    if (!res.ok) return { jobs: null, status, total };

    let data: WorkdayBoardResponse;
    try {
      data = JSON.parse(res.body) as WorkdayBoardResponse;
    } catch {
      return { jobs: null, status, total };
    }

    if (
      !Number.isInteger(data.total) ||
      (data.total as number) < 0 ||
      !Array.isArray(data.jobPostings)
    ) {
      return { jobs: null, status, total };
    }

    total = data.total as number;
    const page = data.jobPostings as WorkdayPosting[];
    jobs.push(...page);
    if (page.length === 0 || jobs.length >= total) break;
  }

  // Never use an incomplete board as absence evidence.
  if (jobs.length < total) return { jobs: null, status, total };
  return { jobs, status, total };
}

function normalize(
  raw: WorkdayPosting & { title: string; externalPath: string },
  config: WorkdaySourceConfig,
): NormalizedJob {
  const locationRaw = typeof raw.locationsText === 'string' ? raw.locationsText : '';
  const remoteType = typeof raw.remoteType === 'string' ? raw.remoteType : '';
  const bullets = Array.isArray(raw.bulletFields)
    ? raw.bulletFields.filter((field): field is string => typeof field === 'string')
    : [];
  const publicBase = `${config.origin}/${encodeURIComponent(config.site)}`;
  const absoluteUrl = `${publicBase}${raw.externalPath}`;
  const country = /\b(?:USA|United States(?: of America)?)\b/i.test(locationRaw) ? 'US' : null;

  return {
    externalId: raw.externalPath,
    title: raw.title,
    locationRaw,
    country,
    remoteHint: /\bremote\b/i.test(`${remoteType} ${locationRaw}`),
    // CXS list responses expose relative labels ("Posted Today"), not a stable timestamp.
    postedAt: null,
    absoluteUrl,
    applyUrl: absoluteUrl,
    // Workday list responses do not expose the full description, but their
    // bullet fields often contain requisition/program metadata useful to the
    // deterministic classifier until a detail enrichment pass is available.
    descriptionHtml: bullets.length ? bullets.join('\n') : null,
    requisitionId: bullets[0] ?? null,
  };
}

export const workdayAdapter: SourceAdapter = {
  platform: 'workday',

  async discoverJobs(ctx): Promise<DiscoverResult> {
    const config = resolveConfig(ctx);
    if (!config) return { jobs: [], fetchSucceeded: false };
    const { jobs } = await fetchBoard(ctx);
    return {
      jobs: (jobs ?? []).filter(validPosting).map((job) => normalize(job, config)),
      fetchSucceeded: jobs !== null,
    };
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const config = resolveConfig(ctx);
    const { jobs, status } = config ? await fetchBoard(ctx) : { jobs: null, status: 0 };
    const hit =
      jobs?.filter(validPosting).find((candidate) => candidate.externalPath === job.externalId) ??
      null;
    const normalized = hit && config ? normalize(hit, config) : null;
    const location = normalized
      ? classifyUSLocation({ locationRaw: normalized.locationRaw, country: normalized.country })
      : null;

    return {
      fetched: jobs !== null,
      httpStatus: status,
      apiSource: true,
      companyMatch: jobs !== null,
      titleMatch: hit !== null && hit.title === job.title,
      usConfirmed: location?.isUS === true,
      applyPresent: hit !== null,
      reqIdPresent: Boolean(normalized?.requisitionId),
      closedLanguage: false,
      blocked: status === 403 || status === 429,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: normalized?.locationRaw,
      platform: 'workday',
    };
  },

  async detectExpired(ctx, externalId) {
    const { jobs, total } = await fetchBoard(ctx);
    if (jobs === null || total === 0) return false;
    return !jobs.some((job) => job.externalPath === externalId);
  },
};
