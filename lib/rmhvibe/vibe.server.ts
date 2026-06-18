/**
 * RMHVibe — server-side generation logic.
 *
 * Turns a user prompt into a self-contained, INTERACTIVE web app via an LLM.
 * The caller picks a model (Kimi or DeepSeek, each in a faster / higher-quality
 * tier), which maps to a concrete model ID and provider client (see
 * VIBE_MODEL_IDS / PROVIDERS). The model emits a small
 * multi-file React/TypeScript project, which we bundle server-side with esbuild (see
 * vibe-bundle.server.ts) into one static HTML document — no in-browser Babel. We
 * stream the model's chain-of-thought ("thinking") back to the caller, persist the
 * built page as a VibePage, and support collaborative "customize" follow-ups that
 * replay the full conversation history so the model keeps context.
 *
 * A legacy single-HTML response (no `===FILES===` marker) still renders via the
 * older injectCsp() path, so older pages and malformed responses keep working.
 *
 * Server-only (`.server.ts`) — uses process.env and the Prisma client.
 */

import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma.server';
import type { VibeStreamEvent, VibeModel, VibeProvider } from '@/lib/rmhvibe/vibe-types';
import { DEFAULT_VIBE_MODEL, VIBE_MODEL_META } from '@/lib/rmhvibe/vibe-types';
import { parseVibeProject, buildVibeHtml, BundleError } from '@/lib/rmhvibe/vibe-bundle.server';

export type VibeMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// One OpenAI-compatible client per provider. Kimi (Moonshot) and DeepSeek both
// expose OpenAI-compatible chat endpoints and stream reasoning_content (the
// chain-of-thought) alongside the final answer when the model supports it.
const PROVIDERS: Record<VibeProvider, OpenAI> = {
  kimi: new OpenAI({
    baseURL: 'https://api.moonshot.ai/v1',
    apiKey: process.env.KIMI_API_KEY!,
    maxRetries: 1, // streaming stalls are handled below; don't silently retry for minutes
  }),
  deepseek: new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY!,
    maxRetries: 1,
  }),
};

// Maps each selectable model to its concrete provider model ID. None of these
// support response_format/json mode, so we use a plain text protocol and parse it.
const VIBE_MODEL_IDS: Record<VibeModel, string> = {
  'kimi-k2': 'kimi-k2.7-code',
  'kimi-k2-turbo': 'kimi-k2.7-code-highspeed',
  'deepseek-flash': 'deepseek-v4-flash',
  'deepseek-pro': 'deepseek-v4-pro',
};

const VIBE_SYSTEM_PROMPT = `You are a world-class creative web developer and designer. Given a user's prompt, build a COMPLETE, polished, INTERACTIVE web app that captures the vibe of their request, written as a small multi-file React + TypeScript project. The result must look finished and shippable, never a rough draft.

How to think before you write (follow this exactly — it keeps you fast and decisive):
- FIRST, in your reasoning, write a brief, concrete implementation plan and COMMIT to it. The plan should lock in: the concept/vibe, the file list (e.g. index.tsx, App.tsx, components/X.tsx, styles.css), the key components and their responsibilities, the core interactions, the data/state shape, and any npm deps. Keep it tight — a page or so, not an essay.
- Make decisions ONCE. Pick an approach and move on. Do NOT keep re-evaluating alternatives, second-guessing choices you already made, or restarting the design — that wastes your reasoning budget and risks running out before the code is done.
- Once the plan is set, STOP planning and write the full code straight through, file by file, exactly as planned. If you discover a small necessary fix mid-way, make it inline and keep going forward — never loop back to redesign from scratch.
- Your reasoning is for planning, not for drafting the code twice. Don't write the implementation in your reasoning and then again in the answer; plan in reasoning, implement in the answer.

How your code is built and run (this is different from a single HTML file — read carefully):
- You write a project of source files (.tsx / .ts / .css). On the server we bundle them with esbuild and serve the result inside a sandboxed iframe. There is NO in-browser Babel: you get full TypeScript, JSX, multiple files, and native ES modules.
- ENTRY POINT: a file named \`index.tsx\` that mounts your <App/> into the existing <div id="root">. Do NOT write <html>, <head>, <body>, <title>, or a CSP — the surrounding HTML shell (doctype, head, title, import map, #root) is generated for you.
- Split the code into multiple files with relative imports (e.g. \`import App from './App'\`, \`import { Board } from './components/Board'\`). Keep it organized and easy to extend — pages can be CUSTOMIZED later via follow-up instructions, and clean structure makes that reliable.
- GLOBAL CSS: put it in \`styles.css\` and \`import './styles.css'\` from index.tsx. Inline styles and CSS-in-JS are also fine.
- React 19 and react-dom are ALWAYS available — import them directly (\`import React, { useState, useEffect } from 'react'\`, \`import { createRoot } from 'react-dom/client'\`). Do NOT list react/react-dom in DEPS.

npm packages — this is a real strength, use it:
- You can import ANY browser-compatible npm package; bare imports resolve at runtime from esm.sh. LARGE libraries work great and load straight from the CDN — including three, @react-three/fiber, @react-three/drei, pixi.js, p5, matter-js, konva, d3, chart.js, gsap, animejs, motion (framer-motion), tone, howler, zustand, immer, lodash-es, date-fns, nanoid, and more.
- For EVERY bare npm package you import (other than react/react-dom), list it on the DEPS line with a PINNED version, comma-separated: \`DEPS: three@0.183, @react-three/fiber@9, gsap@3\`. Subpath imports such as \`three/examples/jsm/controls/OrbitControls.js\` are fine — just list the base package (\`three@0.183\`) in DEPS.

Runtime environment — use it to the fullest, and respect its limits:
- The app runs in a sandboxed iframe with an opaque origin, auto-focused, so keyboard input (arrow keys, WASD, spacebar, typing) works immediately — keyboard games and shortcuts are fine.
- The full client-side web platform is available: Canvas 2D, WebGL, the Web Audio API, SVG, CSS animations/transitions, requestAnimationFrame, IntersectionObserver/ResizeObserver, pointer/touch/mouse/keyboard events, drag-and-drop, the Web Animations API, and Pointer Lock (for mouse-look). alert/confirm/prompt are allowed.
- HARD LIMITS (the sandbox enforces these — code that ignores them WILL crash or be blocked):
  - NO localStorage, sessionStorage, cookies, or IndexedDB — accessing them throws. Keep state in memory (React state). For shareable or persistent state, encode it into location.hash.
  - NO network except https://esm.sh — no fetch/XHR/WebSocket to any other origin, and no external image/font/media URLs. Generate all visuals with SVG, emoji, CSS gradients, canvas, or data: URIs.
- Be ambitious: games, physics simulations, generative art, audio toys/sequencers, data visualizations, 3D scenes, productivity tools, and dashboards are all in scope — everything runs client-side.

Default aesthetic — modern and minimalistic, unless the prompt clearly asks for something else (e.g. retro, brutalist, maximalist, neon):
- Clean and restrained: lots of whitespace, a tight, mostly-neutral palette (1 accent color at most), and strong typographic hierarchy carrying the design.
- Flat and subtle over heavy: hairline borders, soft/low shadows, gentle rounded corners, and small, purposeful motion. Avoid loud gradients, glows, drop-shadow stacks, and busy decoration.
- Modern type: a clean sans-serif system/UI font stack, comfortable line-height, generous letter spacing on headings.
- Let content breathe — fewer, well-composed elements beat dense, cluttered layouts.
- When the prompt implies a different vibe, honor it fully; minimalism is the default starting point, not a hard constraint.

Design bar (treat as a checklist):
- A cohesive color palette and a clear typographic hierarchy (distinct heading/body sizes and weights).
- Deliberate spacing, alignment, and rhythm; generous padding; nothing cramped or overlapping.
- Polish where it fits the vibe: hover states, smooth transitions, and restrained depth — kept subtle by default.
- A complete structure appropriate to the prompt (e.g. hero + several rich content sections + footer), not a single bare element.
- Fully responsive: looks great on mobile and desktop (flex/grid, clamp(), media queries).

Interactivity (make it feel alive):
- Real, working, discoverable interactions: clicks, hovers, drag, keyboard input, scroll effects, animations, generative visuals, tiny games, or dynamic content that rewards exploration.

Quality (strict):
- FINISHED, not a skeleton: every section fully built with real, specific, readable copy. No "lorem ipsum", placeholders, "coming soon", TODOs, or cut-off sections.
- The code MUST compile: valid TypeScript/JSX, every import resolvable (relative files you define, or packages listed in DEPS). The entry must call \`createRoot(document.getElementById('root')!).render(...)\`.

OUTPUT FORMAT — this response is parsed by a machine, not read by a human. Any deviation BREAKS the build and wastes the whole generation. Follow it EXACTLY:
- The VERY FIRST characters of your answer MUST be \`SLUG:\`. No preamble, no greeting, no "Here's the…", no "Sure!", no explanation, no summary — not before the SLUG and not after the last file.
- There is NO acceptable non-project response. Even if the request is vague, impossible, unclear, or you'd normally ask a clarifying question, do NOT reply with prose, an apology, or a question — always make a reasonable assumption and output a COMPLETE, valid project in the format below. Plain text that isn't this format is treated as a failure and discarded.
- Do NOT wrap the response, or any individual file, in markdown code fences. Never emit \`\`\`html, \`\`\`tsx, \`\`\`, or similar. Write the raw file contents directly after each \`--- file: … ---\` header.
- Do NOT output a single standalone HTML file or a \`<!doctype html>\` document. ALWAYS use the multi-file React/TypeScript project format below with an \`index.tsx\` entry point — even when the request feels like it could be "just one HTML file" (e.g. a Three.js scene). Put your code in .tsx/.ts/.css files, not in a raw HTML page.
- Output the metadata lines, then \`===FILES===\`, then each file. Nothing else.

SLUG: <2-4 word kebab-case slug, max 32 chars, relevant to the prompt>
TITLE: <a catchy page title, max 60 chars>
DESCRIPTION: <one enticing sentence describing the page for social sharing, max 160 chars>
DEPS: <comma-separated bare npm packages with pinned versions, excluding react/react-dom; leave empty if none>
===FILES===
--- file: index.tsx ---
<source for index.tsx>
--- file: App.tsx ---
<source for App.tsx>
--- file: styles.css ---
<global CSS>
(…add more files as needed…)`;

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

  html = extractHtmlDoc(html);

  return { slug, title, description, html };
}

/**
 * Pull a clean HTML document out of whatever the model emitted. It sometimes
 * ignores the format and returns a single HTML file wrapped in a markdown fence
 * and/or preceded by a conversational preamble ("Here's the complete HTML file:
 * ```html …"). We extract the fenced code block (the largest, if several) and drop
 * any prose before the document so the chatter never renders as the page.
 */
function extractHtmlDoc(raw: string): string {
  let html = raw.trim();

  // Prefer the contents of a fenced code block, discarding surrounding prose.
  const fences = [...html.matchAll(/```[a-z0-9]*[^\S\r\n]*\r?\n?([\s\S]*?)```/gi)];
  if (fences.length > 0) {
    html = fences.map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
  }

  // Drop any leading commentary before the actual document (handles both a
  // preamble with no fence and an unclosed fence the regex above couldn't match).
  const docStart = html.search(/<!doctype\s+html|<html[\s>]/i);
  if (docStart > 0) html = html.slice(docStart);

  // Strip any stray leading/trailing fence markers left over.
  return html
    .trim()
    .replace(/^```[a-z0-9]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
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

export type VibeVersionSummary = {
  id: string;
  prompt: string;
  title: string | null;
  createdAt: string; // ISO — serialised for the client
};

/**
 * Browsable, dated history for a page: one entry per generation step (the initial
 * build and every "customize"), oldest → newest. Lightweight — omits `html` and
 * `conversationHistory`; fetch a single version with getVibeVersion for the body.
 */
export async function listVibeVersions(slug: string): Promise<VibeVersionSummary[]> {
  const page = await prisma.vibePage.findUnique({ where: { slug }, select: { id: true } });
  if (!page) return [];

  const versions = await prisma.vibePageVersion.findMany({
    where: { pageId: page.id },
    select: { id: true, prompt: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return versions.map((v) => ({
    id: v.id,
    prompt: v.prompt,
    title: v.title,
    createdAt: v.createdAt.toISOString(),
  }));
}

/**
 * Full body of a single version, scoped to its page's slug so a stale/forged id
 * can't read another page's content. Used to preview an earlier variant.
 */
export async function getVibeVersion(slug: string, versionId: string) {
  const version = await prisma.vibePageVersion.findFirst({
    where: { id: versionId, page: { slug } },
    select: { id: true, prompt: true, title: true, description: true, html: true, createdAt: true },
  });
  if (!version) return null;
  return {
    id: version.id,
    prompt: version.prompt,
    title: version.title,
    description: version.description,
    html: version.html,
    createdAt: version.createdAt.toISOString(),
  };
}

export type VibeCard = {
  slug: string;
  title: string | null;
  description: string | null;
  prompt: string;
  thumbnailUrl: string | null;
  createdAt: string; // ISO — serialised for the client
};

const GALLERY_PAGE_SIZE = 24;

/**
 * Paginated, searchable list of vibe pages for the gallery. Selects only the
 * lightweight card fields — never `html`/`conversationHistory` — and uses cursor
 * pagination (by id, newest first) for cheap infinite scroll.
 */
export async function listVibePages(opts: { q?: string; cursor?: string }): Promise<{
  items: VibeCard[];
  nextCursor: string | null;
}> {
  const q = opts.q?.trim();
  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { prompt: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : undefined;

  const rows = await prisma.vibePage.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      prompt: true,
      thumbnailUrl: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: GALLERY_PAGE_SIZE + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > GALLERY_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, GALLERY_PAGE_SIZE) : rows;

  return {
    items: page.map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.description,
      prompt: r.prompt,
      thumbnailUrl: r.thumbnailUrl,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/**
 * Heuristic: does this string contain an actual HTML document, or is it just the
 * model's prose/markdown? The legacy fallback used to render whatever it got, so a
 * chatty "Sure! Here's how I'd approach this…" reply would display as the page.
 * We require a real structural tag before accepting the legacy path.
 */
function looksLikeHtmlDoc(html: string): boolean {
  return /<!doctype\s+html|<html[\s>]|<body[\s>]/i.test(html);
}

type Materialized =
  | { ok: true; html: string; slug: string; title: string; description: string }
  | { ok: false; reason: string };

/**
 * Turn raw model output into a renderable page, or report why it can't be. The
 * preferred path is the multi-file project (parsed + bundled with esbuild); the
 * legacy single-HTML path is accepted ONLY when the content really looks like an
 * HTML document. Plain prose, apologies, or markdown are rejected so they never
 * get served as a "page" — the caller retries instead.
 */
async function materialize(content: string): Promise<Materialized> {
  const project = parseVibeProject(content);
  if (project) {
    try {
      const html = await buildVibeHtml(project);
      return { ok: true, html, slug: project.slug, title: project.title, description: project.description };
    } catch (err) {
      const detail = err instanceof BundleError ? err.message : 'unexpected error';
      return { ok: false, reason: `the app didn't compile (${detail})` };
    }
  }

  const parsed = parseVibeOutput(content);
  if (parsed.html && looksLikeHtmlDoc(parsed.html)) {
    return {
      ok: true,
      html: injectCsp(parsed.html),
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description,
    };
  }

  return { ok: false, reason: 'the response was not a renderable app (no project files or HTML)' };
}

// How many times to ask the model (initial try + corrective retries) before
// giving up. Each retry feeds back the bad output and what was wrong with it.
const MAX_GENERATION_ATTEMPTS = 3;

// Streaming guards. A healthy stream emits tokens continuously, so the idle timer
// (reset on every chunk) only trips on a real stall — the connection is open but
// nothing is coming. The total cap bounds a runaway generation. Both abort the
// request and surface a specific error instead of spinning forever.
const STREAM_IDLE_MS = 60_000; // no token for 60s → treat as stalled
const STREAM_TOTAL_MS = 300_000; // hard cap on a single attempt (5 min)

/**
 * Stream generation of a vibe page. If `slug` is provided, this is a "customize"
 * follow-up against the existing page; otherwise a brand-new page is created.
 * Customization normally replays the page's latest history, but `fromVersionId`
 * branches off an earlier version instead (replaying that version's history), so
 * users can revisit and re-customize an earlier variant. Yields thinking/content
 * deltas, then a final `done` event after the page (and a new version snapshot)
 * have been persisted.
 *
 * Robustness: the model occasionally ignores the output format and returns prose
 * or uncompilable code. We validate every response (materialize); if it isn't a
 * working app we feed the failure back and regenerate, up to
 * MAX_GENERATION_ATTEMPTS, and surface an error rather than ever rendering raw
 * model text as the page.
 */
export async function* generateVibeStream(opts: {
  prompt: string;
  slug?: string;
  fromVersionId?: string;
  model?: VibeModel;
}): AsyncGenerator<VibeStreamEvent> {
  const model = opts.model ?? DEFAULT_VIBE_MODEL;
  const modelId = VIBE_MODEL_IDS[model];
  const client = PROVIDERS[VIBE_MODEL_META[model].provider];
  let history: VibeMessage[] = [];
  let existingSlug: string | undefined;
  let existingPageId: string | undefined;

  if (opts.slug) {
    const existing = await prisma.vibePage.findUnique({ where: { slug: opts.slug } });
    if (!existing) {
      yield { type: 'error', message: 'Vibe page not found' };
      return;
    }
    existingSlug = existing.slug;
    existingPageId = existing.id;

    if (opts.fromVersionId) {
      // Branch off an earlier version: replay its history, not the page's latest.
      const version = await prisma.vibePageVersion.findFirst({
        where: { id: opts.fromVersionId, pageId: existing.id },
        select: { conversationHistory: true },
      });
      if (!version) {
        yield { type: 'error', message: 'That version no longer exists.' };
        return;
      }
      history = (version.conversationHistory as VibeMessage[]) ?? [];
    } else {
      history = (existing.conversationHistory as VibeMessage[]) ?? [];
    }
  }

  const messages: VibeMessage[] = [
    { role: 'system', content: VIBE_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: opts.prompt },
  ];

  // Generate, validate, and retry until we have a real renderable app. `content`
  // holds the latest successful output (persisted below); failed attempts and the
  // corrective prompts live only in `messages` and are never saved to history.
  let content = '';
  let result: Extract<Materialized, { ok: true }> | undefined;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS && !result; attempt++) {
    content = '';

    // Abort the request if it stalls (no tokens for STREAM_IDLE_MS) or runs past
    // the total cap. The idle timer is re-armed on every chunk; `stalled`/`timedOut`
    // record which guard fired so we can give a specific error.
    const abort = new AbortController();
    let stalled = false;
    let timedOut = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        stalled = true;
        abort.abort();
      }, STREAM_IDLE_MS);
    };
    const totalTimer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, STREAM_TOTAL_MS);

    try {
      armIdle(); // also bounds time-to-first-token
      const stream = await client.chat.completions.create(
        {
          model: modelId,
          messages,
          // Generous budget so finished, polished pages don't get truncated.
          max_tokens: 16384,
          stream: true,
        },
        { signal: abort.signal },
      );

      for await (const chunk of stream) {
        armIdle();
        // reasoning_content is a provider extension (Kimi/DeepSeek) not in the SDK types.
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
      yield {
        type: 'error',
        message: stalled
          ? 'The model stopped responding partway through. Please try again.'
          : timedOut
            ? 'Generation took too long and was stopped. Try again, or simplify your prompt.'
            : 'The model failed to respond. Try again.',
      };
      return;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    }

    const materialized = await materialize(content);
    if (materialized.ok) {
      result = materialized;
      break;
    }

    // Not a working app. If attempts remain, show the user we're recovering and
    // feed the bad output + the reason back so the model fixes the format.
    if (attempt < MAX_GENERATION_ATTEMPTS) {
      yield {
        type: 'thinking',
        text: `\n\n↻ That attempt didn't produce a working app (${materialized.reason}). Regenerating…\n\n`,
      };
      messages.push(
        { role: 'assistant', content },
        {
          role: 'user',
          content: `Your previous response could not be rendered: ${materialized.reason}. Reply with ONLY the project in the required format — the VERY FIRST characters must be "SLUG:", followed by the TITLE/DESCRIPTION/DEPS lines, then "===FILES===", then each "--- file: … ---" with real, compiling code. No prose, no apology, no questions, no markdown code fences.`,
        },
      );
    } else {
      yield {
        type: 'error',
        message: `Couldn't generate a working app (${materialized.reason}). Try again or rephrase your prompt.`,
      };
      return;
    }
  }

  if (!result) {
    yield { type: 'error', message: "Couldn't generate a working app. Try again." };
    return;
  }

  const { html, slug: parsedSlug, title, description } = result;

  const cleanTitle = (title || opts.prompt).slice(0, 80);
  const cleanDescription = (description || `A vibe page about "${opts.prompt}".`).slice(0, 300);

  // Persist only the model's content (never reasoning_content) in history.
  const assistantTurn: VibeMessage = { role: 'assistant', content };

  try {
    if (existingSlug && existingPageId) {
      const conversationHistory: VibeMessage[] = [
        ...history,
        { role: 'user', content: opts.prompt },
        assistantTurn,
      ];
      // Update the page (its `html`/etc. always mirror the latest version) and
      // append an immutable version snapshot — atomically, so history stays in
      // sync with the page.
      const [, version] = await prisma.$transaction([
        prisma.vibePage.update({
          where: { id: existingPageId },
          // Mark the thumbnail stale so the vibe-worker re-renders it for the new content.
          data: { html, title: cleanTitle, description: cleanDescription, conversationHistory, thumbnailStale: true },
        }),
        prisma.vibePageVersion.create({
          data: {
            pageId: existingPageId,
            prompt: opts.prompt,
            title: cleanTitle,
            description: cleanDescription,
            html,
            conversationHistory,
          },
          select: { id: true },
        }),
      ]);
      yield { type: 'done', slug: existingSlug, versionId: version.id, html, title: cleanTitle, description: cleanDescription };
    } else {
      const slug = await uniqueSlug(parsedSlug || opts.prompt);
      const conversationHistory: VibeMessage[] = [
        { role: 'user', content: opts.prompt },
        assistantTurn,
      ];
      // Create the page and seed its first version snapshot from the same content.
      const page = await prisma.vibePage.create({
        data: {
          slug,
          prompt: opts.prompt,
          title: cleanTitle,
          description: cleanDescription,
          html,
          conversationHistory,
          versions: {
            create: {
              prompt: opts.prompt,
              title: cleanTitle,
              description: cleanDescription,
              html,
              conversationHistory,
            },
          },
        },
        select: { versions: { select: { id: true } } },
      });
      // thumbnailStale defaults to true → the vibe-worker renders the screenshot.
      yield { type: 'done', slug, versionId: page.versions[0].id, html, title: cleanTitle, description: cleanDescription };
    }
  } catch {
    yield { type: 'error', message: 'Failed to save the page. Try again.' };
  }
}
