/**
 * RMHVibe — server-side generation logic.
 *
 * Turns a user prompt into a self-contained HTML page via DeepSeek (OpenAI-compatible),
 * persists it as a VibePage, and supports collaborative "customize" follow-ups that
 * replay the full conversation history so the model keeps context.
 *
 * Server-only (`.server.ts`) — uses process.env and the Prisma client.
 */

import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma.server';

export type VibeMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const VIBE_SYSTEM_PROMPT = `You are a creative web designer. Given a user's prompt, generate a complete, self-contained single-page HTML document that visually captures the vibe of their request.

Rules:
- Use only inline styles and a <style> block — no external stylesheets or scripts
- Make it visually striking: bold typography, colors, layout that fits the theme
- Include real readable content that matches the prompt (text, sections, fake data if helpful)
- Add subtle CSS animations where they enhance the vibe (no JS needed)
- The page should look finished, not like a template
- Respond ONLY with a JSON object: { "slug": "<2-4 word kebab slug>", "html": "<full HTML string>" }
- Keep the slug under 32 chars and relevant to the prompt
- Speed over perfection — it can be customized later`;

export type VibeGeneration = { slug: string; html: string };

/**
 * Call DeepSeek to (re)generate a vibe page. `history` carries prior turns for
 * "customize" follow-ups so the model understands the existing page.
 */
export async function generateVibePage(
  prompt: string,
  history: VibeMessage[] = [],
): Promise<VibeGeneration> {
  const messages: VibeMessage[] = [
    { role: 'system', content: VIBE_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: prompt },
  ];

  const res = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages,
    temperature: 1.0,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error('DeepSeek returned an empty response');

  const parsed = JSON.parse(raw) as { slug?: unknown; html?: unknown };
  if (typeof parsed.html !== 'string' || !parsed.html.trim()) {
    throw new Error('DeepSeek response missing html');
  }

  return {
    slug: typeof parsed.slug === 'string' ? parsed.slug : '',
    html: parsed.html,
  };
}

/** Normalise a model-suggested slug to our rules; empty string if unusable. */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

/** Find a unique slug, retrying with a short random suffix on collision. */
async function uniqueSlug(suggested: string): Promise<string> {
  let base = slugify(suggested);
  if (!base) base = nanoid(8).toLowerCase();

  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 24)}-${nanoid(6).toLowerCase()}`;
    const existing = await prisma.vibePage.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
  // Last resort: a fully random slug is effectively guaranteed unique.
  return nanoid(10).toLowerCase();
}

/**
 * Generate a brand-new vibe page from a prompt and persist it.
 * Returns the slug to redirect to.
 */
export async function createVibePage(prompt: string): Promise<string> {
  const { slug: suggestedSlug, html } = await generateVibePage(prompt);
  const slug = await uniqueSlug(suggestedSlug || prompt);

  const conversationHistory: VibeMessage[] = [
    { role: 'user', content: prompt },
    { role: 'assistant', content: JSON.stringify({ slug, html }) },
  ];

  await prisma.vibePage.create({
    data: { slug, prompt, html, conversationHistory },
  });

  return slug;
}

export async function getVibePage(slug: string) {
  return prisma.vibePage.findUnique({ where: { slug } });
}

/**
 * Apply a customization to an existing page: replay history, regenerate, and
 * persist the new HTML. Last write wins. Returns the updated HTML.
 */
export async function customizeVibePage(slug: string, newPrompt: string): Promise<string> {
  const page = await prisma.vibePage.findUnique({ where: { slug } });
  if (!page) throw new Error('Vibe page not found');

  const history = (page.conversationHistory as VibeMessage[]) ?? [];
  const { html } = await generateVibePage(newPrompt, history);

  const conversationHistory: VibeMessage[] = [
    ...history,
    { role: 'user', content: newPrompt },
    { role: 'assistant', content: JSON.stringify({ slug, html }) },
  ];

  await prisma.vibePage.update({
    where: { slug },
    data: { html, conversationHistory },
  });

  return html;
}
