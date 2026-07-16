export interface NormalizedJob {
  externalId: string;
  title: string;
  locationRaw: string;
  country: string | null;        // ISO-ish country string when the API provides one
  remoteHint: boolean;           // platform's own remote flag, when present
  postedAt: Date | null;
  applicationDeadline?: Date | null;
  absoluteUrl: string;           // canonical original posting URL
  applyUrl: string | null;
  descriptionHtml: string | null;
  requisitionId: string | null;
}
export interface DiscoverResult {
  jobs: NormalizedJob[];
  /** True iff the board was fetched AND parsed successfully — including a successful empty board. False on HTTP/network/parse failure or a partial fetch. */
  fetchSucceeded: boolean;
}
export interface AdapterContext {
  slug: string;
  companyName: string;
  /** Public career-site URL. Required by adapters, such as Workday, whose host cannot be derived from a tenant slug. */
  sourceUrl?: string | null;
  fetchImpl?: typeof fetch;
}
export interface SourceAdapter {
  platform: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workday';
  discoverJobs(ctx: AdapterContext): Promise<DiscoverResult>;
  verifyJob(ctx: AdapterContext, job: { externalId: string; title: string }): Promise<import('../verification').VerificationEvidence>;
  detectExpired(ctx: AdapterContext, externalId: string): Promise<boolean>;
}
