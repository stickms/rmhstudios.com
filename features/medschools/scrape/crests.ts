/**
 * School crests (server/script side). Pure planning plus one fetch-and-convert step: Admit's `crest_url` for each
 * school is downloaded through a polite host and rasterised to a 96x96 WebP. The result is committed as a static file
 * (`public/images/medschools/crests/<slug>.webp`) and listed in `data/medschools/crests.json`; the site never calls
 * Admit for an image at request time. Run by `scripts/medschools/fetch-admit-crests.ts`.
 */
import sharp from 'sharp';
import type { PoliteClient } from './http';
import type { AdmitSchoolCrest } from './adapters/admit';
import type { RegistrySchool } from './registry';

export const CREST_SIZE = 96;
export const CREST_WEBP_QUALITY = 80;
export const CREST_MAX_BYTES = 2 * 1024 * 1024;

export interface CrestPlan {
  /** Registry slug -> the Admit crest to download. */
  jobs: Array<{ slug: string; admitSlug: string; url: string }>;
  /** Admit schools no registry school claims (and not deliberately ignored). */
  unmatched: string[];
  /** Matched schools Admit has no crest for. */
  noCrest: string[];
  /** Matched schools whose crest URL is unusable (not https). */
  badUrl: string[];
}

const keyOf = (s: RegistrySchool): string => s.aliases.find((a) => a.source === 'CYCLETRACK')?.sourceKey ?? s.shortName;

/** Maps each Admit school to a registry slug through the committed alias file (the same pairs the adapter uses). */
export function planCrests(input: {
  admit: AdmitSchoolCrest[];
  registry: RegistrySchool[];
  aliases: Array<{ cycletrackKey: string; admitSlug: string }>;
  ignoredSlugs: string[];
}): CrestPlan {
  const slugByCycletrack = new Map(input.registry.map((s) => [keyOf(s), s.slug]));
  const registrySlugByAdmit = new Map<string, string>();
  for (const a of input.aliases) {
    const slug = slugByCycletrack.get(a.cycletrackKey);
    if (slug) registrySlugByAdmit.set(a.admitSlug, slug);
  }
  const ignored = new Set(input.ignoredSlugs);
  const plan: CrestPlan = { jobs: [], unmatched: [], noCrest: [], badUrl: [] };
  const claimed = new Set<string>();
  for (const a of input.admit) {
    const slug = registrySlugByAdmit.get(a.slug);
    if (!slug) {
      if (!ignored.has(a.slug)) plan.unmatched.push(a.slug);
      continue;
    }
    if (claimed.has(slug)) continue;
    if (!a.crestUrl) {
      plan.noCrest.push(slug);
      continue;
    }
    if (!isHttps(a.crestUrl)) {
      plan.badUrl.push(slug);
      continue;
    }
    claimed.add(slug);
    plan.jobs.push({ slug, admitSlug: a.slug, url: a.crestUrl });
  }
  plan.jobs.sort((x, y) => x.slug.localeCompare(y.slug));
  return plan;
}

export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Rasterises an image (SVG or bitmap) to a square, transparent-padded WebP with no metadata. */
export async function toCrestWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { density: 384, limitInputPixels: 64_000_000 })
    .resize(CREST_SIZE, CREST_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: CREST_WEBP_QUALITY, effort: 6 })
    .toBuffer();
}

export type CrestFetchResult = { ok: true; webp: Buffer } | { ok: false; reason: string };

/**
 * Downloads one crest through a session already bound to the crest's own origin (the polite host refuses any other),
 * checks protocol, content type and size, then converts it. The polite client returns text, so only SVG (text) crests
 * are supported; a bitmap crest is reported and skipped rather than corrupted.
 */
export async function fetchCrest(session: PoliteClient, url: string): Promise<CrestFetchResult> {
  if (!isHttps(url)) return { ok: false, reason: 'not https' };
  let res;
  try {
    res = await session.get(url);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status || 'unavailable'}` };
  const type = (res.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (!type.startsWith('image/')) return { ok: false, reason: `content-type ${type || 'missing'}` };
  if (type !== 'image/svg+xml') return { ok: false, reason: `unsupported ${type} (text transport)` };
  const bytes = Buffer.from(res.body, 'utf8');
  if (bytes.length > CREST_MAX_BYTES) return { ok: false, reason: `too large (${bytes.length} bytes)` };
  if (!res.body.includes('<svg')) return { ok: false, reason: 'not an svg document' };
  try {
    return { ok: true, webp: await toCrestWebp(bytes) };
  } catch (e) {
    return { ok: false, reason: `convert: ${(e as Error).message}` };
  }
}
