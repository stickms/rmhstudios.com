import { createHash } from 'node:crypto';

// /g regex: only safe with .replace() — .test()/.exec() would be stateful via lastIndex.
const COMPANY_SUFFIXES =
  /\b(incorporated|inc|llc|llp|lp|ltd|plc|corp|corporation|company|co|group|holdings|partners|management|capital markets)\b\.?/g;

export function normalizeCompanyName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = cleaned.replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
  // Guard: "Partners Group" would strip to nothing — fall back to the pre-suffix form.
  return stripped || cleaned;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]|\(r-?\d+\)|\br-?\d{4,}\b/g, ' ') // req-id noise
    .replace(/['']/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function locationBucket(input: {
  city?: string | null;
  state?: string | null;
  remoteStatus?: 'onsite' | 'hybrid' | 'remote_us';
}): string {
  if (input.remoteStatus === 'remote_us') return 'remote-us';
  const city = input.city?.trim().toLowerCase();
  const state = input.state?.trim().toLowerCase();
  if (city && state) return `${city}-${state}`;
  if (state) return state;
  return 'us';
}

export function dedupeHash(company: string, title: string, bucket: string): string {
  const key = `${normalizeCompanyName(company)}|${normalizeTitle(title)}|${bucket}`;
  return createHash('sha256').update(key).digest('hex');
}
