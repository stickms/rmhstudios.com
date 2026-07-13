import { parse } from 'node-html-parser';
import { createHash } from 'node:crypto';
import { classifyUSLocation } from '../classifiers/us-location';
import { classifyEarlyCareer } from '../classifiers/early-career';
import type { ProgramType } from '../classifiers/early-career';
import { computeBaseScore } from '../scoring';
import { dedupeHash, locationBucket, normalizeTitle } from '../normalize';
import { computeVerification } from '../verification';
import type { VerificationEvidence, VerificationStatus } from '../verification';
import type { NormalizedJob } from '../adapters/types';

// ── summarizeDescription ────────────────────────────────────────────────────

export function summarizeDescription(html: string | null): { summary: string | null; text: string } {
  if (html === null) return { summary: null, text: '' };
  const root = parse(html);
  const raw = root.textContent ?? '';
  // Collapse all whitespace sequences to a single space and trim
  const text = raw.replace(/\s+/g, ' ').trim();
  const summary = text.length > 0 ? text.slice(0, 500) : null;
  return { summary, text };
}

export function extractApplicationDeadline(text: string): Date | null {
  const match = text.match(
    /\b(?:application\s+deadline|apply\s+by|applications?\s+(?:close|due))\s*[:\-–]?\s*([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2}|20\d{2}-\d{2}-\d{2})\b/i,
  );
  if (!match) return null;
  const parsed = new Date(`${match[1]}${/^\d{4}-/.test(match[1]) ? 'T23:59:59' : ' 23:59:59'}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  return year >= 2000 && year <= 2100 ? parsed : null;
}

// ── Types ───────────────────────────────────────────────────────────────────

type ReviewReason = 'ambiguous_us_location' | 'ambiguous_early_career' | 'low_confidence';

const INTERN_PROGRAM_TYPES = new Set<ProgramType>([
  'internship', 'summer_analyst', 'summer_associate', 'mba',
]);

export interface JobAssessmentFields {
  title: string;
  normalizedTitle: string;
  programType: ProgramType;
  locationRaw: string;
  city: string | null;
  state: string | null;
  country: string | null;
  remoteStatus: 'onsite' | 'hybrid' | 'remote_us';
  employmentType: 'internship' | 'full_time';
  postingDate: Date | null;
  applicationDeadline: Date | null;
  sourcePlatform: string;
  sourceUrl: string;
  originalPostingUrl: string;
  canonicalApplyUrl: string | null;
  externalRequisitionId: string | null;
  externalId: string | null;
  descriptionSummary: string | null;
  descriptionText: string;
  fullDescription: string | null;
  contentHash: string;
  earlyCareerScore: number;
  earlyCareerClassification: 'yes' | 'probable' | 'no' | 'unclear';
  usLocationConfidence: number;
  relevanceScoreBase: number;
  urgencyFlag: boolean;
  graduationYearTarget: number | null;
  schoolYearTarget: string | null;
  // verification outcome
  verificationStatus: VerificationStatus;
  verificationConfidence: number;
  verificationEvidence: string;
}

export interface JobAssessment {
  dedupeHash: string;
  fields: JobAssessmentFields;
  verificationInput: VerificationEvidence;
  reviewReasons: ReviewReason[];
}

// ── assessJob ───────────────────────────────────────────────────────────────

export function assessJob(args: {
  normalized: NormalizedJob;
  companyName: string;
  companyId: string;
  companyPriority: number;
  platform: string;
  evidence: VerificationEvidence;
}): JobAssessment {
  const { normalized, companyName, companyPriority, platform, evidence } = args;
  const reviewReasons: ReviewReason[] = [];

  // 1. Parse description
  const { summary: descriptionSummary, text } = summarizeDescription(normalized.descriptionHtml);
  const applicationDeadline = normalized.applicationDeadline ?? extractApplicationDeadline(text);

  // 2. Classify US location
  const locationResult = classifyUSLocation({
    locationRaw: normalized.locationRaw,
    country: normalized.country,
  });

  if (locationResult.isUS === null) {
    reviewReasons.push('ambiguous_us_location');
  }

  // 3. Determine effective remoteStatus: only remote_us when isUS === true
  let effectiveRemoteStatus = locationResult.remoteStatus;
  if (effectiveRemoteStatus === 'remote_us' && locationResult.isUS !== true) {
    effectiveRemoteStatus = 'onsite';
  }

  // 4. Classify early career
  const ecResult = classifyEarlyCareer(normalized.title, text);

  if (ecResult.classification === 'unclear') {
    reviewReasons.push('ambiguous_early_career');
  }

  // When classification is 'no', null out the graduation/school targets
  const graduationYearTarget = ecResult.classification === 'no' ? null : ecResult.graduationYearTarget;
  const schoolYearTarget = ecResult.classification === 'no' ? null : ecResult.schoolYearTarget;

  // 5. Build enriched evidence — assessJob is authoritative on usConfirmed
  const enrichedEvidence: VerificationEvidence = {
    ...evidence,
    usConfirmed: locationResult.isUS === true,
  };

  // 6. Run verification
  const outcome = computeVerification(enrichedEvidence);

  // 7. Determine final verification status and confidence
  const isNonUS = locationResult.isUS === false;
  const finalStatus: VerificationStatus = isNonUS ? 'non_us_role' : outcome.status;
  const finalConfidence = isNonUS ? locationResult.confidence : outcome.confidence;

  // 8. low_confidence: add only when not the non_us_role override case
  if (!isNonUS && outcome.confidence < 60) {
    reviewReasons.push('low_confidence');
  }

  // 9. Scoring — companyIsTarget when priority <= 2
  const companyIsTarget = companyPriority <= 2;
  const isUS = locationResult.isUS === true;

  const scorableJob = {
    programType: ecResult.programType,
    isUS,
    remoteStatus: effectiveRemoteStatus,
    city: locationResult.city,
    postingDate: normalized.postedAt,
    applicationDeadline,
    companyPriority,
    companyIsTarget,
    title: normalized.title,
  };

  const { score: relevanceScoreBase, urgencyFlag } = computeBaseScore(scorableJob);

  // 10. Dedupe hash — bucket uses effective remoteStatus (already downgraded)
  const bucket = locationBucket({
    city: locationResult.city,
    state: locationResult.state,
    remoteStatus: effectiveRemoteStatus,
  });
  const hash = dedupeHash(companyName, normalized.title, bucket);

  // 11. employmentType: internship for the four program types, else full_time
  const employmentType: 'internship' | 'full_time' =
    INTERN_PROGRAM_TYPES.has(ecResult.programType) ? 'internship' : 'full_time';

  // Item 2b: country semantics — 'US' only when confirmed US; non-US keeps real code; ambiguous → null.
  const country = locationResult.isUS === true ? 'US' : (normalized.country?.toUpperCase() ?? null);

  // Item 5: when overriding to non_us_role, replace evidence with a descriptive message.
  const locationLabel = normalized.locationRaw || normalized.country;
  const verificationEvidence = isNonUS
    ? `Location classified non-US (${locationLabel}) — excluded from US pipeline.`
    : outcome.evidence;

  const contentHash = createHash('sha256')
    .update(JSON.stringify({
      title: normalized.title,
      location: normalized.locationRaw,
      description: text,
      applyUrl: normalized.applyUrl,
      requisitionId: normalized.requisitionId,
    }))
    .digest('hex');

  const fields: JobAssessmentFields = {
    title: normalized.title,
    normalizedTitle: normalizeTitle(normalized.title),
    programType: ecResult.programType,
    locationRaw: normalized.locationRaw,
    city: locationResult.city,
    state: locationResult.state,
    country,
    remoteStatus: effectiveRemoteStatus,
    employmentType,
    postingDate: normalized.postedAt,
    applicationDeadline,
    sourcePlatform: platform,
    sourceUrl: normalized.absoluteUrl,
    originalPostingUrl: normalized.absoluteUrl,
    canonicalApplyUrl: normalized.applyUrl,
    externalRequisitionId: normalized.requisitionId,
    externalId: normalized.externalId,
    descriptionSummary,
    descriptionText: text,
    fullDescription: normalized.descriptionHtml,
    contentHash,
    earlyCareerScore: ecResult.score,
    earlyCareerClassification: ecResult.classification,
    usLocationConfidence: locationResult.confidence,
    relevanceScoreBase,
    urgencyFlag,
    graduationYearTarget,
    schoolYearTarget,
    verificationStatus: finalStatus,
    verificationConfidence: finalConfidence,
    verificationEvidence,
  };

  return {
    dedupeHash: hash,
    fields,
    verificationInput: enrichedEvidence,
    reviewReasons,
  };
}
