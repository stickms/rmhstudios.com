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

const VIBE_SYSTEM_PROMPT = `You are a world-class creative web developer and designer. Given a user's prompt, build a COMPLETE, polished, INTERACTIVE web page that captures the vibe of their request, as a single self-contained HTML document. Take your reasoning time to plan layout, content, and interactions before writing — the result must look finished and shippable, never a rough draft.

You may build the page either as plain HTML/CSS/JS, OR as a modern app using React 19 (with JSX) and other libraries — choose whatever best fits the prompt.

Your runtime environment — use it to the fullest, and respect its limits:
- The page runs in a sandboxed iframe with an opaque origin, and it is auto-focused, so keyboard input (arrow keys, WASD, spacebar, typing) works immediately — keyboard games and shortcuts are fine.
- The full client-side web platform is available: Canvas 2D, WebGL, the Web Audio API, SVG, CSS animations/transitions, requestAnimationFrame, IntersectionObserver/ResizeObserver, pointer/touch/mouse/keyboard events, drag-and-drop, the Web Animations API, and Pointer Lock (for mouse-look). alert/confirm/prompt are allowed.
- You can import ANY browser-compatible npm package from esm.sh — not only the examples below. A non-exhaustive palette by category:
  - UI / 3D: react, react-dom, three, @react-three/fiber, ogl
  - 2D / canvas / games: pixi.js, p5, matter-js (physics), konva
  - Animation: gsap, animejs, motion (framer-motion)
  - Audio / music: tone, howler
  - Data / viz: d3, chart.js
  - State / utils: zustand, immer, lodash-es, date-fns, nanoid
  Always pin versions in the import map.
- HARD LIMITS (the sandbox enforces these — code that ignores them WILL crash or be blocked):
  - NO localStorage, sessionStorage, cookies, or IndexedDB — accessing them throws in this sandbox. Keep state in memory (JS variables / React state). For shareable or persistent state, encode it into location.hash.
  - NO network except esm.sh and cdn.jsdelivr — no fetch/XHR/WebSocket to any other origin, and no external image/font/media URLs. Generate all visuals with SVG, emoji, CSS, canvas, or data: URIs.
- A page can be CUSTOMIZED later via follow-up instructions, so keep the code organized and easy to extend.
- Be ambitious: games, physics simulations, generative art, audio toys/sequencers, data visualizations, 3D scenes, productivity tools, and dashboards are all in scope — everything runs client-side.

Using React / libraries (optional, but encouraged for richer apps):
- Load JS dependencies ONLY from https://esm.sh via a native <script type="importmap">, and load Babel ONLY from https://cdn.jsdelivr.net. No other external origins are allowed.
- Write components with JSX inside <script type="text/babel" data-type="module" data-presets="react">.
- Skeleton to follow when using React:
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title>
<script type="importmap">
{"imports":{"react":"https://esm.sh/react@19","react-dom/client":"https://esm.sh/react-dom@19/client"}}
</script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
<style>/* … */</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-type="module" data-presets="react">
import React from 'react';
import { createRoot } from 'react-dom/client';
// build your app here
createRoot(document.getElementById('root')).render(/* … */);
</script>
</body>
</html>
- CRITICAL: the script must begin with \`import React from 'react';\` — JSX compiles to React.createElement, so React must be in scope or the page will crash with "React is not defined". Import hooks alongside it, e.g. \`import React, { useState, useEffect } from 'react';\`.
- Add any other libraries you need to the import map from esm.sh, with PINNED versions (e.g. "three":"https://esm.sh/three@0.183", "gsap":"https://esm.sh/gsap@3", "d3":"https://esm.sh/d3@7").

Security & self-containment (strict — the page runs sandboxed):
- Do NOT add a Content-Security-Policy meta tag; one is injected automatically.
- No external resources other than esm.sh (libraries) and cdn.jsdelivr (Babel only). No external image or font URLs — use inline SVG, emoji, CSS gradients, or data: URIs.
- Do not make network requests to any other origin.

Always required, regardless of approach:
- Output a full HTML document (<!DOCTYPE html> … </html>) with the viewport meta.
- FINISHED, not a skeleton: every section fully built with real, specific, readable copy. No "lorem ipsum", placeholders, "coming soon", TODOs, or cut-off sections.

Design bar (treat as a checklist):
- A cohesive color palette and a clear typographic hierarchy (distinct heading/body sizes and weights).
- Deliberate spacing, alignment, and rhythm; generous padding; nothing cramped or overlapping.
- Depth and polish where it fits the vibe: gradients, shadows, borders, hover states, smooth transitions.
- A complete page structure appropriate to the prompt (e.g. hero + several rich content sections + footer), not a single bare element.
- Fully responsive: looks great on mobile and desktop (use flex/grid, clamp(), media queries).

Interactivity (make it feel alive):
- Real interactions: clicks, hovers, drag, keyboard input, scroll effects, animations, generative visuals, tiny games, or dynamic content that rewards exploration.
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

// Strict CSP injected into every generated page. Combined with the viewer's
// sandboxed iframe (no allow-same-origin), this locks pages down: code only from
// esm.sh + jsdelivr (Babel), no external images/fonts, and no network exfiltration
// to other origins.
const VIBE_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "script-src 'unsafe-inline' blob: https://esm.sh https://cdn.jsdelivr.net",
  'worker-src blob:',
  "style-src 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net",
  'img-src data: blob:',
  'font-src data: https://esm.sh https://cdn.jsdelivr.net',
  'media-src data: blob:',
  'connect-src https://esm.sh https://cdn.jsdelivr.net',
].join('; ');

/** Force our CSP into the page <head>, replacing any the model may have added. */
function injectCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${VIBE_CSP}">`;
  // Drop any model-supplied CSP so policies don't conflict (CSP intersects).
  let out = html.replace(
    /<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi,
    '',
  );
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/(<head[^>]*>)/i, `$1\n${meta}`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/(<html[^>]*>)/i, `$1<head>${meta}</head>`);
  } else {
    out = `${meta}\n${out}`;
  }
  return out;
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

  const { slug: parsedSlug, title, description, html: rawHtml } = parseVibeOutput(content);
  if (!rawHtml) {
    yield { type: 'error', message: 'The model returned an empty page. Try again.' };
    return;
  }
  const html = injectCsp(rawHtml);

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
