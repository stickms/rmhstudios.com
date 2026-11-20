/**
 * The one seam every AI call on the site goes through (A1). Server-only.
 *
 * Before this, model access was decided in four places that could not see each
 * other: `lib/ai/text.server.ts` constructed a single `OpenAI` client pointed
 * at DeepSeek with `stream: false` hardcoded; `lib/rmhark-ai/` and
 * `lib/assistant/` each reached for it separately; and
 * `lib/rmhladder/ai/provider.server.ts` — the only one that got it right —
 * implemented a real multi-provider interface with JSON-fence handling and a
 * typed configuration error, reachable by nothing outside RMHLadder.
 *
 * This module is that ladder implementation generalised, with two changes:
 *
 *  1. **Routing is keyed by TASK, not by model.** Callers say what they are
 *     doing ('compose-assist', 'summarize', 'moderate', …) and the table below
 *     decides what runs it. That is what makes it possible to retune latency or
 *     cost for one kind of work without auditing every call site.
 *  2. **Every call is metered.** `runTask` writes an `AiUsage` row, which is
 *     what gives per-user budgets (`lib/ai/budget.server.ts`) somewhere to
 *     hook. Rate limits cap requests per minute; they never capped the month.
 *
 * **Provider policy:** DeepSeek is the only backend wired here, deliberately.
 * RMHLadder's Anthropic path predates this module and is left alone; nothing
 * new routes there. Adding a provider means adding it to `PROVIDERS` and to a
 * route in `ROUTES` — both in this file, both in one diff.
 *
 * When `DEEPSEEK_API_KEY` is unset every task throws `AI_UNAVAILABLE` rather
 * than hanging or returning empty text, so callers degrade to their non-AI
 * path instead of rendering a blank result.
 */

import OpenAI from 'openai';
import { AppError } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { timedAiFetch } from './timed-fetch.server';
import type { VibeLedgerTask } from './vibe-tasks';
import { DEEPSEEK_FLASH, DEEPSEEK_PRO_MODEL, DEEPSEEK_REASONING, deepseekThinking } from './deepseek-models';
import type { MeteredFeature } from './metered-fetch.server';

/* -------------------------------------------------------------------------- */
/* Tasks + routing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What a caller is doing, not what model does it.
 *
 * Add a task when the *shape* of the work differs (latency tolerance, output
 * contract, cost ceiling) — not per feature. Two features that both rewrite a
 * short piece of user text share `compose-assist`.
 */
export type AiTask =
  /** Short, latency-critical, user is watching a caret blink. */
  | 'compose-assist'
  /** Long input, quality matters more than latency. */
  | 'summarize'
  /** Structured output, must be cheap and fast; never user-visible prose. */
  | 'moderate'
  /** Background classifier: structured extraction from forum posts (RMH Med Schools, no user watching). */
  | 'medschools-extract'
  /** Conversational, may carry a tool contract. */
  | 'concierge'
  /** Long-form generation (recaps, narrative Wrapped). */
  | 'narrative'
  /**
   * Whole documents in Markdown (wiki pages). Thousands of tokens, always
   * streamed: the reader watches it arrive, so latency is spent, not waited.
   */
  | 'document';

interface Route {
  provider: ProviderName;
  model: string;
  maxTokens: number;
  temperature: number;
  /**
   * Tried when the primary throws. Same provider today — the point of the field
   * is that a degraded-but-cheaper model is a routing decision, not a code
   * change. Omitted where a retry is not worth the latency.
   */
  fallback?: Omit<Route, 'fallback'>;
}

type ProviderName = 'deepseek';

/** Every route runs thinking-off flash (lib/ai/deepseek-models.ts); reasoning is `runReasoningTask`. */
const DEEPSEEK_CHAT = DEEPSEEK_FLASH.model;

const ROUTES: Record<AiTask, Route> = {
  'compose-assist': {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 400,
    temperature: 0.6,
  },
  summarize: {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 900,
    temperature: 0.3,
    fallback: { provider: 'deepseek', model: DEEPSEEK_CHAT, maxTokens: 700, temperature: 0.3 },
  },
  moderate: {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 300,
    // Near-zero: a classifier that varies run to run is not a classifier.
    temperature: 0,
  },
  'medschools-extract': {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 1_500,
    // A classifier, like `moderate`: the same post must give the same events.
    temperature: 0,
  },
  concierge: {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 1_200,
    temperature: 0.4,
  },
  narrative: {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 700,
    temperature: 0.8,
  },
  document: {
    provider: 'deepseek',
    model: DEEPSEEK_CHAT,
    maxTokens: 4_000,
    temperature: 0.5,
  },
};

/* -------------------------------------------------------------------------- */
/* Cost table                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Micro-dollars per 1M tokens, per model. Used for the `AiUsage` ledger and the
 * budgets built on it.
 *
 * These are estimates and will drift — that is fine and intentional. The ledger
 * exists to answer "which feature costs what, relative to the others" and to
 * stop one account running unbounded; it is not an invoice. Update when
 * pricing changes; an unknown model falls back to the default rather than
 * recording zero, because a silent zero is how a budget stops working.
 */
const COST_PER_MTOK: Record<string, { in: number; out: number; hit?: number }> = {
  // DeepSeek's list prices (api-docs.deepseek.com, 2026-11-20), at the PEAK rate:
  // off-peak is half, and the ledger is a ceiling, so peak is the safe figure.
  //   deepseek-flash (V4.1-Flash): $0.30 miss / $0.006 hit in, $1.20 out per 1M.
  //   deepseek-v4-pro:             $1.32 miss / $0.044 hit in, $3.96 out per 1M.
  // Thinking tokens are billed as output.
  'deepseek-flash': { in: 300_000, out: 1_200_000, hit: 6_000 },
  [DEEPSEEK_PRO_MODEL]: { in: 1_320_000, out: 3_960_000, hit: 44_000 },
  // Retired names DeepSeek still accepts and serves (and bills) as Flash.
  'deepseek-v4-flash': { in: 300_000, out: 1_200_000, hit: 6_000 },
  'deepseek-chat': { in: 300_000, out: 1_200_000, hit: 6_000 },
  'deepseek-reasoner': { in: 300_000, out: 1_200_000, hit: 6_000 },
  // RMHVibe's Kimi models (lib/rmhvibe/vibe.server.ts). The providers' published
  // list prices as the author knew them, NOT confirmed against the live pricing
  // pages: the owner should check them.
  //   Moonshot Kimi K2 family: $0.60 in / $2.50 out per 1M tokens. The
  //   high-speed tier is listed at roughly 4x that.
  'kimi-k2.7-code': { in: 600_000, out: 2_500_000 },
  'kimi-k2.7-code-highspeed': { in: 2_400_000, out: 10_000_000 },
};
const DEFAULT_COST = { in: 500_000, out: 2_000_000 };
/**
 * DeepSeek bills prompt tokens served from its context cache at a fraction of
 * the miss price (about a tenth when this was written). A model without its own
 * `hit` rate is charged that tenth for cache hits.
 */
const CACHE_HIT_FRACTION = 0.1;

/** `cacheHitTokens` is the part of `inTokens` DeepSeek served from its context cache. */
export function costMicros(
  model: string,
  inTokens: number,
  outTokens: number,
  cacheHitTokens = 0,
): number {
  const rate = COST_PER_MTOK[model] ?? DEFAULT_COST;
  const hits = Math.min(Math.max(0, cacheHitTokens), inTokens);
  const hitRate = rate.hit ?? rate.in * CACHE_HIT_FRACTION;
  return Math.ceil(((inTokens - hits) * rate.in + hits * hitRate + outTokens * rate.out) / 1_000_000);
}

/** DeepSeek's cache-hit count from a usage block (an extension the SDK types omit). */
function cacheHits(usage: unknown): number {
  const n = (usage as { prompt_cache_hit_tokens?: unknown } | null | undefined)
    ?.prompt_cache_hit_tokens;
  return typeof n === 'number' && n > 0 ? n : 0;
}

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

let deepseek: OpenAI | null = null;

function client(): OpenAI {
  if (!process.env.DEEPSEEK_API_KEY) throw new AppError('AI_UNAVAILABLE');
  deepseek ??= new OpenAI({ fetch: timedAiFetch,
    apiKey: process.env.DEEPSEEK_API_KEY,
    // Overridable so a local stand-in or an OpenAI-compatible proxy can be
    // pointed at in dev/CI without reaching the real API.
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    maxRetries: 1,
    // The SDK default is ~10 minutes, which would pin a request handler on a
    // hung upstream connection. Well above normal completion latency.
    timeout: 45_000,
  });
  return deepseek;
}

/** True when any AI feature can run at all. Call before rendering an AI affordance. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/* -------------------------------------------------------------------------- */
/* JSON handling                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Pull a JSON object out of a model response.
 *
 * Generalised from `lib/rmhladder/ai/provider.server.ts`, which needed it for
 * the same reason every JSON-mode caller does: models wrap objects in ```json
 * fences and prepend "Here's the JSON:" often enough that a bare `JSON.parse`
 * is a coin flip. Slicing to the outer braces is deliberately blunt and has
 * held up across every prompt in the ladder pipeline.
 */
export function jsonFromModelText(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) throw new AppError('AI_UNAVAILABLE');
  return JSON.parse(trimmed.slice(first, last + 1));
}

/* -------------------------------------------------------------------------- */
/* Metering                                                                   */
/* -------------------------------------------------------------------------- */

export interface RunOptions {
  /** Attributed in the ledger; null for platform work (the posting bot, jobs). */
  userId?: string | null;
  /** Ask for a JSON object and parse it. Throws if the model returns prose. */
  json?: boolean;
  /** Prompt identity from `lib/ai/prompts/`, so a regression is a query. */
  promptId?: string;
  promptVer?: number;
  /** Per-call override; the route's value is used when omitted. */
  maxTokens?: number;
  temperature?: number;
}

/**
 * Record a call. Never throws into the caller — a metering failure must not
 * turn a successful completion into an error, and a metering failure during an
 * outage must not amplify it.
 */
async function meter(row: {
  userId?: string | null;
  /** An `AiTask`, a vibe task, or a `MeteredFeature` label from metered-fetch.server.ts. */
  task: AiTask | VibeLedgerTask | MeteredFeature;
  /** The backend that served the call; every `runTask` route is DeepSeek. */
  provider?: string;
  model: string;
  promptId?: string;
  promptVer?: number;
  inTokens: number;
  outTokens: number;
  cacheHitTokens?: number;
  ok: boolean;
}): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        userId: row.userId ?? null,
        task: row.task,
        provider: row.provider ?? 'deepseek',
        model: row.model,
        promptId: row.promptId ?? null,
        promptVer: row.promptVer ?? null,
        inTokens: row.inTokens,
        outTokens: row.outTokens,
        cacheHitTokens: row.cacheHitTokens ?? 0,
        costMicros: costMicros(row.model, row.inTokens, row.outTokens, row.cacheHitTokens),
        ok: row.ok,
      },
    });
  } catch (err) {
    console.error('[ai] usage metering failed:', (err as Error)?.message);
  }
}

/**
 * Record one RMHVibe model call (a build attempt, or an in-page `RMHVibeAI`
 * completion). Vibe calls do not go through `runTask` (they stream from Kimi or
 * DeepSeek with their own client), so they meter here instead, into the same
 * ledger with the real provider. Never throws, like `meter`.
 */
export function meterVibe(row: {
  userId: string | null;
  task: VibeLedgerTask;
  provider: 'kimi' | 'deepseek';
  model: string;
  inTokens: number;
  outTokens: number;
  ok: boolean;
}): Promise<void> {
  return meter({
    ...row,
    inTokens: Math.max(0, Math.round(row.inTokens) || 0),
    outTokens: Math.max(0, Math.round(row.outTokens) || 0),
  });
}

/**
 * Record a call made outside `runTask` (the metered fetch in
 * `metered-fetch.server.ts`). Never throws, like `meter`.
 */
export function recordAiUsage(row: {
  userId: string | null;
  task: MeteredFeature;
  provider: string;
  model: string;
  inTokens: number;
  outTokens: number;
  cacheHitTokens: number;
  ok: boolean;
}): Promise<void> {
  return meter({
    ...row,
    provider: row.provider.slice(0, 20),
    inTokens: Math.max(0, Math.round(row.inTokens) || 0),
    outTokens: Math.max(0, Math.round(row.outTokens) || 0),
    cacheHitTokens: Math.max(0, Math.round(row.cacheHitTokens) || 0),
  });
}

/** Rough token count for a provider that sent no usage: ~4 characters per token. */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

async function invoke(
  route: Omit<Route, 'fallback'>,
  task: AiTask,
  system: string,
  user: string,
  opts: RunOptions,
): Promise<string> {
  const res = await client().chat.completions.create({
    model: route.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: opts.maxTokens ?? route.maxTokens,
    temperature: opts.temperature ?? route.temperature,
    ...deepseekThinking(DEEPSEEK_FLASH),
    stream: false,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  void meter({
    userId: opts.userId,
    task,
    model: route.model,
    promptId: opts.promptId,
    promptVer: opts.promptVer,
    inTokens: res.usage?.prompt_tokens ?? 0,
    outTokens: res.usage?.completion_tokens ?? 0,
    cacheHitTokens: cacheHits(res.usage),
    ok: true,
  });

  return res.choices[0]?.message?.content?.trim() ?? '';
}

/**
 * Run a task. The one entry point for non-streaming model access.
 *
 * `system` and `user` are kept as separate arguments rather than one blob
 * because the split is load-bearing for prompt-injection resistance: user
 * content belongs in the user turn, framed as data, and never in the system
 * turn where it reads as instruction. `lib/ai/prompts/` builds both halves.
 */
export async function runTask(
  task: AiTask,
  system: string,
  user: string,
  opts: RunOptions = {},
): Promise<string> {
  const route = ROUTES[task];
  try {
    return await invoke(route, task, system, user, opts);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (!route.fallback) {
      void meter({
        userId: opts.userId,
        task,
        model: route.model,
        promptId: opts.promptId,
        promptVer: opts.promptVer,
        inTokens: 0,
        outTokens: 0,
        ok: false,
      });
      console.error(`[ai] ${task} failed:`, (err as Error)?.message);
      throw new AppError('AI_UNAVAILABLE');
    }
    console.warn(`[ai] ${task} primary failed, falling back:`, (err as Error)?.message);
    try {
      return await invoke(route.fallback, task, system, user, opts);
    } catch (fallbackErr) {
      void meter({
        userId: opts.userId,
        task,
        model: route.fallback.model,
        promptId: opts.promptId,
        promptVer: opts.promptVer,
        inTokens: 0,
        outTokens: 0,
        ok: false,
      });
      console.error(`[ai] ${task} fallback failed:`, (fallbackErr as Error)?.message);
      throw new AppError('AI_UNAVAILABLE');
    }
  }
}

/**
 * A reasoning-tier DeepSeek call for a task that is worth the wait (the admin
 * email designer's "detailed" mode). It is not a route: the caller names the
 * model (normally `DEEPSEEK_REASONING.model`) and thinking is switched on, so
 * the task's cheap default stays cheap. Thinking takes
 * minutes' worth of thinking tokens inside `max_tokens`, ignore temperature and
 * JSON mode, and need a longer timeout than `client()`'s, so this builds its own
 * client. Metered like any other call; failures become `AI_UNAVAILABLE`.
 */
let deepseekSlow: OpenAI | null = null;
const REASONING_TIMEOUT_MS = 95_000;

export async function runReasoningTask(
  task: AiTask,
  model: string,
  system: string,
  user: string,
  opts: RunOptions = {},
): Promise<string> {
  if (!process.env.DEEPSEEK_API_KEY) throw new AppError('AI_UNAVAILABLE');
  deepseekSlow ??= new OpenAI({
    fetch: timedAiFetch,
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    maxRetries: 0,
    // Under the 100 s a Cloudflare-fronted request is allowed, so a slow
    // answer fails as a clean error rather than a 524 the admin cannot read.
    timeout: REASONING_TIMEOUT_MS,
  });
  try {
    const res = await deepseekSlow.chat.completions.create({
      model,
      ...deepseekThinking(DEEPSEEK_REASONING),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: opts.maxTokens ?? ROUTES[task].maxTokens,
      stream: false,
    });
    void meter({
      userId: opts.userId,
      task,
      model,
      promptId: opts.promptId,
      promptVer: opts.promptVer,
      inTokens: res.usage?.prompt_tokens ?? 0,
      outTokens: res.usage?.completion_tokens ?? 0,
      cacheHitTokens: cacheHits(res.usage),
      ok: true,
    });
    return res.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    void meter({
      userId: opts.userId,
      task,
      model,
      promptId: opts.promptId,
      promptVer: opts.promptVer,
      inTokens: 0,
      outTokens: 0,
      ok: false,
    });
    console.error(`[ai] ${task} (${model}) failed:`, (err as Error)?.message);
    throw new AppError('AI_UNAVAILABLE');
  }
}

/** `runTask` for JSON-mode calls: asks for an object and parses it. */
export async function runTaskJson<T>(
  task: AiTask,
  system: string,
  user: string,
  parse: (value: unknown) => T,
  opts: RunOptions = {},
): Promise<T> {
  const raw = await runTask(task, system, user, { ...opts, json: true });
  return parse(jsonFromModelText(raw));
}

/* -------------------------------------------------------------------------- */
/* Streaming                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Token stream for a task (A4).
 *
 * `stream: false` was hardcoded in `text.server.ts`, so every AI surface
 * blocked for the whole completion — 2–5 seconds of spinner where a streaming
 * UI shows first tokens in a few hundred milliseconds. Nothing about the
 * quality changed; the feature simply *felt* four seconds slower than it was.
 *
 * Usage is metered on completion. A stream the client abandons mid-way still
 * meters what was generated, because the tokens were billed either way.
 */
export async function* streamTask(
  task: AiTask,
  system: string,
  user: string,
  opts: RunOptions = {},
): AsyncGenerator<string, void, undefined> {
  const route = ROUTES[task];
  let outChars = 0;

  const stream = await client().chat.completions.create({
    model: route.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: opts.maxTokens ?? route.maxTokens,
    temperature: opts.temperature ?? route.temperature,
    ...deepseekThinking(DEEPSEEK_FLASH),
    stream: true,
  });

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (!delta) continue;
      outChars += delta.length;
      yield delta;
    }
  } finally {
    // Streaming responses do not carry a usage block on every provider, so
    // estimate from characters (~4 chars/token). An approximate ledger entry is
    // far better than none: a budget with a hole the size of "everything
    // streamed" is not a budget.
    void meter({
      userId: opts.userId,
      task,
      model: route.model,
      promptId: opts.promptId,
      promptVer: opts.promptVer,
      inTokens: Math.ceil((system.length + user.length) / 4),
      outTokens: Math.ceil(outChars / 4),
      ok: true,
    });
  }
}

/** Exposed for the routing test — asserts every task has a reachable model. */
export const AI_ROUTES: Readonly<Record<AiTask, Route>> = ROUTES;
