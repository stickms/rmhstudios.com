/**
 * Build store covers — generate wide, custom-aspect-ratio promotional key-art
 * for a game/app/build with xAI (Grok image API), crop it to the target ratio,
 * compress to WebP, and store it on the CDN.
 *
 * Mirrors lib/personas/avatar.server.ts (same xAI client shape, same
 * "return null on ANY failure" contract). Deliberately idempotent: it skips the
 * paid generation when a cover already exists in object storage unless `force`
 * is set, so it never re-spams xAI for the same build — see
 * scripts/generate-build-covers.ts for the batch runner.
 *
 * Server-only (imports sharp + S3).
 */

import OpenAI from 'openai';
import sharp from 'sharp';
import { validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { putObject, objectExists, s3Configured } from '@/lib/storage/s3.server';
import { buildCoverKey, buildCoverUrl } from '@/lib/storage/keys';
import { type BuildCoverRatio } from '@/lib/builds/cover-manifest';

// xAI is OpenAI-SDK compatible; point the base URL at their endpoint.
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || '',
  baseURL: 'https://api.x.ai/v1',
  maxRetries: 1,
});

const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

/** Target pixel dimensions per ratio. Generous enough to look crisp on the
 *  storefront hero/wide cards; WebP keeps the bytes small. */
export const BUILD_COVER_DIMENSIONS: Record<BuildCoverRatio, { width: number; height: number }> = {
  wide: { width: 1600, height: 900 }, // 16:9 — hero + wide mosaic tiles
  ultrawide: { width: 1600, height: 686 }, // ~21:9 — full-bleed banners
};

/** True when an xAI key is set and the image kill switch is not engaged. */
export function isBuildCoverConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY) && process.env.XAI_IMAGE_ENABLED !== 'false';
}

export type BuildCoverInput = {
  id: string;
  title: string;
  description: string;
  tags?: string[];
};

/** A descriptive, text-free key-art prompt derived from the build's metadata. */
function buildCoverPrompt(build: BuildCoverInput): string {
  const tags = build.tags?.length ? ` Themes: ${build.tags.slice(0, 6).join(', ')}.` : '';
  return (
    `Cinematic wide promotional key art / hero banner for "${build.title}". ` +
    `${build.description}${tags} ` +
    `Dramatic lighting, rich detail, vivid colour, dynamic composition with empty ` +
    `negative space toward one side for overlay. No text, no words, no letters, ` +
    `no logos, no watermark, no UI elements — illustration only.`
  );
}

/**
 * Generate (or reuse) a wide cover for a build and return its public CDN URL,
 * or null on any failure / when not applicable.
 *
 * Idempotent: if the object already exists it is NOT regenerated unless
 * `force` is true — this is the "only once per build" guard. Requires a CDN
 * origin (VITE_CDN_BASE_URL); without one there is nowhere to serve covers from
 * and the function returns null.
 */
export async function generateBuildCover(opts: {
  build: BuildCoverInput;
  ratio?: BuildCoverRatio;
  force?: boolean;
}): Promise<string | null> {
  const ratio: BuildCoverRatio = opts.ratio ?? 'wide';
  if (!isBuildCoverConfigured()) return null;

  const publicUrl = buildCoverUrl(opts.build.id, ratio);
  const key = buildCoverKey(opts.build.id, ratio);

  try {
    // Idempotency: skip the paid call when the cover already exists.
    if (!opts.force && (await objectExists(key))) return publicUrl;

    const prompt = buildCoverPrompt(opts.build);
    const res = await xai.images.generate({ model: XAI_IMAGE_MODEL, prompt, n: 1 });
    const url = res.data?.[0]?.url;
    if (!url) return null;

    const fetched = await fetch(url);
    if (!fetched.ok) return null;
    const raw = Buffer.from(await fetched.arrayBuffer());

    const validation = validateImageBuffer(raw);
    if (!validation.ok) return null;

    // Crop-cover to the exact target ratio (xAI's API ignores size hints), then
    // compress to WebP. `attention` keeps the most salient region in frame.
    const { width, height } = BUILD_COVER_DIMENSIONS[ratio];
    const buffer = await sharp(raw)
      .resize(width, height, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 80 })
      .toBuffer();

    await putObject(key, buffer, 'image/webp');
    return publicUrl;
  } catch (err) {
    console.error(`generateBuildCover failed for ${opts.build.id} (${ratio}):`, err);
    return null;
  }
}

// Process-local memo of covers known to exist (id:ratio → public URL) and the
// set of generations currently in flight, so repeat loads don't re-HEAD or
// double-fire. Survives for the life of the server process.
const coverUrlCache = new Map<string, string>();
const coverInFlight = new Set<string>();

/**
 * Resolve wide covers for a set of builds on demand. Returns a map of
 * buildId → public cover URL for covers that already exist; for builds that
 * don't have one yet it fires generation in the background (bounded per call)
 * and omits them — the storefront falls back to the thumbnail until the next
 * load. Idempotent (generates each build/ratio at most once) and a no-op when
 * xAI or object storage isn't configured, so it adds zero overhead by default.
 */
export async function resolveBuildCovers(
  builds: BuildCoverInput[],
  opts: { ratio?: BuildCoverRatio; maxGeneratePerCall?: number } = {},
): Promise<Record<string, string>> {
  const ratio: BuildCoverRatio = opts.ratio ?? 'wide';
  const result: Record<string, string> = {};
  if (!isBuildCoverConfigured() || !s3Configured()) return result;

  // Fill from cache; collect the rest to existence-check in one parallel pass.
  const unknown: BuildCoverInput[] = [];
  for (const b of builds) {
    const cached = coverUrlCache.get(`${b.id}:${ratio}`);
    if (cached) result[b.id] = cached;
    else unknown.push(b);
  }

  const checked = await Promise.all(
    unknown.map(async (b) => {
      try {
        return { b, exists: await objectExists(buildCoverKey(b.id, ratio)) };
      } catch {
        return { b, exists: false };
      }
    }),
  );

  let budget = opts.maxGeneratePerCall ?? 4;
  for (const { b, exists } of checked) {
    const ck = `${b.id}:${ratio}`;
    if (exists) {
      const url = buildCoverUrl(b.id, ratio);
      coverUrlCache.set(ck, url);
      result[b.id] = url;
      continue;
    }
    // Missing → generate once, in the background, bounded per call.
    if (budget > 0 && !coverInFlight.has(ck)) {
      budget--;
      coverInFlight.add(ck);
      void generateBuildCover({ build: b, ratio })
        .then((url) => {
          if (url) coverUrlCache.set(ck, url);
        })
        .catch(() => {})
        .finally(() => coverInFlight.delete(ck));
    }
  }
  return result;
}
