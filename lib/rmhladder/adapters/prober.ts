import { ashbyBoardUrl } from './ashby';
import { greenhouseBoardUrl } from './greenhouse';
import { politeFetch } from './http';
import { leverPostingsUrl } from './lever';
import { smartRecruitersPostingsUrl } from './smartrecruiters';

type Platform = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';

// Company suffixes to strip — mirrors normalizeCompanyName's COMPANY_SUFFIXES regex.
const SLUG_SUFFIXES =
  /\b(incorporated|inc|llc|llp|lp|ltd|plc|corp|corporation|company|co|group|holdings|partners|management|capital markets)\b\.?/g;

/**
 * Produce a slug-ready word-list form of the company name.
 * Removes (not replaces) punctuation so H.I.G. → 'hig', not 'h i g'.
 */
function slugBase(companyName: string): string {
  const cleaned = companyName
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9 ]/g, '') // remove punctuation rather than replace with space
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = cleaned.replace(SLUG_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
  return stripped || cleaned;
}

/**
 * Generate ordered, deduped slug candidates for a company name.
 * Order: (1) spaces removed, (2) hyphenated, (3) first word only, (4) raw lowercase stripped.
 */
export function candidateSlugs(companyName: string): string[] {
  const base = slugBase(companyName); // e.g. 'jpmorgan chase', 'hig capital', 'stripe'

  const noSpaces = base.replace(/ /g, '');    // (1) 'jpmorganchase'
  const hyphenated = base.replace(/ /g, '-'); // (2) 'jpmorgan-chase'
  const firstWord = base.split(' ')[0];       // (3) 'jpmorgan'

  // (4) raw lowercase name stripped of non-alphanumerics before normalization
  const rawLower = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Dedupe preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of [noSpaces, hyphenated, firstWord, rawLower]) {
    if (c && !seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
  }
  return result;
}

/**
 * Probe a single slug on a platform's API board.
 * Returns { live: true, jobCount: N } when the board responds 200 with the expected shape.
 * Returns { live: false, jobCount: 0 } on non-200 or malformed JSON.
 */
export async function probeSlug(
  platform: Platform,
  slug: string,
  fetchImpl?: typeof fetch,
): Promise<{ live: boolean; jobCount: number }> {
  const DEAD = { live: false, jobCount: 0 };

  const url = (() => {
    switch (platform) {
      case 'greenhouse':    return greenhouseBoardUrl(slug);
      case 'lever':        return leverPostingsUrl(slug);
      case 'ashby':        return ashbyBoardUrl(slug);
      case 'smartrecruiters': return smartRecruitersPostingsUrl(slug);
    }
  })();

  const res = await politeFetch(url, { fetchImpl });
  if (!res.ok) return DEAD;

  let body: unknown;
  try {
    body = JSON.parse(res.body);
  } catch {
    return DEAD;
  }

  let arr: unknown[] | null = null;

  switch (platform) {
    case 'greenhouse':
    case 'ashby': {
      if (typeof body === 'object' && body !== null && 'jobs' in body) {
        const jobs = (body as Record<string, unknown>)['jobs'];
        if (Array.isArray(jobs)) arr = jobs;
      }
      break;
    }
    case 'lever': {
      if (Array.isArray(body)) arr = body;
      break;
    }
    case 'smartrecruiters': {
      if (typeof body === 'object' && body !== null && 'content' in body) {
        const content = (body as Record<string, unknown>)['content'];
        if (Array.isArray(content)) arr = content;
      }
      break;
    }
  }

  if (arr === null) return DEAD;
  return { live: true, jobCount: arr.length };
}
