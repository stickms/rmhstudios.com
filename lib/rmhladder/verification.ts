export interface VerificationEvidence {
  fetched: boolean;
  httpStatus?: number;
  apiSource: boolean;
  companyMatch: boolean;
  titleMatch: boolean;
  usConfirmed: boolean;
  applyPresent: boolean;
  reqIdPresent: boolean;
  closedLanguage: boolean;
  blocked: boolean;
  isSearchResultsPage: boolean;
  companyName: string;
  jobTitle: string;
  locationLabel?: string;
  platform: string;
}
export interface VerificationOutcome { status: string; confidence: number; evidence: string }

export function computeVerification(e: VerificationEvidence): VerificationOutcome {
  if (e.blocked) return out('blocked_or_inaccessible', 0, `Page on ${e.platform} is blocked by robots.txt/anti-bot; not scraped. URL preserved for manual review.`);
  if (e.closedLanguage) return out('expired', 95, `Posting for "${e.jobTitle}" at ${e.companyName} contains closed/no-longer-accepting language.`);
  if (!e.fetched) return out('broken_link', 0, `Fetch failed (HTTP ${e.httpStatus ?? 'n/a'}) for "${e.jobTitle}" at ${e.companyName}.`);
  if (e.isSearchResultsPage) return out('needs_manual_review', 30, `URL for "${e.jobTitle}" at ${e.companyName} resolves to a generic search/results page, not a posting.`);

  let confidence = 0;
  const parts: string[] = [];
  if (e.apiSource) { confidence += 40; parts.push(`official ${e.platform} API returned the posting`); }
  else { confidence += 20; parts.push(`page returned HTTP ${e.httpStatus ?? 200}`); }
  if (e.titleMatch) { confidence += 15; parts.push(`title matched "${e.jobTitle}"`); }
  if (e.companyMatch) { confidence += 10; parts.push(`page contained company name "${e.companyName}"`); }
  if (e.usConfirmed) { confidence += 15; parts.push(`location confirmed US${e.locationLabel ? ` (${e.locationLabel})` : ''}`); }
  if (e.applyPresent) { confidence += 10; parts.push('apply mechanism present'); }
  if (e.reqIdPresent) { confidence += 5; parts.push('requisition ID present'); }
  confidence += 5; parts.push('no expired/closed language detected'); // closedLanguage handled above
  confidence = Math.min(100, confidence);

  const evidence = `Verified because ${parts.join(', ')}.`;
  if (confidence >= 85) return { status: 'verified_active', confidence, evidence };
  if (confidence >= 60) return { status: 'verified_probable', confidence, evidence };
  return { status: 'needs_manual_review', confidence, evidence: `Low-confidence evidence: ${parts.join(', ')}.` };
}

const out = (status: string, confidence: number, evidence: string): VerificationOutcome => ({ status, confidence, evidence });

export function passesAlertGate(args: {
  status: string; confidence: number; isUS: boolean;
  earlyCareer: 'yes' | 'probable' | 'no' | 'unclear';
  finalRelevance: number; userThreshold: number;
  alreadyAlerted: boolean; blockedKeyword: boolean;
}): boolean {
  return (
    (args.status === 'verified_active' || args.status === 'verified_probable') &&
    args.confidence >= 75 &&
    args.isUS &&
    (args.earlyCareer === 'yes' || args.earlyCareer === 'probable') &&
    args.finalRelevance >= args.userThreshold &&
    !args.alreadyAlerted &&
    !args.blockedKeyword
  );
}
