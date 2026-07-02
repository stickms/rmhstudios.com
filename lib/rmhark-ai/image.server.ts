/**
 * RMHark AI — server-side IMAGE generation via xAI (Grok image API).
 *
 * Single choke point used by both the bot-worker and the human composer route.
 * Flow: post text -> DeepSeek visual prompt -> xAI images.generate -> download
 * the JPG -> validate -> re-host into feed storage -> return a feedImageUrl.
 *
 * Returns null on ANY failure (unconfigured, disabled, over budget, API error,
 * bad bytes) so a failed image can never block a post. Server-only.
 */

import OpenAI from 'openai';
import { generateImagePrompt } from './generate.server';
import { tryConsumeImageBudget } from './image-budget.server';
import { validateImageBuffer, detectImageExt } from '@/lib/slice-it/upload-validation';
import { putObject } from '@/lib/storage/s3.server';
import {
  feedImageKey,
  feedImageUrl,
  contentTypeForFilename,
  withImageDimensions,
} from '@/lib/storage/keys';
import { imageDimensions } from '@/lib/image-optimize';

// xAI is OpenAI-SDK compatible; just point the base URL at their endpoint.
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || '',
  baseURL: 'https://api.x.ai/v1',
  maxRetries: 1,
});

// Cheapest xAI image model by default ($0.02/image). Override only if needed.
const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

/** True when a key is set and the kill switch is not engaged. */
export function isImageGenConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY) && process.env.XAI_IMAGE_ENABLED !== 'false';
}

/**
 * Generate an image for a post and return a feed image URL, or null on any
 * failure. The stored filename is prefixed with `userId` so the result passes
 * ownsFeedImageUrl on the human create path.
 */
export async function generatePostImage(opts: {
  text: string;
  userId: string;
}): Promise<string | null> {
  if (!isImageGenConfigured()) return null;

  try {
    const prompt = await generateImagePrompt(opts.text);
    if (!prompt.trim()) return null;

    // Reserve budget right before the paid call. If we're at the cap, stop.
    // Deliberately NOT refunded if the call below fails: counting attempts
    // (not just successes) keeps the daily cap a hard spend ceiling and avoids
    // a refund race across the web + bot-worker processes.
    if (!(await tryConsumeImageBudget())) return null;

    const res = await xai.images.generate({ model: XAI_IMAGE_MODEL, prompt, n: 1 });
    const url = res.data?.[0]?.url;
    if (!url) return null;

    const fetched = await fetch(url);
    if (!fetched.ok) return null;
    const buffer = Buffer.from(await fetched.arrayBuffer());

    const validation = validateImageBuffer(buffer);
    if (!validation.ok) return null;
    const ext = detectImageExt(buffer);
    if (!ext) return null;

    // Tag the stored filename with the image's pixel dimensions so the feed can
    // reserve exact layout space before it loads (avoids layout shift).
    const dims = await imageDimensions(buffer);
    const filename = withImageDimensions(
      `${opts.userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`,
      dims?.width,
      dims?.height,
    );
    await putObject(feedImageKey(filename), buffer, contentTypeForFilename(filename));
    return feedImageUrl(filename);
  } catch (err) {
    console.error('generatePostImage failed:', err);
    return null;
  }
}
