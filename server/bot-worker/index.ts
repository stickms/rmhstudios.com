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
  randomItem,
} from '@/lib/rmhark-ai/persona';
import {
  generateBotProfile,
  generatePost,
  generateReply,
  generateDirectMessageReply,
  generateDirectMessageOpener,
  isRmharkAIConfigured,
} from '@/lib/rmhark-ai/generate.server';
import {
  canBotMessage,
  decideInitiation,
  formatDmHistory,
  type DmPrivacy,
} from '@/lib/rmhark-ai/dm-policy';
import type { MessagePayload } from '@/lib/message-events';

// ─── Config ─────────────────────────────────────────────────────
/** Read a positive integer env var, falling back to a default on missing/invalid input. */
function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
/** Read a 0..1 probability env var, falling back to a default on missing/invalid input. */
function probEnv(name: string, fallback: number): number {
  const n = parseFloat(process.env[name] ?? '');
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

const TARGET_BOT_COUNT = intEnv('BOT_TARGET_COUNT', 20);
// How many new bots to mint per maintenance cycle (spreads out API calls).
const BOT_CREATE_BATCH = intEnv('BOT_CREATE_BATCH', 6);
// How often to top up the bot pool (default 2h).
const USER_CHECK_MS = intEnv('BOT_USER_CHECK_MS', 2 * 60 * 60 * 1000);
// How often to consider posting (default 5m).
const POST_TICK_MS = intEnv('BOT_POST_TICK_MS', 5 * 60 * 1000);
// Most posts we'll create in a single tick (protects the DB + paid API).
const MAX_POSTS_PER_TICK = intEnv('BOT_MAX_POSTS_PER_TICK', 5);

// ─── Reply behaviour ────────────────────────────────────────────
// How often bots check for replies to answer (default = same as posting).
const REPLY_TICK_MS = intEnv('BOT_REPLY_TICK_MS', POST_TICK_MS);
// Only react to comments newer than this (default 12h).
const REPLY_LOOKBACK_MS = intEnv('BOT_REPLY_LOOKBACK_MS', 12 * 60 * 60 * 1000);
// Cap replies created per tick (protects the DB + paid API).
const MAX_REPLIES_PER_TICK = intEnv('BOT_MAX_REPLIES_PER_TICK', 4);
// Stop a thread from spiralling: don't auto-reply past this comment depth.
const MAX_REPLY_DEPTH = intEnv('BOT_MAX_REPLY_DEPTH', 6);
// Probability a bot answers a *human* who replied to it (responsive).
const REACTIVE_HUMAN_PROB = probEnv('BOT_REACTIVE_HUMAN_PROB', 0.9);
// Probability a bot answers *another bot* who replied to it (less frequent).
const BOT_TO_BOT_PROB = probEnv('BOT_TO_BOT_REPLY_PROB', 0.3);
// Probability per tick that a bot proactively replies to another bot's post.
const PROACTIVE_PROB = probEnv('BOT_PROACTIVE_PROB', 0.4);
// Proactive replies only target posts newer than this (default 6h).
const PROACTIVE_LOOKBACK_MS = intEnv('BOT_PROACTIVE_LOOKBACK_MS', 6 * 60 * 60 * 1000);

// ─── DM behaviour ───────────────────────────────────────────────
// How often the worker services DMs (snappier than the feed tick).
const DM_TICK_MS = intEnv('BOT_DM_TICK_MS', 60 * 1000);
// Only react to human DMs whose conversation moved within this window (default 24h).
const DM_LOOKBACK_MS = intEnv('BOT_DM_LOOKBACK_MS', 24 * 60 * 60 * 1000);
// Cap reactive DM replies created per tick (protects the DB + paid API).
const MAX_DM_REPLIES_PER_TICK = intEnv('BOT_MAX_DM_REPLIES_PER_TICK', 4);
// Probability a bot answers a human's DM (a DM expects an answer).
const REACTIVE_DM_PROB = probEnv('BOT_REACTIVE_DM_PROB', 1.0);
// Probability per tick that any bot-initiated opener happens at all.
const DM_INITIATE_PROB = probEnv('BOT_DM_INITIATE_PROB', 0.15);
// Cap bot-initiated openers per tick.
const MAX_DM_OPENERS_PER_TICK = intEnv('BOT_MAX_DM_OPENERS_PER_TICK', 1);
// Silence after a lone opener before one gentle follow-up (default 3 days).
const DM_FOLLOWUP_SILENCE_MS = intEnv('BOT_DM_FOLLOWUP_SILENCE_MS', 3 * 24 * 60 * 60 * 1000);
// Window defining "recently-active" candidate humans for openers (default 7 days).
const DM_ACTIVE_HUMAN_LOOKBACK_MS = intEnv('BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS', 7 * 24 * 60 * 60 * 1000);

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
  // Derive a per-day rate from the persona's ACTIVITY line; default ~5/day.
  const persona = bot.botPersona ?? '';
  let perDay = 5;
  if (/very online|frequently/i.test(persona)) perDay = 9;
  else if (/rare poster|only chimes in/i.test(persona)) perDay = 2;
  else if (/flurry|goes quiet/i.test(persona)) perDay = 6;

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

// ─── Replies ────────────────────────────────────────────────────

interface ReplyContext {
  postContent: string;
  quotedPostContent?: string;
  thread: string[];
}

/**
 * Build the context for replying to a given comment: the post (and any post it
 * quotes) plus the ancestor comment chain from the top down to that comment.
 */
async function buildReplyContext(commentId: string): Promise<ReplyContext | null> {
  const thread: string[] = [];
  let currentId: string | null = commentId;
  let rmheetId: string | null = null;
  for (let depth = 0; currentId && depth < MAX_REPLY_DEPTH + 2; depth++) {
    const node: { content: string; parentId: string | null; rmheetId: string } | null =
      await prisma.rMHarkComment.findUnique({
        where: { id: currentId },
        select: { content: true, parentId: true, rmheetId: true },
      });
    if (!node) break;
    thread.unshift(node.content);
    rmheetId = node.rmheetId;
    currentId = node.parentId;
  }
  if (!rmheetId) return null;

  const post = await prisma.rMHark.findUnique({
    where: { id: rmheetId },
    select: { content: true, original: { select: { content: true } } },
  });
  if (!post) return null;

  return {
    postContent: post.content,
    quotedPostContent: post.original?.content || undefined,
    thread,
  };
}

const personaCache = new Map<string, string | null>();
async function getPersona(userId: string): Promise<string | undefined> {
  if (!personaCache.has(userId)) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { botPersona: true },
    });
    personaCache.set(userId, u?.botPersona ?? null);
  }
  return personaCache.get(userId) ?? undefined;
}

// ─── DMs ────────────────────────────────────────────────────────

/** Resolve the web origin the worker calls for the SSE notify bridge. */
function internalApiBase(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/$/, '');
  const auth = process.env.BETTER_AUTH_URL;
  if (auth) {
    try {
      return new URL(auth).origin;
    } catch {
      /* fall through */
    }
  }
  return 'http://127.0.0.1:7005';
}

/**
 * Push a live SSE event for a bot DM into the web process. Best-effort: if the
 * secret is unset or the call fails, the message is already persisted and the
 * human will see it on their next stream reconnect.
 */
async function notifyMessageDelivered(userId: string, message: MessagePayload): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return; // bridge disabled — graceful degradation
  try {
    await fetch(`${internalApiBase()}/api/internal/notify-message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ userId, message }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    errlog('notify bridge failed:', e);
  }
}

/** Create one DM from `botId`, bump the conversation, and push the live event. */
async function sendBotDm(
  conversationId: string,
  botId: string,
  humanId: string,
  content: string,
): Promise<void> {
  const [message] = await prisma.$transaction([
    prisma.directMessage.create({ data: { conversationId, senderId: botId, content } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ]);
  const payload: MessagePayload = {
    id: message.id,
    conversationId,
    content: message.content,
    senderId: message.senderId,
    read: message.read,
    createdAt: message.createdAt.toISOString(),
  };
  await notifyMessageDelivered(humanId, payload);
}

/**
 * Reactive DM replies: when a human's message is the latest in a conversation
 * with a bot, the bot replies in-character. No privacy check — the human opened
 * the conversation by messaging the bot.
 */
async function answerDirectMessages(): Promise<number> {
  const since = new Date(Date.now() - DM_LOOKBACK_MS);
  const conversations = await prisma.conversation.findMany({
    where: {
      lastMessageAt: { gte: since },
      OR: [
        { participantOne: { is: { isBot: true } } },
        { participantTwo: { is: { isBot: true } } },
      ],
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 60,
    select: {
      id: true,
      participantOneId: true,
      participantTwoId: true,
      participantOne: { select: { isBot: true } },
      participantTwo: { select: { isBot: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { senderId: true } },
    },
  });

  // Keep conversations where exactly one participant is a bot and the human spoke last.
  const candidates = conversations
    .map((c) => {
      const oneBot = !!c.participantOne?.isBot;
      const twoBot = !!c.participantTwo?.isBot;
      if (oneBot === twoBot) return null; // both bots or neither — skip
      const botId = oneBot ? c.participantOneId : c.participantTwoId;
      const humanId = oneBot ? c.participantTwoId : c.participantOneId;
      const last = c.messages[0];
      if (!last || last.senderId === botId) return null; // nothing new from the human
      return { conversationId: c.id, botId, humanId };
    })
    .filter((x): x is { conversationId: string; botId: string; humanId: string } => x !== null);

  let made = 0;
  for (const cand of shuffle(candidates)) {
    if (made >= MAX_DM_REPLIES_PER_TICK) break;
    if (Math.random() > REACTIVE_DM_PROB) continue;
    try {
      const persona = await getPersona(cand.botId);
      if (!persona) continue;

      const recent = await prisma.directMessage.findMany({
        where: { conversationId: cand.conversationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { senderId: true, content: true },
      });
      const history = formatDmHistory(recent.reverse(), cand.botId);

      const content = await generateDirectMessageReply({ persona, history });
      if (!content.trim()) continue;

      await sendBotDm(cand.conversationId, cand.botId, cand.humanId, content);
      made++;
      log(`bot ${cand.botId} answered DM from ${cand.humanId}`);
    } catch (e) {
      errlog('reactive DM failed:', e);
    }
  }
  return made;
}

/** Canonical participant ordering for the Conversation unique constraint. */
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Bot-initiated DMs: rarely, a bot opens (or gently follows up) a DM with a
 * recently-active human, respecting DM privacy and the anti-pester rules.
 */
async function initiateDirectMessages(): Promise<void> {
  if (Math.random() > DM_INITIATE_PROB) return;

  const since = new Date(Date.now() - DM_ACTIVE_HUMAN_LOOKBACK_MS);
  const [recentPosts, recentComments, bots] = await Promise.all([
    prisma.rMHark.findMany({
      where: { createdAt: { gte: since }, deletedAt: null, user: { is: { isBot: false } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { userId: true },
    }),
    prisma.rMHarkComment.findMany({
      where: { createdAt: { gte: since }, deletedAt: null, user: { is: { isBot: false } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { userId: true },
    }),
    prisma.user.findMany({ where: { isBot: true }, select: { id: true, botPersona: true } }),
  ]);
  if (bots.length === 0) return;

  const humanIds = shuffle([
    ...new Set([...recentPosts, ...recentComments].map((r) => r.userId)),
  ]);
  if (humanIds.length === 0) return;

  let opened = 0;
  for (const humanId of humanIds) {
    if (opened >= MAX_DM_OPENERS_PER_TICK) break;

    const bot = randomItem(bots);
    if (!bot.botPersona || bot.id === humanId) continue;

    try {
      // Privacy gate (mirrors app/routes/api/messages.ts).
      const human = await prisma.user.findUnique({
        where: { id: humanId },
        select: { profile: { select: { dmPrivacy: true } } },
      });
      const dmPrivacy = (human?.profile?.dmPrivacy ?? 'EVERYONE') as DmPrivacy;
      let humanFollowsBot = false;
      if (dmPrivacy === 'FOLLOWERS') {
        const follows = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: humanId, followingId: bot.id } },
          select: { id: true },
        });
        humanFollowsBot = !!follows;
      }
      if (!canBotMessage({ dmPrivacy, humanFollowsBot })) continue;

      // Anti-pester gate, from the existing conversation (if any).
      const [pOne, pTwo] = orderPair(bot.id, humanId);
      const existing = await prisma.conversation.findUnique({
        where: { participantOneId_participantTwoId: { participantOneId: pOne, participantTwoId: pTwo } },
        select: {
          id: true,
          messages: { orderBy: { createdAt: 'asc' }, take: 10, select: { senderId: true, createdAt: true } },
        },
      });
      const decision = decideInitiation({
        botId: bot.id,
        now: Date.now(),
        followupSilenceMs: DM_FOLLOWUP_SILENCE_MS,
        messages: existing ? existing.messages : null,
      });
      if (decision === 'skip') continue;

      const content = await generateDirectMessageOpener({ persona: bot.botPersona });
      if (!content.trim()) continue;

      const conversation = await prisma.conversation.upsert({
        where: { participantOneId_participantTwoId: { participantOneId: pOne, participantTwoId: pTwo } },
        create: { participantOneId: pOne, participantTwoId: pTwo },
        update: {},
        select: { id: true },
      });

      await sendBotDm(conversation.id, bot.id, humanId, content);
      opened++;
      log(`bot ${bot.id} ${decision === 'followup' ? 'followed up with' : 'opened DM to'} ${humanId}`);
    } catch (e) {
      errlog('DM initiation failed:', e);
    }
  }
}

/** Post a single in-character reply from `botId` to `comment`. */
async function replyToComment(
  botId: string,
  comment: { id: string; rmheetId: string },
): Promise<boolean> {
  const ctx = await buildReplyContext(comment.id);
  if (!ctx) return false;
  if (ctx.thread.length >= MAX_REPLY_DEPTH) return false;

  const content = await generateReply({
    postContent: ctx.postContent,
    quotedPostContent: ctx.quotedPostContent,
    thread: ctx.thread,
    persona: await getPersona(botId),
  });
  if (!content.trim()) return false;

  await prisma.rMHarkComment.create({
    data: { rmheetId: comment.rmheetId, userId: botId, content, parentId: comment.id },
  });
  await prisma.user.update({ where: { id: botId }, data: { botLastPostAt: new Date() } });
  return true;
}

/**
 * Reactive replies: when someone (human or bot) replies to a bot's post or
 * comment, the bot replies back in-context. Humans get answered readily; bots
 * answering bots is rarer and depth-capped so threads don't spiral.
 */
async function reactToComments(): Promise<number> {
  const since = new Date(Date.now() - REPLY_LOOKBACK_MS);
  const comments = await prisma.rMHarkComment.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: {
      id: true,
      userId: true,
      parentId: true,
      rmheetId: true,
      user: { select: { isBot: true } },
      parent: { select: { userId: true, user: { select: { isBot: true } } } },
      rmhark: { select: { userId: true, deletedAt: true, user: { select: { isBot: true } } } },
      replies: { select: { userId: true } },
    },
  });

  // Resolve the bot being replied to for each comment.
  const candidates = comments
    .map((c) => {
      const targetId = c.parentId ? c.parent?.userId : c.rmhark?.userId;
      const targetIsBot = c.parentId ? c.parent?.user?.isBot : c.rmhark?.user?.isBot;
      const authorIsBot = !!c.user?.isBot;
      return { c, targetId, targetIsBot, authorIsBot };
    })
    .filter(
      (x) =>
        x.targetId &&
        x.targetIsBot && // we only make *bots* reply
        x.c.rmhark && !x.c.rmhark.deletedAt &&
        x.targetId !== x.c.userId && // never reply to yourself
        !x.c.replies.some((r) => r.userId === x.targetId), // not already answered
    );

  let made = 0;
  for (const cand of shuffle(candidates)) {
    if (made >= MAX_REPLIES_PER_TICK) break;
    const prob = cand.authorIsBot ? BOT_TO_BOT_PROB : REACTIVE_HUMAN_PROB;
    if (Math.random() > prob) continue;
    try {
      if (await replyToComment(cand.targetId!, { id: cand.c.id, rmheetId: cand.c.rmheetId })) {
        made++;
        log(`bot ${cand.targetId} replied to ${cand.authorIsBot ? 'bot' : 'user'} comment ${cand.c.id}`);
      }
    } catch (e) {
      errlog('reactive reply failed:', e);
    }
  }
  return made;
}

/**
 * Proactive bot-to-bot chatter: occasionally a bot starts a conversation by
 * replying to another bot's recent post. Kept infrequent (one per tick, gated
 * by a probability) so the feed doesn't fill with bot small-talk.
 */
async function seedBotConversation(): Promise<void> {
  if (Math.random() > PROACTIVE_PROB) return;

  const since = new Date(Date.now() - PROACTIVE_LOOKBACK_MS);
  const posts = await prisma.rMHark.findMany({
    where: { deletedAt: null, createdAt: { gte: since }, user: { is: { isBot: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      content: true,
      userId: true,
      original: { select: { content: true } },
      comments: { select: { userId: true } },
    },
  });
  if (posts.length === 0) return;

  const post = randomItem(posts);
  const commenterIds = new Set(post.comments.map((c) => c.userId));
  const bots = await prisma.user.findMany({
    where: { isBot: true, id: { not: post.userId } },
    select: { id: true, botPersona: true },
  });
  const eligible = bots.filter((b) => !commenterIds.has(b.id));
  if (eligible.length === 0) return;

  const bot = randomItem(eligible);
  try {
    const content = await generateReply({
      postContent: post.content,
      quotedPostContent: post.original?.content || undefined,
      thread: [],
      persona: bot.botPersona ?? undefined,
    });
    if (!content.trim()) return;
    await prisma.rMHarkComment.create({
      data: { rmheetId: post.id, userId: bot.id, content },
    });
    await prisma.user.update({ where: { id: bot.id }, data: { botLastPostAt: new Date() } });
    log(`bot ${bot.id} proactively replied to bot post ${post.id}`);
  } catch (e) {
    errlog('proactive reply failed:', e);
  }
}

async function replyTick(): Promise<void> {
  personaCache.clear();
  await reactToComments();
  await seedBotConversation();
}

async function dmTick(): Promise<void> {
  personaCache.clear();
  await answerDirectMessages();
  await initiateDirectMessages();
}

// ─── Loops ──────────────────────────────────────────────────────
let userTimer: NodeJS.Timeout | undefined;
let postTimer: NodeJS.Timeout | undefined;
let replyTimer: NodeJS.Timeout | undefined;
let dmTimer: NodeJS.Timeout | undefined;
let maintaining = false;
let posting = false;
let replying = false;
let dmRunning = false;

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

async function safeReplyTick() {
  if (replying) return;
  replying = true;
  try {
    await replyTick();
  } catch (e) {
    errlog('reply tick failed:', e);
  } finally {
    replying = false;
  }
}

async function safeDmTick() {
  if (dmRunning) return;
  dmRunning = true;
  try {
    await dmTick();
  } catch (e) {
    errlog('dm tick failed:', e);
  } finally {
    dmRunning = false;
  }
}

async function startup() {
  log('Starting…');
  if (!isRmharkAIConfigured()) {
    log('DEEPSEEK_API_KEY not set — idling (no bots will be generated).');
    return;
  }
  log(
    `config: target=${TARGET_BOT_COUNT}, postTick=${POST_TICK_MS}ms, replyTick=${REPLY_TICK_MS}ms, dmTick=${DM_TICK_MS}ms, userCheck=${USER_CHECK_MS}ms`,
  );

  await safeMaintain();

  userTimer = setInterval(() => void safeMaintain(), USER_CHECK_MS);
  postTimer = setInterval(() => void safePostTick(), POST_TICK_MS);
  replyTimer = setInterval(() => void safeReplyTick(), REPLY_TICK_MS);
  dmTimer = setInterval(() => void safeDmTick(), DM_TICK_MS);
  log('Scheduled.');
}

void startup();

// ─── Graceful shutdown ──────────────────────────────────────────
async function shutdown(signal: string) {
  log(`${signal} received, shutting down…`);
  if (userTimer) clearInterval(userTimer);
  if (postTimer) clearInterval(postTimer);
  if (replyTimer) clearInterval(replyTimer);
  if (dmTimer) clearInterval(dmTimer);
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
