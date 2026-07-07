import { parse as parseHtml } from 'node-html-parser';
import { normalizeTitle } from '../normalize';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import { checkRobots } from './robots';

const CLOSED_LANGUAGE =
  /no longer accepting applications|position (has been )?(filled|closed)|posting (has )?expired|job is no longer available|applications? (are )?closed/i;
const APPLY_MARKERS = /apply now|apply for this|submit (your )?application|start application|\bapply\b/i;
const REQ_ID_MARKERS = /job id|requisition|req(?:uisition)? ?(id|number|#)|posting number|R-\d{3,}|REQ-?\d{3,}|\b\d{4}-[A-Z]{2,}-\d{2,}\b/i;
const SEARCH_MARKERS = /search results|\d+ (jobs|openings|positions) found|filter by/i;

export async function verifyGenericUrl(args: {
  url: string;
  companyName: string;
  jobTitle: string;
  fetchImpl?: typeof fetch;
}): Promise<VerificationEvidence> {
  const base: VerificationEvidence = {
    fetched: false, httpStatus: undefined, apiSource: false, companyMatch: false,
    titleMatch: false, usConfirmed: false, applyPresent: false, reqIdPresent: false,
    closedLanguage: false, blocked: false, isSearchResultsPage: false,
    companyName: args.companyName, jobTitle: args.jobTitle, platform: 'generic',
  };

  // Reject non-http(s) URLs before any fetch
  try {
    const u = new URL(args.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return base;
    }
  } catch {
    return base;
  }

  const allowed = await checkRobots(args.url, args.fetchImpl);
  if (!allowed) return { ...base, blocked: true };

  const res = await politeFetch(args.url, { fetchImpl: args.fetchImpl });
  if (res.status === 403 || res.status === 429) return { ...base, httpStatus: res.status, blocked: true };
  if (!res.ok) return { ...base, httpStatus: res.status };

  const root = parseHtml(res.body);
  const text = root.textContent ?? '';
  const lower = text.toLowerCase();

  // title match: ≥60% of normalized title tokens present in page text
  const tokens = normalizeTitle(args.jobTitle).split(' ').filter((t) => t.length > 1);
  const hitCount = tokens.filter((t) => lower.includes(t)).length;
  const titleMatch = tokens.length > 0 && hitCount / tokens.length >= 0.6;

  const jobLinkCount = root.querySelectorAll('a').filter((a) => /job|career|posting|position/i.test(a.getAttribute('href') ?? '')).length;
  const isSearchResultsPage = SEARCH_MARKERS.test(text) || (jobLinkCount >= 10 && !titleMatch) || (jobLinkCount >= 10 && /[?&]q=/.test(args.url));

  return {
    ...base,
    fetched: true,
    httpStatus: res.status,
    companyMatch: lower.includes(args.companyName.toLowerCase()),
    titleMatch,
    usConfirmed: false, // generic pages: US-ness comes from the job record's own location fields, not page scraping
    applyPresent: APPLY_MARKERS.test(text),
    reqIdPresent: REQ_ID_MARKERS.test(text),
    closedLanguage: CLOSED_LANGUAGE.test(text),
    isSearchResultsPage,
  };
}
