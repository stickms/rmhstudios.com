/**
 * AI-persona avatars — generate a custom portrait for a persona with xAI (Grok
 * image API), store it as webp in object storage, and persist the URL on the
 * persona row.
 *
 * Mirrors lib/rmhark-ai/image.server.ts (the feed-image generator): same xAI
 * client shape, the same shared daily spend budget, and the same "return null
 * on ANY failure" contract — a failed avatar must never block persona creation.
 * The persona is created first; this runs in the background and fills in
 * `avatarUrl` when it succeeds (the UI falls back to the emoji until then).
 *
 * Server-only.
 */

import OpenAI from 'openai';
import { prisma } from '@/lib/prisma.server';
import {
  generatePersonaAvatarPrompt,
  isRmharkAIConfigured,
} from '@/lib/rmhark-ai/generate.server';
import { tryConsumeImageBudget } from '@/lib/rmhark-ai/image-budget.server';
import { validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { optimizeImage } from '@/lib/image-optimize';
import { putObject } from '@/lib/storage/s3.server';
import { personaAvatarKey, personaAvatarUrl } from '@/lib/storage/keys';

// xAI is OpenAI-SDK compatible; point the base URL at their endpoint.
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || '',
  baseURL: 'https://api.x.ai/v1',
  maxRetries: 1,
});

// Cheapest xAI image model by default ($0.02/image), shared with the feed
// generator's default so the same env override applies to both.
const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

// Square avatar; small enough to stay cheap to store/serve, large enough to
// look crisp in chat headers and lists.
const AVATAR_SIZE = 512;

type PersonaIdentity = {
  name: string;
  tagline?: string | null;
  systemPrompt: string;
};

/** True when a key is set and the image kill switch is not engaged. */
export function isPersonaAvatarConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY) && process.env.XAI_IMAGE_ENABLED !== 'false';
}

/**
 * Build the text-to-image prompt for the avatar. Prefers a DeepSeek-refined
 * portrait prompt (better images from a chatbot's instructions), but falls back
 * to a direct template so a missing/failing DeepSeek key never blocks the
 * avatar — xAI handles a plain descriptive sentence fine.
 */
async function buildAvatarPrompt(persona: PersonaIdentity): Promise<string> {
  if (isRmharkAIConfigured()) {
    try {
      const refined = await generatePersonaAvatarPrompt(persona);
      if (refined.trim()) return refined.trim();
    } catch (err) {
      console.error('persona avatar prompt refine failed, using fallback:', err);
    }
  }
  const tagline = persona.tagline ? `, ${persona.tagline}` : '';
  return (
    `Square avatar portrait of ${persona.name}${tagline}. ` +
    `${persona.systemPrompt.slice(0, 300)}. ` +
    `Centered head-and-shoulders, vibrant digital illustration, simple background, ` +
    `expressive, high detail. No text or words in the image.`
  );
}

/**
 * Generate an avatar for a persona, store it, and persist `avatarUrl` on the
 * row. Returns the URL on success or null on ANY failure (unconfigured,
 * disabled, over budget, API error, bad bytes, DB error) — failure is logged
 * and swallowed so it can never break persona creation. Safe to fire-and-forget.
 */
export async function generatePersonaAvatar(
  personaId: string,
  persona: PersonaIdentity,
): Promise<string | null> {
  if (!isPersonaAvatarConfigured()) return null;

  try {
    const prompt = await buildAvatarPrompt(persona);
    if (!prompt.trim()) return null;

    // Reserve budget right before the paid call (shared global daily cap with
    // feed images). Not refunded on failure — counting attempts keeps the cap a
    // hard spend ceiling.
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

    const filename = `${personaId}-${Date.now()}.webp`;
    await putObject(personaAvatarKey(filename), buffer, contentType);
    const avatarUrl = personaAvatarUrl(filename);

    // Persist. updateMany (not update) so a persona deleted mid-generation is a
    // no-op instead of a throw.
    await prisma.aiPersona.updateMany({ where: { id: personaId }, data: { avatarUrl } });
    return avatarUrl;
  } catch (err) {
    console.error('generatePersonaAvatar failed:', err);
    return null;
  }
}
