import type { ProgramType } from './classifiers/early-career';

export interface ScorableJob {
  programType: ProgramType;
  roleCategory?: string | null;
  industry?: string | null;
  isUS: boolean;
  remoteStatus: 'onsite' | 'hybrid' | 'remote_us';
  city?: string | null;
  postingDate?: Date | null;
  applicationDeadline?: Date | null;
  companyPriority: number;
  companyIsTarget: boolean;
  title: string;
}
export interface UserScoringContext {
  keywords: Array<{ keyword: string; weight: number; type: 'boost' | 'block' }>;
  watchlistCompanyIds: Set<string>;
  companyId: string;
  preferredCities: string[];
}

const PROGRAM_WEIGHTS: Partial<Record<ProgramType, number>> = {
  summer_analyst: 30, summer_associate: 25, internship: 25, analyst_program: 25,
  new_grad: 25, rotational_program: 25, leadership_development: 18, entry_level: 15, mba: 15,
};
const INDUSTRY_WEIGHTS: Array<[RegExp, number, string]> = [
  [/investment banking/i, 30, 'industry:investment_banking'],
  [/corporate (banking|strategy|development)/i, 25, 'industry:corporate'],
  [/consult/i, 20, 'industry:consulting'],
  [/product management|product/i, 20, 'industry:product'],
  [/markets|sales & trading|trading/i, 18, 'industry:markets'],
  [/asset management|wealth/i, 18, 'industry:asset_management'],
  [/risk/i, 18, 'industry:risk'],
  [/business analyst|business operations/i, 20, 'industry:business'],
];
const TITLE_PENALTIES: Array<[RegExp, number]> = [
  [/\bvp\b|vice president/i, 60], [/\bdirector\b/i, 50], [/\bprincipal\b/i, 50],
  [/\bsenior\b(?! year)/i, 25], [/\bmanager\b/i, 20],
];
const DAY = 86_400_000;

export const DEFAULT_RELEVANCE_RULES = [
  { key: 'geo:us', label: 'US-based role', weight: 20 },
  { key: 'geo:remote_us', label: 'Remote US role', weight: 15 },
  { key: 'program:summer_analyst', label: 'Summer Analyst', weight: 30 },
  { key: 'program:internship', label: 'Internship', weight: 25 },
  { key: 'program:analyst_program', label: 'Analyst Program', weight: 25 },
  { key: 'program:new_grad', label: 'New Grad', weight: 25 },
  { key: 'company:target', label: 'Target company match', weight: 20 },
  { key: 'recency:7d', label: 'Posted within 7 days', weight: 15 },
  { key: 'deadline:14d', label: 'Deadline within 14 days', weight: 10 },
  { key: 'user:watchlist', label: 'Watchlisted company', weight: 20 },
  { key: 'user:city', label: 'Preferred city', weight: 10 },
];

/** The one place the 0-100 clamp happens: persist/compare only this value. */
export const finalRelevance = (base: number, boost: number): number =>
  Math.max(0, Math.min(100, base + boost));

/**
 * Returns an UNCLAMPED base score (can exceed 100 when weights stack).
 * Callers must combine with the user boost via finalRelevance(base, boost);
 * never store or threshold-compare the raw base.
 */
export function computeBaseScore(job: ScorableJob, now = new Date()): { score: number; urgencyFlag: boolean } {
  let score = 0;
  if (job.isUS) score += job.remoteStatus === 'remote_us' ? 15 : 20;
  score += PROGRAM_WEIGHTS[job.programType] ?? 0;
  // title included deliberately: fallback industry classification when adapters leave industry null
  const haystack = `${job.industry ?? ''} ${job.roleCategory ?? ''} ${job.title}`;
  const industryHit = INDUSTRY_WEIGHTS.find(([re]) => re.test(haystack));
  if (industryHit) score += industryHit[1];
  if (job.companyIsTarget) score += 20;
  if (job.postingDate && now.getTime() - job.postingDate.getTime() <= 7 * DAY) score += 15;
  let urgencyFlag = false;
  if (job.applicationDeadline) {
    const until = job.applicationDeadline.getTime() - now.getTime();
    if (until >= 0 && until <= 14 * DAY) { score += 10; urgencyFlag = true; }
  }
  for (const [re, w] of TITLE_PENALTIES) if (re.test(job.title)) score -= w;
  return { score: Math.max(0, score), urgencyFlag };
}

export function computeUserBoost(
  job: ScorableJob,
  ctx: UserScoringContext,
): { boost: number; matched: string[]; blocked: boolean } {
  const haystack = `${job.title} ${job.industry ?? ''} ${job.roleCategory ?? ''}`.toLowerCase();
  const matched: string[] = [];
  let boost = 0;
  for (const k of ctx.keywords) {
    if (!haystack.includes(k.keyword.toLowerCase())) continue;
    // matched may be non-empty here; consumers must ignore it when blocked is true
    if (k.type === 'block') return { boost: 0, matched, blocked: true };
    matched.push(k.keyword);
    boost += k.weight;
  }
  if (ctx.watchlistCompanyIds.has(ctx.companyId)) boost += 20;
  if (job.city && ctx.preferredCities.some((c) => c.toLowerCase() === job.city!.toLowerCase())) boost += 10;
  return { boost, matched, blocked: false };
}
