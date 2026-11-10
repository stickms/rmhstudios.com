/**
 * The RMHark bot-worker (D3: ported from the Go worker `internal/botworker`, which
 * ported the original Node worker). Server-only; runs in the `jobs` worker as
 * pg-boss crons. It keeps a pool of AI-generated synthetic users and posts,
 * replies and DMs from them in their own voice. Bots never reveal they are bots.
 *
 *   bot-worker.maintain   every minute: top the pool up when the admin interval has elapsed
 *                          (or an admin just saved settings), and once at boot.
 *   bot-worker.post       BOT_POST_TICK_MS (default 5 min): due bots post, capped per tick.
 *   bot-worker.reply      BOT_REPLY_TICK_MS (default = post tick): answer comments aimed at
 *                          bots, then proactive bot-to-bot comments.
 *   bot-worker.dm         BOT_DM_TICK_MS (default 1 min): answer humans' DMs, rarely open one.
 *
 * Idles (registers nothing) without DEEPSEEK_API_KEY. Every tick is failure-isolated:
 * one bad generation or row is logged and skipped, a tick never throws, so pg-boss
 * never retries (and so never double-posts). A queue uses the `exclusive` policy, which
 * is the old per-tick reentrancy guard: a tick that is still running is not stacked.
 *
 * Reused rather than re-implemented: persona tables (`./persona`), the prompts and
 * DeepSeek calls (`./generate.server`, model overridden with BOT_AI_MODEL), post
 * images (`./image.server`: xAI, shared daily budget, S3), DM policy (`./dm-policy`),
 * the per-bot posting rate (`./bot-stats`) and the handle rules (`@/lib/handle`).
 *
 * Differences from the Go worker (deliberate): prompts and output cleaning are the
 * `generate.server` ones the Go copy was ported from (it drifted); pg-boss cron is
 * one-minute granular; BOT_AI_BASE_URL (a test stand-in hook) is gone; JobRuns
 * counters are structured log lines (`bot_worker.*`) instead of Prometheus.
 */
import { prisma } from '@/lib/prisma.server';
import { Prisma } from '@prisma/client';
import { decideInitiation, canBotMessage, formatDmHistory, type DmPrivacy } from './dm-policy';
import { buildAvatarUrl, composePersona, rollPersona } from './persona';
import {
  generateBotProfile,
  generateDirectMessageOpener,
  generateDirectMessageReply,
  generatePost,
  generateReply,
  isRmharkAIConfigured,
} from './generate.server';
import { generatePostImage, isImageGenConfigured } from './image.server';
import {
  clampSettings,
  cronForInterval,
  effectiveTickMs,
  loadBotConfig,
  maintenanceDue,
  orderPair,
  sanitizeHandle,
  scaledCount,
  shouldPost,
  type BotConfig,
} from './bot-worker-config';
import { DEFAULT_BOT_SETTINGS, type BotWorkerSettingsInput } from './bot-stats';

export const BOT_MAINTAIN_QUEUE = 'bot-worker.maintain';
export const BOT_POST_QUEUE = 'bot-worker.post';
export const BOT_REPLY_QUEUE = 'bot-worker.reply';
export const BOT_DM_QUEUE = 'bot-worker.dm';
export const BOT_QUEUES = [
  BOT_MAINTAIN_QUEUE,
  BOT_POST_QUEUE,
  BOT_REPLY_QUEUE,
  BOT_DM_QUEUE,
] as const;

/** Maintenance is checked every minute (the Go pool loop's settings poll). */
export const BOT_MAINTAIN_CRON = '* * * * *';

// ─── repository ─────────────────────────────────────────────────────────────

export interface BotUserRow {
  id: string;
  botPersona: string;
  botLastPostAt: Date | null;
}

export interface SavedSettings extends BotWorkerSettingsInput {
  updatedAt: Date;
}

export interface CommentRow {
  id: string;
  userId: string;
  parentId: string | null;
  rmheetId: string;
  authorIsBot: boolean;
  postUserId: string;
  postDeletedAt: Date | null;
  postUserIsBot: boolean;
  parentUserId: string | null;
  parentUserIsBot: boolean | null;
}

export interface ReplyContext {
  postContent: string;
  quotedPostContent: string;
  thread: string[];
}

export interface BotPostRow {
  id: string;
  content: string;
  userId: string;
  quotedContent: string;
}

export interface ConversationRow {
  id: string;
  participantOneId: string;
  participantTwoId: string;
  oneIsBot: boolean;
  twoIsBot: boolean;
  /** Sender of the conversation's newest message ('' if none). */
  lastSenderId: string;
}

export interface DmPayload {
  id: string;
  conversationId: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
}

/** Everything the ticks need from the database, so they can be driven without one in tests. */
export interface BotRepo {
  loadSettings(): Promise<SavedSettings | null>;
  countBots(): Promise<number>;
  handleExists(handle: string): Promise<boolean>;
  createBotUser(b: {
    name: string;
    handle: string;
    image: string;
    persona: string;
    bio: string;
  }): Promise<void>;
  loadBots(): Promise<BotUserRow[]>;
  insertPost(userId: string, content: string, imageUrls: string[]): Promise<string>;
  touchBot(userId: string): Promise<void>;
  botPersona(botId: string): Promise<string>;
  recentComments(since: Date): Promise<CommentRow[]>;
  commentAlreadyAnswered(commentId: string, targetBotId: string): Promise<boolean>;
  buildReplyContext(commentId: string, maxDepth: number): Promise<ReplyContext | null>;
  insertComment(
    rmheetId: string,
    userId: string,
    content: string,
    parentId: string | null,
  ): Promise<void>;
  recentBotPosts(since: Date): Promise<BotPostRow[]>;
  /** Bots other than `excludeId` ('' = all). */
  botsExcept(excludeId: string): Promise<BotUserRow[]>;
  commentersOnPost(rmheetId: string): Promise<Set<string>>;
  recentBotConversations(since: Date): Promise<ConversationRow[]>;
  /** Newest first. */
  recentDmHistory(conversationId: string): Promise<{ senderId: string; content: string }[]>;
  sendBotDm(conversationId: string, botId: string, content: string): Promise<DmPayload>;
  dmPrivacy(userId: string): Promise<DmPrivacy>;
  followExists(followerId: string, followingId: string): Promise<boolean>;
  conversationOpenerMessages(
    pOne: string,
    pTwo: string,
  ): Promise<{ senderId: string; createdAt: Date }[] | null>;
  upsertConversation(pOne: string, pTwo: string): Promise<string>;
  recentActiveHumans(since: Date): Promise<string[]>;
}

export const prismaBotRepo: BotRepo = {
  async loadSettings() {
    const row = await prisma.botWorkerSettings.findUnique({ where: { id: 'default' } });
    if (!row) return null;
    return {
      targetBotCount: row.targetBotCount,
      createBatch: row.createBatch,
      createIntervalMin: row.createIntervalMin,
      postRateMultiplier: row.postRateMultiplier,
      maxPostsPerTick: row.maxPostsPerTick,
      updatedAt: row.updatedAt,
    };
  },
  countBots: () => prisma.user.count({ where: { isBot: true } }),
  async handleExists(handle) {
    return (await prisma.user.findUnique({ where: { handle }, select: { id: true } })) != null;
  },
  async createBotUser(b) {
    await prisma.user.create({
      data: {
        name: b.name,
        handle: b.handle,
        image: b.image,
        isBot: true,
        botPersona: b.persona,
        profile: { create: { bio: b.bio } },
      },
    });
  },
  async loadBots() {
    const rows = await prisma.user.findMany({
      where: { isBot: true },
      select: { id: true, botPersona: true, botLastPostAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      botPersona: r.botPersona ?? '',
      botLastPostAt: r.botLastPostAt,
    }));
  },
  async insertPost(userId, content, imageUrls) {
    const row = await prisma.rMHark.create({
      data: { userId, content, imageUrls },
      select: { id: true },
    });
    return row.id;
  },
  async touchBot(userId) {
    await prisma.user.update({ where: { id: userId }, data: { botLastPostAt: new Date() } });
  },
  async botPersona(botId) {
    const row = await prisma.user.findFirst({
      where: { id: botId, isBot: true },
      select: { botPersona: true },
    });
    return row?.botPersona ?? '';
  },
  async recentComments(since) {
    const rows = await prisma.rMHarkComment.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true,
        userId: true,
        parentId: true,
        rmheetId: true,
        user: { select: { isBot: true } },
        rmhark: { select: { userId: true, deletedAt: true, user: { select: { isBot: true } } } },
        parent: { select: { userId: true, user: { select: { isBot: true } } } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      userId: c.userId,
      parentId: c.parentId,
      rmheetId: c.rmheetId,
      authorIsBot: c.user.isBot,
      postUserId: c.rmhark.userId,
      postDeletedAt: c.rmhark.deletedAt,
      postUserIsBot: c.rmhark.user.isBot,
      parentUserId: c.parent?.userId ?? null,
      parentUserIsBot: c.parent?.user.isBot ?? null,
    }));
  },
  async commentAlreadyAnswered(commentId, targetBotId) {
    const hit = await prisma.rMHarkComment.findFirst({
      where: { parentId: commentId, userId: targetBotId, deletedAt: null },
      select: { id: true },
    });
    return hit != null;
  },
  async buildReplyContext(commentId, maxDepth) {
    // Walk the ancestor chain (top -> bottom) and resolve the post and any post it quotes.
    const thread: string[] = [];
    let currentId: string | null = commentId;
    let rmheetId = '';
    for (let depth = 0; currentId && depth < maxDepth + 2; depth++) {
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
    return { postContent: post.content, quotedPostContent: post.original?.content ?? '', thread };
  },
  async insertComment(rmheetId, userId, content, parentId) {
    await prisma.$transaction([
      prisma.rMHarkComment.create({ data: { rmheetId, userId, content, parentId } }),
      prisma.rMHark.update({ where: { id: rmheetId }, data: { commentCount: { increment: 1 } } }),
    ]);
  },
  async recentBotPosts(since) {
    const rows = await prisma.rMHark.findMany({
      where: { deletedAt: null, createdAt: { gte: since }, user: { isBot: true } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, content: true, userId: true, original: { select: { content: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      content: p.content,
      userId: p.userId,
      quotedContent: p.original?.content ?? '',
    }));
  },
  async botsExcept(excludeId) {
    const rows = await prisma.user.findMany({
      where: { isBot: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, botPersona: true, botLastPostAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      botPersona: r.botPersona ?? '',
      botLastPostAt: r.botLastPostAt,
    }));
  },
  async commentersOnPost(rmheetId) {
    const rows = await prisma.rMHarkComment.findMany({
      where: { rmheetId },
      distinct: ['userId'],
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  },
  async recentBotConversations(since) {
    // One statement however many conversations (no per-conversation "who spoke last" lookup).
    const rows = await prisma.$queryRaw<
      {
        id: string;
        participantOneId: string;
        participantTwoId: string;
        one_is_bot: boolean;
        two_is_bot: boolean;
        last_sender_id: string;
      }[]
    >(Prisma.sql`
      SELECT c.id, c."participantOneId", c."participantTwoId",
             p1."isBot" AS one_is_bot, p2."isBot" AS two_is_bot,
             COALESCE(lm."senderId", '') AS last_sender_id
        FROM "conversation" c
        JOIN "user" p1 ON p1.id = c."participantOneId"
        JOIN "user" p2 ON p2.id = c."participantTwoId"
        LEFT JOIN LATERAL (
              SELECT dm."senderId" FROM "direct_message" dm
               WHERE dm."conversationId" = c.id
               ORDER BY dm."createdAt" DESC LIMIT 1
             ) lm ON true
       WHERE c."lastMessageAt" >= ${since} AND (p1."isBot" = true OR p2."isBot" = true)
       ORDER BY c."lastMessageAt" DESC
       LIMIT 60`);
    return rows.map((r) => ({
      id: r.id,
      participantOneId: r.participantOneId,
      participantTwoId: r.participantTwoId,
      oneIsBot: r.one_is_bot,
      twoIsBot: r.two_is_bot,
      lastSenderId: r.last_sender_id,
    }));
  },
  async recentDmHistory(conversationId) {
    return prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { senderId: true, content: true },
    });
  },
  async sendBotDm(conversationId, botId, content) {
    const [msg] = await prisma.$transaction([
      prisma.directMessage.create({
        data: { conversationId, senderId: botId, content },
        select: { id: true, read: true, createdAt: true },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return {
      id: msg.id,
      conversationId,
      content,
      senderId: botId,
      read: msg.read,
      createdAt: msg.createdAt.toISOString(),
    };
  },
  async dmPrivacy(userId) {
    const row = await prisma.userProfile.findUnique({
      where: { userId },
      select: { dmPrivacy: true },
    });
    return (row?.dmPrivacy ?? 'EVERYONE') as DmPrivacy; // no profile row -> default EVERYONE
  },
  async followExists(followerId, followingId) {
    return (
      (await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
        select: { id: true },
      })) != null
    );
  },
  async conversationOpenerMessages(pOne, pTwo) {
    const convo = await prisma.conversation.findUnique({
      where: {
        participantOneId_participantTwoId: { participantOneId: pOne, participantTwoId: pTwo },
      },
      select: { id: true },
    });
    if (!convo) return null;
    return prisma.directMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { senderId: true, createdAt: true },
    });
  },
  async upsertConversation(pOne, pTwo) {
    const row = await prisma.conversation.upsert({
      where: {
        participantOneId_participantTwoId: { participantOneId: pOne, participantTwoId: pTwo },
      },
      create: { participantOneId: pOne, participantTwoId: pTwo },
      update: {},
      select: { id: true },
    });
    return row.id;
  },
  async recentActiveHumans(since) {
    // Distinct non-bot users who posted or commented in the window (two bounded selects, unioned).
    const [posts, comments] = await Promise.all([
      prisma.rMHark.findMany({
        where: { createdAt: { gte: since }, deletedAt: null, user: { isBot: false } },
        select: { userId: true },
        take: 200,
      }),
      prisma.rMHarkComment.findMany({
        where: { createdAt: { gte: since }, deletedAt: null, user: { isBot: false } },
        select: { userId: true },
        take: 200,
      }),
    ]);
    return [...new Set([...posts, ...comments].map((r) => r.userId))];
  },
};

// ─── SSE notify bridge ──────────────────────────────────────────────────────

/** Web origin the worker calls for the SSE bridge: INTERNAL_API_URL, else the origin of BETTER_AUTH_URL. */
export function internalApiBase(env: Record<string, string | undefined> = process.env): string {
  if (env.INTERNAL_API_URL) return env.INTERNAL_API_URL.replace(/\/+$/, '');
  if (env.BETTER_AUTH_URL) {
    try {
      const u = new URL(env.BETTER_AUTH_URL);
      if (u.protocol && u.host) return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through to the local default */
    }
  }
  return 'http://127.0.0.1:7005';
}

export interface Notifier {
  messageDelivered(userId: string, message: DmPayload): Promise<void>;
  typing(
    userId: string,
    typing: { conversationId: string; senderId: string; isTyping: boolean },
  ): Promise<void>;
}

/**
 * Best-effort live push into the web process (`/api/internal/notify-message` and
 * `-typing`). The message is already persisted, so a missing secret or a failed
 * call is logged at most, never an error.
 */
export function httpNotifier(log: BotLog, fetchImpl: typeof fetch = fetch): Notifier {
  async function post(path: string, body: object): Promise<void> {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) return; // SSE bridge disabled
    try {
      await fetchImpl(`${internalApiBase()}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      log.warn('bot_worker.notify_failed', { path, err: (e as Error)?.message });
    }
  }
  return {
    messageDelivered: (userId, message) =>
      post('/api/internal/notify-message', { userId, message }),
    typing: (userId, typing) => post('/api/internal/notify-typing', { userId, typing }),
  };
}

// ─── logging, deps ──────────────────────────────────────────────────────────

export interface BotLog {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

const consoleLog: BotLog = {
  info: (event, fields) =>
    void process.stdout.write(
      JSON.stringify({ level: 'info', service: 'jobs', event, ...fields }) + '\n',
    ),
  warn: (event, fields) =>
    console.warn(JSON.stringify({ level: 'warn', service: 'jobs', event, ...fields })),
  error: (event, fields) =>
    console.error(JSON.stringify({ level: 'error', service: 'jobs', event, ...fields })),
};

/** The text generation + image calls, injectable so ticks can run without DeepSeek. */
export interface BotAi {
  profile(
    spec: ReturnType<typeof rollPersona>,
  ): Promise<{ name: string; handle: string; bio: string }>;
  post(persona: string): Promise<string>;
  reply(o: {
    persona: string;
    postContent: string;
    quotedPostContent: string;
    thread: string[];
  }): Promise<string>;
  dmReply(persona: string, history: { from: 'them' | 'you'; text: string }[]): Promise<string>;
  dmOpener(persona: string): Promise<string>;
  /** A hosted feed image URL for the post, or null on any failure. */
  image(text: string, userId: string): Promise<string | null>;
  imageConfigured(): boolean;
}

export function deepseekAi(model: string): BotAi {
  return {
    profile: (spec) => generateBotProfile(spec, { model, strict: true }),
    post: (persona) => generatePost({ persona, model }),
    reply: (o) =>
      generateReply({
        persona: o.persona,
        postContent: o.postContent,
        quotedPostContent: o.quotedPostContent,
        thread: o.thread,
        model,
      }),
    dmReply: (persona, history) => generateDirectMessageReply({ persona, history, model }),
    dmOpener: (persona) => generateDirectMessageOpener({ persona, model }),
    image: (text, userId) => generatePostImage({ text, userId, model }),
    imageConfigured: isImageGenConfigured,
  };
}

export interface BotDeps {
  repo: BotRepo;
  ai: BotAi;
  notify: Notifier;
  cfg: BotConfig;
  log: BotLog;
  now: () => number;
  random: () => number;
}

export function defaultDeps(overrides: Partial<BotDeps> = {}): BotDeps {
  const cfg = overrides.cfg ?? loadBotConfig();
  const log = overrides.log ?? consoleLog;
  return {
    repo: prismaBotRepo,
    ai: deepseekAi(cfg.model),
    notify: httpNotifier(log),
    cfg,
    log,
    now: Date.now,
    random: Math.random,
    ...overrides,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Fisher-Yates over a copy. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

/** `fn(0..n-1)` with at most `limit` in flight; stops starting new work once `stop()` is true. */
export async function forEachLimited(
  n: number,
  limit: number,
  fn: (i: number) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), n) }, async () => {
    while (next < n && !stop()) {
      const i = next++;
      await fn(i);
    }
  });
  await Promise.all(workers);
}

/** The live admin settings: the saved row, else the env defaults. A failed read keeps the last good value. */
let lastSettings: BotWorkerSettingsInput | null = null;
let lastSettingsSave: Date | null = null;
export interface LiveSettings extends BotWorkerSettingsInput {
  /** The row's save time; null while the defaults are in force. */
  updatedAt: Date | null;
}
export async function currentSettings(d: BotDeps): Promise<LiveSettings> {
  try {
    const s = await d.repo.loadSettings();
    lastSettings = s ? clampSettings(s) : d.cfg.defaults;
    lastSettingsSave = s?.updatedAt ?? null;
  } catch (e) {
    d.log.warn('bot_worker.settings_failed', { err: (e as Error)?.message });
  }
  return {
    ...(lastSettings ?? d.cfg.defaults ?? DEFAULT_BOT_SETTINGS),
    updatedAt: lastSettingsSave,
  };
}

/** Test hook. */
export function resetBotWorkerState(): void {
  lastSettings = null;
  lastSettingsSave = null;
  lastMaintain = null;
  lastMaintainSave = null;
}

/** Run one unit of work; any throw is logged and counted, never propagated. */
async function isolated(d: BotDeps, event: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    d.log.error(event, { err: (e as Error)?.message });
  }
}

// ─── pool maintenance ───────────────────────────────────────────────────────

/** Derive a unique handle from the model's suggestion (6 attempts, then a time-based fallback). */
export async function uniqueHandle(d: BotDeps, base: string): Promise<string> {
  let candidate = sanitizeHandle(base);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!(await d.repo.handleExists(candidate))) return candidate;
    const suffix = Math.floor(d.random() * 9000) + 100;
    candidate = `${candidate.slice(0, 14)}${suffix}`;
  }
  return `${candidate.slice(0, 10)}${d.now() % 100000}`;
}

/** Generate a persona + profile and insert a new bot user. */
export async function createBot(d: BotDeps): Promise<void> {
  // Roll across every axis; the habit label lands verbatim in the ACTIVITY line so the pace regexes fire.
  const spec = rollPersona();
  const profile = await d.ai.profile(spec);
  const handle = await uniqueHandle(d, profile.handle);
  await d.repo.createBotUser({
    name: profile.name,
    handle,
    image: buildAvatarUrl(handle, spec.avatarStyle),
    persona: composePersona(spec),
    bio: [...profile.bio].slice(0, 160).join(''),
  });
  d.log.info('bot_worker.bot_created', { handle, name: profile.name });
}

/** Top the pool up if below target, at most one batch per pass. Lowering the target never deletes bots. */
export async function maintainBotPool(d: BotDeps, s: BotWorkerSettingsInput): Promise<void> {
  const count = await d.repo.countBots();
  if (count >= s.targetBotCount) return;
  const toCreate = Math.min(s.createBatch, s.targetBotCount - count);
  d.log.info('bot_worker.minting', {
    current: count,
    target: s.targetBotCount,
    creating: toCreate,
  });
  await forEachLimited(toCreate, d.cfg.genConcurrency, () =>
    isolated(d, 'bot_worker.create_failed', () => createBot(d)),
  );
}

// Pool-loop bookkeeping (process-local, as in the Go worker): when the pool was last topped up
// and which settings save it last saw (a newer save tops up at once instead of waiting out the interval).
let lastMaintain: number | null = null;
let lastMaintainSave: number | null = null;

/** The maintenance job body: a top-up when one is due under the current settings. */
export async function runMaintainTick(d: BotDeps): Promise<boolean> {
  const s = await currentSettings(d);
  const now = d.now();
  if (!maintenanceDue(now, lastMaintain, lastMaintainSave, s)) return false;
  lastMaintain = now;
  lastMaintainSave = s.updatedAt?.getTime() ?? null;
  await isolated(d, 'bot_worker.maintain_failed', () => maintainBotPool(d, s));
  return true;
}

// ─── post tick ──────────────────────────────────────────────────────────────

/** Generate and insert one post for a bot. Failure-isolated: one bad generation never takes down the tick. */
export async function postAsBot(d: BotDeps, b: BotUserRow): Promise<void> {
  try {
    const content = await d.ai.post(b.botPersona);
    if (content.trim().length === 0) return;
    // Occasionally attach an AI image. A failed image never blocks the post: it goes out text-only.
    let imageUrls: string[] = [];
    if (d.ai.imageConfigured() && d.random() < d.cfg.imageProb) {
      const url = await d.ai.image(content, b.id).catch(() => null);
      if (url) imageUrls = [url];
    }
    await d.repo.insertPost(b.id, content, imageUrls);
    await d.repo
      .touchBot(b.id)
      .catch((e) => d.log.warn('bot_worker.touch_failed', { bot: b.id, err: e?.message }));
    d.log.info('bot_worker.posted', { bot: b.id, preview: [...content].slice(0, 60).join('') });
  } catch (e) {
    d.log.error('bot_worker.post_failed', { bot: b.id, err: (e as Error)?.message });
  }
}

/** Load all bots, keep those due this tick, shuffle, cap, and post GenConcurrency at a time. */
export async function runPostTick(d: BotDeps): Promise<number> {
  const s = await currentSettings(d);
  if (s.postRateMultiplier <= 0) return 0; // posting paused from /admin/bots
  const bots = await d.repo.loadBots();
  if (bots.length === 0) return 0;
  const now = d.now();
  const tickMs = effectiveTickMs(d.cfg.postTickMs);
  const due = shuffled(
    bots.filter((b) => shouldPost(b, s.postRateMultiplier, tickMs, now, d.random())),
    d.random,
  ).slice(0, s.maxPostsPerTick);
  await forEachLimited(due.length, d.cfg.genConcurrency, (i) => postAsBot(d, due[i]!));
  return due.length;
}

// ─── reply tick ─────────────────────────────────────────────────────────────

/** One in-character reply from `botId` to a comment. Returns whether a reply was created. */
export async function replyToComment(
  d: BotDeps,
  botId: string,
  commentId: string,
  rmheetId: string,
): Promise<boolean> {
  const rc = await d.repo.buildReplyContext(commentId, d.cfg.maxReplyDepth);
  if (!rc) return false;
  if (rc.thread.length >= d.cfg.maxReplyDepth) return false;
  const persona = await d.repo.botPersona(botId).catch(() => '');
  const content = await d.ai.reply({
    persona,
    postContent: rc.postContent,
    quotedPostContent: rc.quotedPostContent,
    thread: rc.thread,
  });
  if (content.trim() === '') return false;
  await d.repo.insertComment(rmheetId, botId, content, commentId);
  await d.repo
    .touchBot(botId)
    .catch((e) => d.log.warn('bot_worker.touch_failed', { bot: botId, err: e?.message }));
  d.log.info('bot_worker.replied', { bot: botId, comment: commentId });
  return true;
}

/** Bots reply to recent comments aimed at them: humans readily, bot-to-bot rarely, depth-capped. */
export async function reactToComments(d: BotDeps): Promise<void> {
  const since = new Date(d.now() - d.cfg.replyLookbackMs);
  const comments = await d.repo.recentComments(since);

  const candidates: { comment: CommentRow; targetId: string; authorIsBot: boolean }[] = [];
  for (const c of comments) {
    // The reply target: the parent comment's author (threaded) or the post's author.
    let targetId: string;
    let targetIsBot: boolean;
    if (c.parentId !== null) {
      targetId = c.parentUserId ?? '';
      targetIsBot = c.parentUserIsBot ?? false;
    } else {
      targetId = c.postUserId;
      targetIsBot = c.postUserIsBot;
    }
    // Only bots reply; the post must exist and not be deleted; never self-reply.
    if (!targetId || !targetIsBot || c.postDeletedAt !== null || targetId === c.userId) continue;
    candidates.push({ comment: c, targetId, authorIsBot: c.authorIsBot });
  }

  // Replies scale up with the posting-rate multiplier so a busier feed doesn't leave bots
  // ignoring their threads; they never scale below the configured cap.
  const s = await currentSettings(d);
  const maxReplies = Math.ceil(d.cfg.maxRepliesPerTick * Math.max(1, s.postRateMultiplier));
  let made = 0;
  for (const cand of shuffled(candidates, d.random)) {
    if (made >= maxReplies) break;
    const prob = cand.authorIsBot ? d.cfg.botToBotProb : d.cfg.reactiveHumanProb;
    if (d.random() > prob) continue;
    await isolated(d, 'bot_worker.reply_failed', async () => {
      // Skip if already answered by this bot.
      if (await d.repo.commentAlreadyAnswered(cand.comment.id, cand.targetId)) return;
      if (await replyToComment(d, cand.targetId, cand.comment.id, cand.comment.rmheetId)) made++;
    });
  }
}

/** One bot that hasn't yet commented leaves a top-level comment on a bot post. */
export async function seedOnPost(d: BotDeps, post: BotPostRow): Promise<void> {
  await isolated(d, 'bot_worker.proactive_failed', async () => {
    const commenters = await d.repo.commentersOnPost(post.id);
    const bots = await d.repo.botsExcept(post.userId);
    const eligible = bots.filter((b) => !commenters.has(b.id));
    if (eligible.length === 0) return;
    const bot = pickOne(eligible, d.random);
    const content = await d.ai.reply({
      persona: bot.botPersona,
      postContent: post.content,
      quotedPostContent: post.quotedContent,
      thread: [],
    });
    if (content.trim() === '') return;
    await d.repo.insertComment(post.id, bot.id, content, null); // top-level: no parent
    await d.repo
      .touchBot(bot.id)
      .catch((e) => d.log.warn('bot_worker.touch_failed', { bot: bot.id, err: e?.message }));
    d.log.info('bot_worker.proactive_reply', { bot: bot.id, post: post.id });
  });
}

/** Bots reply to other bots' recent posts. The expected count scales with the posting-rate multiplier. */
export async function seedBotConversation(d: BotDeps): Promise<void> {
  const s = await currentSettings(d);
  const n = scaledCount(d.cfg.proactiveProb * s.postRateMultiplier, d.random());
  if (n === 0) return;
  const posts = await d.repo.recentBotPosts(new Date(d.now() - d.cfg.proactiveLookbackMs));
  if (posts.length === 0) return;
  for (let i = 0; i < n; i++) await seedOnPost(d, pickOne(posts, d.random));
}

export async function runReplyTick(d: BotDeps): Promise<void> {
  await isolated(d, 'bot_worker.react_failed', () => reactToComments(d));
  await isolated(d, 'bot_worker.seed_failed', () => seedBotConversation(d));
}

// ─── DM tick ────────────────────────────────────────────────────────────────

/** Bots reply when a human spoke last in a 1:1 conversation with exactly one bot participant. */
export async function answerDirectMessages(d: BotDeps): Promise<void> {
  const convos = await d.repo.recentBotConversations(new Date(d.now() - d.cfg.dmLookbackMs));

  const candidates: { conversationId: string; botId: string; humanId: string }[] = [];
  for (const c of convos) {
    if (c.oneIsBot === c.twoIsBot) continue; // both bots or neither: skip
    const [botId, humanId] = c.oneIsBot
      ? [c.participantOneId, c.participantTwoId]
      : [c.participantTwoId, c.participantOneId];
    // lastSenderId rides along on the conversations query, so there is no per-conversation lookup.
    if (c.lastSenderId === '' || c.lastSenderId === botId) continue; // nothing new from the human
    candidates.push({ conversationId: c.id, botId, humanId });
  }

  let made = 0;
  for (const c of shuffled(candidates, d.random)) {
    if (made >= d.cfg.maxDmRepliesPerTick) break;
    if (d.random() > d.cfg.reactiveDmProb) continue;
    await isolated(d, 'bot_worker.dm_reply_failed', async () => {
      const persona = await d.repo.botPersona(c.botId).catch(() => '');
      if (persona === '') return;
      // History is newest-first; reverse to oldest-first for the prompt.
      const history = (await d.repo.recentDmHistory(c.conversationId)).reverse();
      const turns = formatDmHistory(history, c.botId);
      const typing = { conversationId: c.conversationId, senderId: c.botId, isTyping: true };
      await d.notify.typing(c.humanId, typing);
      let content: string;
      try {
        content = await d.ai.dmReply(persona, turns);
      } finally {
        await d.notify.typing(c.humanId, { ...typing, isTyping: false });
      }
      if (content.trim() === '') return;
      const msg = await d.repo.sendBotDm(c.conversationId, c.botId, content);
      await d.notify.messageDelivered(c.humanId, msg);
      made++;
      d.log.info('bot_worker.dm_answered', { bot: c.botId, human: c.humanId });
    });
  }
}

/** Rarely open (or gently follow up) a DM with a recently-active human, respecting privacy and anti-pester rules. */
export async function initiateDirectMessages(d: BotDeps): Promise<void> {
  if (d.random() > d.cfg.dmInitiateProb) return;
  const humanIds = await d.repo.recentActiveHumans(
    new Date(d.now() - d.cfg.dmActiveHumanLookbackMs),
  );
  if (humanIds.length === 0) return;
  const bots = await d.repo.botsExcept(''); // all bots
  if (bots.length === 0) return;

  let opened = 0;
  for (const humanId of shuffled(humanIds, d.random)) {
    if (opened >= d.cfg.maxDmOpenersPerTick) break;
    const bot = pickOne(bots, d.random);
    if (bot.botPersona === '' || bot.id === humanId) continue;
    await isolated(d, 'bot_worker.dm_open_failed', async () => {
      // Privacy gate.
      const privacy = await d.repo.dmPrivacy(humanId);
      const humanFollowsBot =
        privacy === 'FOLLOWERS'
          ? await d.repo.followExists(humanId, bot.id).catch(() => false)
          : false;
      if (!canBotMessage({ dmPrivacy: privacy, humanFollowsBot })) return;
      // Anti-pester gate from the existing conversation (if any).
      const [pOne, pTwo] = orderPair(bot.id, humanId);
      const messages = await d.repo.conversationOpenerMessages(pOne, pTwo);
      const decision = decideInitiation({
        botId: bot.id,
        now: d.now(),
        followupSilenceMs: d.cfg.dmFollowupSilenceMs,
        messages,
      });
      if (decision === 'skip') return;
      const content = await d.ai.dmOpener(bot.botPersona);
      if (content.trim() === '') return;
      const conversationId = await d.repo.upsertConversation(pOne, pTwo);
      const msg = await d.repo.sendBotDm(conversationId, bot.id, content);
      await d.notify.messageDelivered(humanId, msg);
      opened++;
      d.log.info('bot_worker.dm_opened', { bot: bot.id, human: humanId, decision });
    });
  }
}

export async function runDmTick(d: BotDeps): Promise<void> {
  await isolated(d, 'bot_worker.dm_answer_failed', () => answerDirectMessages(d));
  await isolated(d, 'bot_worker.dm_initiate_failed', () => initiateDirectMessages(d));
}

// ─── registration ───────────────────────────────────────────────────────────

interface BossLike {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  unschedule?: (name: string) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
}

/**
 * Create the four queues, schedule their crons and attach the workers. With no
 * DEEPSEEK_API_KEY it idles like the Go worker did: nothing is registered, and
 * any schedule left from a run that had a key is removed.
 */
export async function registerBotWorkerJobs(
  boss: BossLike,
  deps?: Partial<BotDeps>,
): Promise<void> {
  if (!isRmharkAIConfigured()) {
    consoleLog.warn('bot_worker.idle', {
      reason: 'DEEPSEEK_API_KEY not set; no bots will be generated',
    });
    for (const q of BOT_QUEUES) {
      await boss.createQueue(q, { policy: 'exclusive' });
      await boss.unschedule?.(q).catch(() => undefined);
    }
    return;
  }
  const d = defaultDeps(deps);
  // Ticks swallow their own errors and must never retry (a retry could double-post); a post tick of
  // 60 slow generations can outlast pg-boss's 15 min default expiry.
  const queue = { policy: 'exclusive', retryLimit: 0, expireInSeconds: 30 * 60 };
  const jobs: { name: string; cron: string; run: () => Promise<unknown> }[] = [
    { name: BOT_MAINTAIN_QUEUE, cron: BOT_MAINTAIN_CRON, run: () => runMaintainTick(d) },
    { name: BOT_POST_QUEUE, cron: cronForInterval(d.cfg.postTickMs), run: () => runPostTick(d) },
    { name: BOT_REPLY_QUEUE, cron: cronForInterval(d.cfg.replyTickMs), run: () => runReplyTick(d) },
    { name: BOT_DM_QUEUE, cron: cronForInterval(d.cfg.dmTickMs), run: () => runDmTick(d) },
  ];
  for (const job of jobs) {
    await boss.createQueue(job.name, queue);
    await boss.schedule(job.name, job.cron, {}, { tz: 'UTC' });
    await boss.work(job.name, async () => {
      await isolated(d, 'bot_worker.tick_failed', async () => void (await job.run()));
    });
  }
  // The Go pool loop topped up immediately at start, before its first interval.
  await boss.send?.(BOT_MAINTAIN_QUEUE, {}).catch(() => undefined);
  d.log.info('bot_worker.scheduled', {
    post: cronForInterval(d.cfg.postTickMs),
    reply: cronForInterval(d.cfg.replyTickMs),
    dm: cronForInterval(d.cfg.dmTickMs),
    model: d.cfg.model,
    genConcurrency: d.cfg.genConcurrency,
  });
}
