/**
 * DeepSeek-powered automation for the prediction market.
 *
 * Three jobs, each driven by the bot-worker on its own interval and a no-op when
 * `DEEPSEEK_API_KEY` is unset:
 *
 *  - `seedPredictions`   — invents new, plausible YES/NO markets and opens them.
 *  - `placeNoiseBets`    — has random bot users trade small amounts on open
 *                          markets, which is what nudges the implied
 *                          probabilities around (the "noise").
 *  - `resolveDuePredictions` — resolves AI-seeded markets that have closed (and,
 *                          occasionally, picks one at random to resolve early),
 *                          asking DeepSeek for the YES/NO call.
 *
 * Reuses the same server-only `DEEPSEEK_API_KEY` as the rest of the platform;
 * the key never reaches the client. Accepts a Prisma client so the standalone
 * worker can pass its own pool.
 */

import OpenAI from 'openai';
import type { PrismaClient } from '@prisma/client';
import { placeTrade, resolvePrediction } from './predictions.server';
import type { Side } from './lmsr';

const MODEL = process.env.PREDICTION_AI_MODEL || process.env.RMHARK_AI_MODEL || 'deepseek-chat';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY!,
      baseURL: 'https://api.deepseek.com/v1',
      maxRetries: 2,
    });
  }
  return _client;
}

export function isPredictionAIConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

async function chat(
  messages: { role: 'system' | 'user'; content: string }[],
  opts: { maxTokens: number; temperature?: number },
): Promise<string> {
  const res = await client().chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 1.0,
    stream: false,
  });
  return res.choices[0]?.message?.content ?? '';
}

/** Pull a JSON value out of a possibly fenced/explained model response. */
function stripJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  const endObj = body.lastIndexOf('}');
  const endArr = body.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  return start !== -1 && end !== -1 ? body.slice(start, end + 1) : body;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface SeedSpec {
  title: string;
  description?: string;
  daysOpen?: number;
}

/**
 * Ask DeepSeek for a batch of fresh prediction questions. Returns sanitized
 * specs; the caller decides how many to actually create.
 */
export async function generatePredictionSeeds(count: number): Promise<SeedSpec[]> {
  const system = [
    'You invent short, fun, binary (YES/NO) prediction-market questions for a gaming + social platform called RMH Studios.',
    'They should be light, plausible, and clearly resolvable (about games, tech, internet culture, sports, pop culture, or the platform itself).',
    'Avoid anything hateful, defamatory about real private individuals, or about real-world tragedies/violence.',
    'Output STRICT JSON only — an array, no prose, no markdown fences.',
    'Schema: [{"title": string (<=140 chars, phrased as a yes/no question), "description": string (<=240 chars, how it resolves), "daysOpen": integer 1..14}]',
  ].join('\n');

  const user = `Generate ${count} distinct prediction questions. Return only the JSON array.`;

  let parsed: unknown;
  try {
    const raw = await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 700, temperature: 1.15 },
    );
    parsed = JSON.parse(stripJson(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const specs: SeedSpec[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 160) : '';
    if (title.length < 8) continue;
    const description =
      typeof o.description === 'string' ? o.description.trim().slice(0, 1000) : undefined;
    const daysOpenRaw = typeof o.daysOpen === 'number' ? Math.round(o.daysOpen) : 5;
    const daysOpen = Math.min(14, Math.max(1, daysOpenRaw));
    specs.push({ title, description, daysOpen });
  }
  return specs;
}

/**
 * Seed up to `target` new OPEN AI markets, but only if the current number of
 * open AI markets is below `cap`. Returns how many were created.
 */
export async function seedPredictions(
  prisma: PrismaClient,
  opts: { target: number; cap: number } = { target: 3, cap: 24 },
): Promise<number> {
  if (!isPredictionAIConfigured()) return 0;

  const openAiCount = await prisma.prediction.count({
    where: { isAiGenerated: true, status: 'OPEN' },
  });
  if (openAiCount >= opts.cap) return 0;

  const room = Math.min(opts.target, opts.cap - openAiCount);
  const specs = await generatePredictionSeeds(room);
  let created = 0;
  for (const spec of specs.slice(0, room)) {
    const closesAt = new Date(Date.now() + (spec.daysOpen ?? 5) * 24 * 60 * 60 * 1000);
    await prisma.prediction.create({
      data: {
        title: spec.title,
        description: spec.description ?? null,
        creatorId: null,
        isAiGenerated: true,
        status: 'OPEN',
        closesAt,
      },
    });
    created++;
  }
  return created;
}

/**
 * Have a handful of random bot users place small trades on random OPEN markets.
 * This is the price noise. Side is mostly random, lightly mean-reverting so the
 * book doesn't run away to 1%/99%.
 */
export async function placeNoiseBets(
  prisma: PrismaClient,
  opts: { maxBets?: number; minStake?: number; maxStake?: number } = {},
): Promise<number> {
  const maxBets = opts.maxBets ?? 6;
  const minStake = opts.minStake ?? 2;
  const maxStake = opts.maxStake ?? 25;

  const markets = await prisma.prediction.findMany({
    where: {
      status: 'OPEN',
      OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
    },
    select: { id: true, qYes: true, qNo: true },
    take: 50,
  });
  if (markets.length === 0) return 0;

  const bots = await prisma.user.findMany({
    where: { isBot: true },
    select: { id: true },
    take: 200,
  });
  if (bots.length === 0) return 0;

  let placed = 0;
  const n = Math.min(maxBets, Math.ceil(Math.random() * maxBets));
  for (let i = 0; i < n; i++) {
    const market = randomItem(markets);
    const bot = randomItem(bots);
    // Lightly mean-revert: if the book already leans heavily one way, bias the
    // bet toward the cheaper side so probabilities wobble instead of pinning.
    const lean = market.qYes - market.qNo;
    let side: Side = Math.random() < 0.5 ? 'YES' : 'NO';
    if (Math.abs(lean) > 60) side = lean > 0 ? 'NO' : 'YES';
    const stake = minStake + Math.floor(Math.random() * (maxStake - minStake + 1));

    try {
      // Ensure the bot can afford it (bots may have no profile yet).
      await prisma.userProfile.upsert({
        where: { userId: bot.id },
        create: { userId: bot.id, coins: 500 },
        update: { coins: { increment: 50 } },
      });
      await placeTrade({ userId: bot.id, predictionId: market.id, side, amount: stake }, prisma);
      placed++;
    } catch {
      // Ignore individual failures (closed market, race, etc.).
    }
  }
  return placed;
}

/** Ask DeepSeek to call a single market YES or NO. */
export async function judgePrediction(market: {
  title: string;
  description: string | null;
}): Promise<Side> {
  const system = [
    'You are settling a binary YES/NO prediction market. Decide the most likely real-world outcome.',
    'Reply with EXACTLY one word: YES or NO. No punctuation, no explanation.',
  ].join('\n');
  const user = [
    `Question: ${market.title}`,
    market.description ? `Details: ${market.description}` : '',
    '',
    'Answer YES or NO.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = (await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 4, temperature: 0.7 },
    )).toUpperCase();
    return raw.includes('YES') ? 'YES' : 'NO';
  } catch {
    // Coin-flip fallback so a model hiccup doesn't strand a closed market.
    return Math.random() < 0.5 ? 'YES' : 'NO';
  }
}

/**
 * Resolve AI-seeded markets whose `closesAt` has passed. With small probability,
 * also resolves one still-open AI market early (the "alter outcomes over time"
 * behaviour). Returns how many were resolved.
 */
export async function resolveDuePredictions(
  prisma: PrismaClient,
  opts: { maxResolves?: number; earlyResolveProb?: number } = {},
): Promise<number> {
  if (!isPredictionAIConfigured()) return 0;
  const maxResolves = opts.maxResolves ?? 4;
  const earlyResolveProb = opts.earlyResolveProb ?? 0.15;

  const due = await prisma.prediction.findMany({
    where: {
      isAiGenerated: true,
      status: 'OPEN',
      closesAt: { not: null, lte: new Date() },
    },
    select: { id: true, title: true, description: true },
    take: maxResolves,
  });

  const toResolve = [...due];

  // Occasionally pick a not-yet-due AI market to resolve early.
  if (toResolve.length < maxResolves && Math.random() < earlyResolveProb) {
    const candidates = await prisma.prediction.findMany({
      where: {
        isAiGenerated: true,
        status: 'OPEN',
        OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
      },
      select: { id: true, title: true, description: true },
      take: 25,
    });
    if (candidates.length) toResolve.push(randomItem(candidates));
  }

  let resolved = 0;
  for (const m of toResolve.slice(0, maxResolves)) {
    const outcome = await judgePrediction(m);
    try {
      const r = await resolvePrediction({ predictionId: m.id, outcome }, prisma);
      if (r.resolved) resolved++;
    } catch {
      // Ignore (already resolved, race, etc.).
    }
  }
  return resolved;
}
