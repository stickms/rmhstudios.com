/**
 * RMHVibe — server-side generation logic.
 *
 * Turns a user prompt into a self-contained, INTERACTIVE HTML page via DeepSeek's
 * reasoning model (deepseek-reasoner), streaming the model's chain-of-thought
 * ("thinking") and the resulting HTML back to the caller. Persists the result as a
 * VibePage and supports collaborative "customize" follow-ups that replay the full
 * conversation history so the model keeps context.
 *
 * Server-only (`.server.ts`) — uses process.env and the Prisma client.
 */

import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma.server';
import type { VibeStreamEvent } from '@/lib/rmhvibe/vibe-types';

export type VibeMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

// deepseek-reasoner is the "thinking" model: it streams reasoning_content (the
// chain-of-thought) alongside the final answer. It does not support
// response_format/json mode, so we use a plain text protocol and parse it.
const VIBE_MODEL = 'deepseek-reasoner';

const VIBE_SYSTEM_PROMPT = `You are a world-class creative web developer and designer. Given a user's prompt, build a COMPLETE, polished, self-contained, INTERACTIVE single-page HTML document that captures the vibe of their request. Take your reasoning time to plan the layout, content, and interactions before writing — the result must look like a finished, shippable product, never a rough draft.

Hard requirements:
- Output a full HTML document: <!DOCTYPE html> … </html>, with <meta name="viewport" content="width=device-width, initial-scale=1">.
- Everything inline: a <style> block and <script> block(s). No external stylesheets, scripts, fonts, or image URLs. You may use emoji, inline SVG, and CSS gradients for all visuals.
- FINISHED, not a skeleton: every section must be fully built out with real, specific, readable copy that fits the theme. No "lorem ipsum", no empty placeholders, no "coming soon", no TODOs, no cut-off sections.

Design bar (treat as a checklist):
- A cohesive color palette and a clear typographic hierarchy (distinct heading/body sizes and weights).
- Deliberate spacing, alignment, and rhythm; generous padding; nothing cramped or overlapping.
- Depth and polish where it fits the vibe: gradients, shadows, borders, hover states, smooth transitions.
- A complete page structure appropriate to the prompt (e.g. hero + several rich content sections + footer), not a single bare element.
- Fully responsive: looks great on mobile and desktop (use flex/grid, clamp(), media queries).

Interactivity (make it feel alive):
- Use vanilla JavaScript for real interactions: clicks, hovers, drag, keyboard input, scroll effects, animations, generative visuals, tiny games, or dynamic content that rewards exploration.
- Interactions must actually work and be discoverable.

Respond in EXACTLY this format, with no extra commentary before or after:
SLUG: <2-4 word kebab-case slug, max 32 chars, relevant to the prompt>
TITLE: <a catchy page title, max 60 chars>
DESCRIPTION: <one enticing sentence describing the page for social sharing, max 160 chars>
===HTML===
<the full HTML document>`;

/** Parse the model's "SLUG/TITLE/DESCRIPTION … ===HTML=== …" response. */
function parseVibeOutput(raw: string): {
  slug: string;
  title: string;
  description: string;
  html: string;
} {
  const MARKER = '===HTML===';
  const idx = raw.indexOf(MARKER);

  const head = idx !== -1 ? raw.slice(0, idx) : raw;
  let html = idx !== -1 ? raw.slice(idx + MARKER.length) : raw;

  const field = (name: string) => {
    const m = head.match(new RegExp(`${name}:\\s*(.+)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const slug = field('SLUG');
  const title = field('TITLE');
  const description = field('DESCRIPTION');

  if (idx === -1) {
    // Fallback: model skipped the marker — strip any leading metadata lines.
    html = raw.replace(/^\s*(SLUG|TITLE|DESCRIPTION):.*(\r?\n)/gi, '');
  }

  // Strip any markdown code fences the model may have added.
  html = html
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  return { slug, title, description, html };
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
  return nanoid(10).toLowerCase();
}

export async function getVibePage(slug: string) {
  return prisma.vibePage.findUnique({ where: { slug } });
}

/**
 * Stream generation of a vibe page. If `slug` is provided, this is a "customize"
 * follow-up against the existing page (replays its history); otherwise a brand-new
 * page is created. Yields thinking/content deltas, then a final `done` event after
 * the page has been persisted.
 */
export async function* generateVibeStream(opts: {
  prompt: string;
  slug?: string;
}): AsyncGenerator<VibeStreamEvent> {
  let history: VibeMessage[] = [];
  let existingSlug: string | undefined;

  if (opts.slug) {
    const existing = await prisma.vibePage.findUnique({ where: { slug: opts.slug } });
    if (!existing) {
      yield { type: 'error', message: 'Vibe page not found' };
      return;
    }
    existingSlug = existing.slug;
    history = (existing.conversationHistory as VibeMessage[]) ?? [];
  }

  const messages: VibeMessage[] = [
    { role: 'system', content: VIBE_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: opts.prompt },
  ];

  let content = '';
  try {
    const stream = await deepseek.chat.completions.create({
      model: VIBE_MODEL,
      messages,
      // Generous budget so finished, polished pages don't get truncated.
      max_tokens: 16384,
      stream: true,
    });

    for await (const chunk of stream) {
      // reasoning_content is deepseek-reasoner specific and not in the SDK types.
      const delta = chunk.choices[0]?.delta as
        | { content?: string | null; reasoning_content?: string | null }
        | undefined;
      if (delta?.reasoning_content) yield { type: 'thinking', text: delta.reasoning_content };
      if (delta?.content) {
        content += delta.content;
        yield { type: 'content', text: delta.content };
      }
    }
  } catch {
    yield { type: 'error', message: 'The model failed to respond. Try again.' };
    return;
  }

  const { slug: parsedSlug, title, description, html } = parseVibeOutput(content);
  if (!html) {
    yield { type: 'error', message: 'The model returned an empty page. Try again.' };
    return;
  }

  const cleanTitle = (title || opts.prompt).slice(0, 80);
  const cleanDescription = (description || `A vibe page about "${opts.prompt}".`).slice(0, 300);

  // Persist only the model's content (never reasoning_content) in history.
  const assistantTurn: VibeMessage = { role: 'assistant', content };

  try {
    if (existingSlug) {
      const conversationHistory: VibeMessage[] = [
        ...history,
        { role: 'user', content: opts.prompt },
        assistantTurn,
      ];
      await prisma.vibePage.update({
        where: { slug: existingSlug },
        data: { html, title: cleanTitle, description: cleanDescription, conversationHistory },
      });
      yield { type: 'done', slug: existingSlug, html, title: cleanTitle, description: cleanDescription };
    } else {
      const slug = await uniqueSlug(parsedSlug || opts.prompt);
      const conversationHistory: VibeMessage[] = [
        { role: 'user', content: opts.prompt },
        assistantTurn,
      ];
      await prisma.vibePage.create({
        data: {
          slug,
          prompt: opts.prompt,
          title: cleanTitle,
          description: cleanDescription,
          html,
          conversationHistory,
        },
      });
      yield { type: 'done', slug, html, title: cleanTitle, description: cleanDescription };
    }
  } catch {
    yield { type: 'error', message: 'Failed to save the page. Try again.' };
  }
}
