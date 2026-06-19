/**
 * RMHark Bot Worker
 *
 * Long-lived Node.js process that keeps a population of synthetic users alive
 * on the RMHark feed:
 *
 *   1. Maintains a pool of AI-generated "bot" users — each with a DeepSeek-
 *      invented name, handle, and bio, an online-sourced avatar, and a private
 *      persona (theme + temperament + voice) that defines how they post.
 *   2. Throughout the day, randomly posts from those users in their own voice,
 *      paced per-bot by how active their persona is.
 *
 * Bots never announce that they are bots and are instructed never to reveal it.
 * Runs as a separate Docker service / dev process. Idles harmlessly if no
 * DEEPSEEK_API_KEY is configured.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  rollPersona,
  composePersona,
  buildAvatarUrl,
} from '@/lib/rmhark-ai/persona';
import {
  generateBotProfile,
  generatePost,
  isRmharkAIConfigured,
} from '@/lib/rmhark-ai/generate.server';

// ─── Config ─────────────────────────────────────────────────────
/** Read a positive integer env var, falling back to a default on missing/invalid input. */
function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TARGET_BOT_COUNT = intEnv('BOT_TARGET_COUNT', 12);
// How many new bots to mint per maintenance cycle (spreads out API calls).
const BOT_CREATE_BATCH = intEnv('BOT_CREATE_BATCH', 4);
// How often to top up the bot pool (default 6h).
const USER_CHECK_MS = intEnv('BOT_USER_CHECK_MS', 6 * 60 * 60 * 1000);
// How often to consider posting (default 10m).
const POST_TICK_MS = intEnv('BOT_POST_TICK_MS', 10 * 60 * 1000);
// Most posts we'll create in a single tick (protects the DB + paid API).
const MAX_POSTS_PER_TICK = intEnv('BOT_MAX_POSTS_PER_TICK', 3);

const TICKS_PER_DAY = (24 * 60 * 60 * 1000) / POST_TICK_MS;

// ─── Prisma (standalone client for the worker process) ──────────
function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}
const prisma = createPrisma();

const log = (...args: unknown[]) => console.log('[bot-worker]', ...args);
const errlog = (...args: unknown[]) => console.error('[bot-worker]', ...args);

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Bot user creation ──────────────────────────────────────────

/** Find a handle not already taken, deriving from the model's suggestion. */
async function uniqueHandle(base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const existing = await prisma.user.findUnique({
      where: { handle: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    const suffix = String(Math.floor(Math.random() * 9000) + 100);
    candidate = `${base.slice(0, 14)}${suffix}`;
  }
  // Extremely unlikely fallback.
  return `${base.slice(0, 10)}${Date.now().toString(36).slice(-5)}`;
}

async function createBot(): Promise<void> {
  const spec = rollPersona();
  const profile = await generateBotProfile(spec);
  const handle = await uniqueHandle(profile.handle);
  const persona = composePersona(spec);
  const avatar = buildAvatarUrl(handle, spec.avatarStyle);

  await prisma.user.create({
    data: {
      name: profile.name,
      handle,
      image: avatar,
      isBot: true,
      botPersona: persona,
      profile: {
        create: {
          bio: profile.bio.slice(0, 160),
        },
      },
    },
  });
  log(`created bot @${handle} (${profile.name}) — ${spec.theme} / ${spec.voice.id}`);
}

async function maintainBotPool(): Promise<void> {
  const count = await prisma.user.count({ where: { isBot: true } });
  if (count >= TARGET_BOT_COUNT) return;

  const toCreate = Math.min(BOT_CREATE_BATCH, TARGET_BOT_COUNT - count);
  log(`bot pool ${count}/${TARGET_BOT_COUNT} — minting ${toCreate}`);
  for (let i = 0; i < toCreate; i++) {
    try {
      await createBot();
    } catch (e) {
      errlog('createBot failed:', e);
    }
  }
}

// ─── Posting ────────────────────────────────────────────────────

interface BotRow {
  id: string;
  botPersona: string | null;
  botLastPostAt: Date | null;
}

/** Decide whether a given bot should post this tick. */
function shouldPost(bot: BotRow): boolean {
  // Derive a per-day rate from the persona's ACTIVITY line; default ~3/day.
  const persona = bot.botPersona ?? '';
  let perDay = 3;
  if (/very online|frequently/i.test(persona)) perDay = 6;
  else if (/rare poster|only chimes in/i.test(persona)) perDay = 1;
  else if (/flurry|goes quiet/i.test(persona)) perDay = 4;

  // Enforce a minimum gap so a bot can't post twice back-to-back.
  if (bot.botLastPostAt) {
    const minGapMs = (24 * 60 * 60 * 1000) / (perDay * 2 + 1);
    if (Date.now() - bot.botLastPostAt.getTime() < minGapMs) return false;
  }

  const probability = perDay / TICKS_PER_DAY;
  return Math.random() < probability;
}

async function postTick(): Promise<void> {
  const bots = await prisma.user.findMany({
    where: { isBot: true },
    select: { id: true, botPersona: true, botLastPostAt: true },
  });
  if (bots.length === 0) return;

  const due = shuffle(bots.filter(shouldPost)).slice(0, MAX_POSTS_PER_TICK);
  for (const bot of due) {
    try {
      const content = await generatePost({ persona: bot.botPersona ?? undefined });
      if (!content.trim()) continue;
      await prisma.rMHark.create({
        data: { userId: bot.id, content },
      });
      await prisma.user.update({
        where: { id: bot.id },
        data: { botLastPostAt: new Date() },
      });
      log(`posted as ${bot.id}: ${content.slice(0, 60).replace(/\n/g, ' ')}…`);
    } catch (e) {
      errlog('post failed:', e);
    }
  }
}

// ─── Loops ──────────────────────────────────────────────────────
let userTimer: NodeJS.Timeout | undefined;
let postTimer: NodeJS.Timeout | undefined;
let maintaining = false;
let posting = false;

async function safeMaintain() {
  if (maintaining) return;
  maintaining = true;
  try {
    await maintainBotPool();
  } catch (e) {
    errlog('pool maintenance failed:', e);
  } finally {
    maintaining = false;
  }
}

async function safePostTick() {
  if (posting) return;
  posting = true;
  try {
    await postTick();
  } catch (e) {
    errlog('post tick failed:', e);
  } finally {
    posting = false;
  }
}

async function startup() {
  log('Starting…');
  if (!isRmharkAIConfigured()) {
    log('DEEPSEEK_API_KEY not set — idling (no bots will be generated).');
    return;
  }
  log(
    `config: target=${TARGET_BOT_COUNT}, postTick=${POST_TICK_MS}ms, userCheck=${USER_CHECK_MS}ms`,
  );

  await safeMaintain();

  userTimer = setInterval(() => void safeMaintain(), USER_CHECK_MS);
  postTimer = setInterval(() => void safePostTick(), POST_TICK_MS);
  log('Scheduled.');
}

void startup();

// ─── Graceful shutdown ──────────────────────────────────────────
async function shutdown(signal: string) {
  log(`${signal} received, shutting down…`);
  if (userTimer) clearInterval(userTimer);
  if (postTimer) clearInterval(postTimer);
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
