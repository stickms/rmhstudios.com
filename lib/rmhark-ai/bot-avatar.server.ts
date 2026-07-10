/**
 * Bot-user avatars — generate a custom portrait for an auto-posting bot with
 * xAI (Grok image API), store it as webp in object storage, and persist the URL
 * on the user's `image` field.
 *
 * Mirrors lib/personas/avatar.server.ts (the AI-persona chatbot avatar
 * generator) and lib/rmhark-ai/image.server.ts: same xAI client shape, the same
 * shared daily spend budget, and the same "return null on ANY failure" contract.
 * Bots are created with a deterministic DiceBear avatar as an immediate
 * fallback; this upgrades them to a unique generated portrait in the background
 * and never blocks (or breaks) bot creation if it fails.
 *
 * Server-only.
 */

import OpenAI from 'openai';
import { prisma } from '@/lib/prisma.server';
import { generatePersonaAvatarPrompt, isRmharkAIConfigured } from '@/lib/rmhark-ai/generate.server';
import { tryConsumeImageBudget } from '@/lib/rmhark-ai/image-budget.server';
import { validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { optimizeImage } from '@/lib/image-optimize';
import { putObject } from '@/lib/storage/s3.server';
import { userAvatarKey, userAvatarUrl } from '@/lib/storage/keys';

// xAI is OpenAI-SDK compatible; point the base URL at their endpoint.
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || '',
  baseURL: 'https://api.x.ai/v1',
  maxRetries: 1,
});

const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

// Square avatar — crisp in the feed, lists, and profile header without being
// expensive to store/serve.
const AVATAR_SIZE = 512;

/** True when an xAI key is set and the image kill switch is not engaged. */
export function isBotAvatarConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY) && process.env.XAI_IMAGE_ENABLED !== 'false';
}

export type BotAvatarIdentity = {
  /** The bot's display name. */
  name: string;
  /** Their short bio, used as the avatar "tagline". */
  bio?: string | null;
  /** The composed persona brief (theme + temperament + voice…). */
  persona: string;
};

/**
 * Build the text-to-image prompt. Prefers a DeepSeek-refined portrait prompt
 * (better likenesses from the persona), but falls back to a direct template so a
 * missing/failing DeepSeek key never blocks the avatar — xAI handles a plain
 * descriptive sentence fine.
 */
async function buildBotAvatarPrompt(identity: BotAvatarIdentity): Promise<string> {
  if (isRmharkAIConfigured()) {
    try {
      const refined = await generatePersonaAvatarPrompt({
        name: identity.name,
        tagline: identity.bio,
        systemPrompt: identity.persona,
      });
      if (refined.trim()) return refined.trim();
    } catch (err) {
      console.error('bot avatar prompt refine failed, using fallback:', err);
    }
  }
  const tagline = identity.bio ? `, ${identity.bio}` : '';
  return (
    `Square avatar portrait of a person${tagline}. ` +
    `${identity.persona.slice(0, 300)}. ` +
    `Centered head-and-shoulders, natural and believable, vibrant digital ` +
    `illustration, simple background, expressive, high detail. ` +
    `No text or words in the image. Not a robot.`
  );
}

/**
 * Generate an avatar for a bot user, store it, and persist `image` on the row.
 * Returns the URL on success or null on ANY failure (unconfigured, disabled,
 * over budget, API error, bad bytes, DB error) — failure is logged and
 * swallowed so it can never break bot creation. Safe to await or fire-and-forget.
 */
export async function generateBotAvatar(
  userId: string,
  identity: BotAvatarIdentity,
): Promise<string | null> {
  if (!isBotAvatarConfigured()) return null;

  try {
    const prompt = await buildBotAvatarPrompt(identity);
    if (!prompt.trim()) return null;

    // Reserve budget right before the paid call (shared global daily cap with
    // feed images + persona avatars). Not refunded on failure — counting
    // attempts keeps the cap a hard spend ceiling.
    if (!(await tryConsumeImageBudget())) return null;

    const res = await xai.images.generate({ model: XAI_IMAGE_MODEL, prompt, n: 1 });
    const url = res.data?.[0]?.url;
    if (!url) return null;

    const fetched = await fetch(url);
    if (!fetched.ok) return null;
    const raw = Buffer.from(await fetched.arrayBuffer());

    const validation = validateImageBuffer(raw);
    if (!validation.ok) return null;

    // Normalise to a square webp regardless of what xAI returned.
    const { buffer, contentType } = await optimizeImage(raw, {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      format: 'webp',
      quality: 82,
    });

    const filename = `bot-${userId}-${Date.now()}.webp`;
    await putObject(userAvatarKey(filename), buffer, contentType);
    const avatarUrl = userAvatarUrl(filename);

    // Persist. updateMany (not update) so a bot deleted mid-generation is a
    // no-op instead of a throw.
    await prisma.user.updateMany({ where: { id: userId }, data: { image: avatarUrl } });
    return avatarUrl;
  } catch (err) {
    console.error('generateBotAvatar failed:', err);
    return null;
  }
}
