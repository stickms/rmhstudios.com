export interface NormalizedJob {
  externalId: string;
  title: string;
  locationRaw: string;
  country: string | null;        // ISO-ish country string when the API provides one
  remoteHint: boolean;           // platform's own remote flag, when present
  postedAt: Date | null;
  absoluteUrl: string;           // canonical original posting URL
  applyUrl: string | null;
  descriptionHtml: string | null;
  requisitionId: string | null;
}
export interface AdapterContext { slug: string; companyName: string; fetchImpl?: typeof fetch; }
export interface SourceAdapter {
  platform: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';
  discoverJobs(ctx: AdapterContext): Promise<NormalizedJob[]>;
  verifyJob(ctx: AdapterContext, job: { externalId: string; title: string }): Promise<import('../verification').VerificationEvidence>;
  detectExpired(ctx: AdapterContext, externalId: string): Promise<boolean>;
}
