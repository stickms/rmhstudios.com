/**
 * The RMHark bot-worker (D3: ported from the Go worker `internal/botworker`, which
 * ported the original Node worker). Server-only; runs in the `jobs` worker as
 * pg-boss crons. It keeps a pool of AI-generated synthetic users and posts,
 * replies and DMs from them in their own voice. Bots never reveal they are bots.
 *
 *   bot-worker.maintain   every minute: top the pool up when the admin interval has elapsed
 *                          (or an admin just saved settings), and once at boot.
 *   bot-worker.post       BOT_POST_TICK_MS (default 5 min): due bots post, capped per tick. A due
 *                          bot may react to the live sitewide announcement or an outside headline
 *                          instead of its usual post (`./reaction-model`, BOT_REACTIONS_ENABLED).
 *   bot-worker.reply      BOT_REPLY_TICK_MS (default = post tick): answer comments aimed at
 *                          bots, then proactive bot-to-bot comments, then comments under the
 *                          live announcement's discussion post.
 *   bot-worker.dm         BOT_DM_TICK_MS (default 1 min): answer humans' DMs, rarely open one.
 *   bot-worker.refresh    hourly: upgrade placeholder avatars and let a bot's avatar, banner, bio and
 *                          display name drift now and then (`./bot-look`, BOT_PROFILE_REFRESH). The
 *                          pictures are public-domain photos found online (`./stock-image.server`).
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
import { buildAvatarUrl, composePersona, rollPersona, withPoliticalLean } from './persona';
import {
  cartoonAvatarUrl,
  genericAvatarQuery,
  genericBannerQuery,
  initialsAvatarUrl,
  refreshPlan,
  rollAvatarKind,
  wantsBanner,
} from './bot-look';
import {
  generateBotBio,
  generateBotImageQueries,
  generateBotNameVariant,
  generateBotProfile,
  generateDirectMessageOpener,
  generateDirectMessageReply,
  generatePost,
  generateReactionPost,
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
  BOT_REFRESH_CRON,
  type BotConfig,
} from './bot-worker-config';
import { DEFAULT_BOT_SETTINGS, type BotWorkerSettingsInput } from './bot-stats';
import { cleanGeneratedText } from './persona';
import {
  ANNOUNCEMENT_REACTION_WINDOW_H,
  MAX_BOT_COMMENTS_PER_ANNOUNCEMENT,
  MAX_COMMENTS_PER_BOT_PER_THREAD,
  REACTION_LINK_PROB,
  THREAD_REPLY_PROB,
  ageHours,
  announcementCommentsPerTick,
  headlineWeight,
  pickWeighted,
  postKindPmf,
  sampleKind,
  samplePoisson,
  type Headline,
  type PostKind,
  type PostKindPmf,
} from './reaction-model';
import { getBusiness } from '@/lib/businesses';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { SITE_URL } from '@/lib/seo';

export const BOT_MAINTAIN_QUEUE = 'bot-worker.maintain';
export const BOT_POST_QUEUE = 'bot-worker.post';
export const BOT_REPLY_QUEUE = 'bot-worker.reply';
export const BOT_DM_QUEUE = 'bot-worker.dm';
export const BOT_REFRESH_QUEUE = 'bot-worker.refresh';
export const BOT_QUEUES = [
  BOT_MAINTAIN_QUEUE,
  BOT_POST_QUEUE,
  BOT_REPLY_QUEUE,
  BOT_DM_QUEUE,
  BOT_REFRESH_QUEUE,
] as const;

/** Maintenance is checked every minute (the Go pool loop's settings poll). */
export const BOT_MAINTAIN_CRON = '* * * * *';

// ─── repository ─────────────────────────────────────────────────────────────

export interface BotUserRow {
  id: string;
  botPersona: string;
  botLastPostAt: Date | null;
}

/** What the refresh run reads about a bot's profile. */
export interface BotProfileRow {
  id: string;
  handle: string;
  name: string;
  image: string | null;
  bio: string;
  bannerUrl: string | null;
  botPersona: string;
  createdAt: Date;
}

/** A change to a bot's profile; absent fields are left as they are. */
export interface BotProfilePatch {
  name?: string;
  image?: string;
  bio?: string;
  banner?: { url: string; sizeBytes: number };
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

/** What a bot reacts to: the live sitewide announcement, or an outside headline. */
export type ReactionKind = 'announcement' | 'news';

/** The live sitewide announcement as the ticks see it. */
export interface LiveAnnouncement {
  /** BlogPost id: the `BotReaction.refKey` of an announcement reaction. */
  id: string;
  title: string;
  description: string;
  slug: string;
  business: string;
  /** Epoch milliseconds. */
  announcedAt: number;
  /** The RMHark the announcement is discussed under, if one exists. */
  discussionPostId: string | null;
}

/** A bot's comment under a post (deleted ones excluded). */
export interface BotThreadComment {
  id: string;
  userId: string;
  parentId: string | null;
  createdAt: Date;
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
  }): Promise<string>;
  loadBots(): Promise<BotUserRow[]>;
  /** Every bot's profile, for the refresh run. */
  botProfiles(): Promise<BotProfileRow[]>;
  updateBotProfile(userId: string, patch: BotProfilePatch): Promise<void>;
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
  /**
   * Record that a bot reacted to an item. False when this bot already reacted to it (the
   * `(botId, kind, refKey)` unique key), which is "already reacted", not an error.
   */
  recordReaction(r: {
    botId: string;
    kind: ReactionKind;
    refKey: string;
    postId: string | null;
  }): Promise<boolean>;
  /** How many bots reacted to each of `refKeys` (one query). Keys nobody reacted to are absent. */
  reactionCounts(kind: ReactionKind, refKeys: string[]): Promise<Map<string, number>>;
  /** The reactions these bots already made to these items (one query), for per-bot dedupe. */
  reactionsBy(
    botIds: string[],
    refKeys: string[],
  ): Promise<{ botId: string; kind: ReactionKind; refKey: string }[]>;
  /** Bot comments under a post, with their authors and parents. */
  botCommentsOnPost(rmheetId: string): Promise<BotThreadComment[]>;
  /** A live post's text (and the text of the post it quotes) for a reply prompt; null if gone. */
  postForReply(rmheetId: string): Promise<{ content: string; quotedContent: string } | null>;
}

const REACTION_KINDS: readonly ReactionKind[] = ['announcement', 'news'];
function isReactionKind(v: string): v is ReactionKind {
  return (REACTION_KINDS as readonly string[]).includes(v);
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
    const row = await prisma.user.create({
      data: {
        name: b.name,
        handle: b.handle,
        image: b.image,
        isBot: true,
        botPersona: b.persona,
        profile: { create: { bio: b.bio } },
      },
      select: { id: true },
    });
    return row.id;
  },
  async botProfiles() {
    const rows = await prisma.user.findMany({
      where: { isBot: true },
      select: {
        id: true,
        handle: true,
        name: true,
        image: true,
        botPersona: true,
        createdAt: true,
        profile: { select: { bio: true, bannerUrl: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      handle: r.handle ?? r.id,
      name: r.name ?? '',
      image: r.image,
      bio: r.profile?.bio ?? '',
      bannerUrl: r.profile?.bannerUrl ?? null,
      botPersona: r.botPersona ?? '',
      createdAt: r.createdAt,
    }));
  },
  async updateBotProfile(userId, patch) {
    const user = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.image !== undefined ? { image: patch.image } : {}),
    };
    const profile = {
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.banner
        ? { bannerUrl: patch.banner.url, bannerSizeBytes: patch.banner.sizeBytes }
        : {}),
    };
    // updateMany / upsert: a bot deleted mid-run is a no-op, not a throw.
    if (Object.keys(user).length > 0) {
      await prisma.user.updateMany({ where: { id: userId, isBot: true }, data: user });
    }
    if (Object.keys(profile).length > 0) {
      await prisma.userProfile.upsert({
        where: { userId },
        create: { userId, ...profile },
        update: profile,
      });
    }
    // The feed's cached author display carries the name and avatar.
    const { invalidateUserDisplay } = await import('@/lib/user-display.server');
    invalidateUserDisplay(userId);
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
  async recordReaction(r) {
    try {
      await prisma.botReaction.create({
        data: { botId: r.botId, kind: r.kind, refKey: r.refKey, postId: r.postId },
        select: { id: true },
      });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  },
  async reactionCounts(kind, refKeys) {
    const out = new Map<string, number>();
    if (refKeys.length === 0) return out;
    const rows = await prisma.botReaction.groupBy({
      by: ['refKey'],
      where: { kind, refKey: { in: refKeys } },
      _count: { _all: true },
    });
    for (const row of rows) out.set(row.refKey, row._count._all);
    return out;
  },
  async reactionsBy(botIds, refKeys) {
    if (botIds.length === 0 || refKeys.length === 0) return [];
    const rows = await prisma.botReaction.findMany({
      where: { botId: { in: botIds }, refKey: { in: refKeys } },
      select: { botId: true, kind: true, refKey: true },
    });
    const out: { botId: string; kind: ReactionKind; refKey: string }[] = [];
    for (const row of rows) {
      if (isReactionKind(row.kind)) out.push({ botId: row.botId, kind: row.kind, refKey: row.refKey });
    }
    return out;
  },
  async botCommentsOnPost(rmheetId) {
    return prisma.rMHarkComment.findMany({
      where: { rmheetId, deletedAt: null, user: { isBot: true } },
      orderBy: { createdAt: 'desc' },
      // Enough to see both caps (thread total and per bot); a thread past this is already full.
      take: 4 * MAX_BOT_COMMENTS_PER_ANNOUNCEMENT,
      select: { id: true, userId: true, parentId: true, createdAt: true },
    });
  },
  async postForReply(rmheetId) {
    const post = await prisma.rMHark.findFirst({
      where: { id: rmheetId, deletedAt: null },
      select: { content: true, original: { select: { content: true } } },
    });
    if (!post) return null;
    return { content: post.content, quotedContent: post.original?.content ?? '' };
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

/**
 * The persona text as the AI is handed it: a bot that predates the political axis gets its lean
 * from a hash of its id (nothing stored). An empty persona stays empty: callers skip those bots.
 * Every `d.ai.*` call that takes a persona goes through here.
 */
function aiPersona(botId: string, persona: string): string {
  return persona === '' ? '' : withPoliticalLean(persona, botId);
}

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
  /** An in-character post reacting to an announcement or a headline (no link: the worker adds it). */
  reactionPost(o: {
    persona: string;
    kind: ReactionKind;
    title: string;
    summary: string;
    source: string;
  }): Promise<string>;
  /** A hosted feed image URL for the post, or null on any failure. */
  image(text: string, userId: string): Promise<string | null>;
  imageConfigured(): boolean;
  /** Stock-photo searches for the bot's avatar and banner; empty lists on failure. */
  imageQueries(persona: string): Promise<{ avatar: string[]; banner: string[] }>;
  /** A rewritten bio in the persona's voice. Throws on failure. */
  bio(persona: string, currentBio: string): Promise<string>;
  /** A small change to the display name. Throws on failure or no change. */
  nameVariant(persona: string, currentName: string): Promise<string>;
}

/**
 * Where a bot's pictures come from: public-domain photos found online and
 * stored in our object storage (`./stock-image.server`). Injectable so ticks
 * run without the network; every method returns null rather than throwing.
 */
export interface BotLook {
  avatar(userId: string, query: string): Promise<string | null>;
  banner(userId: string, query: string): Promise<{ url: string; sizeBytes: number } | null>;
  /** Delete a replaced picture the bot owned (best effort). */
  removeAvatar(url: string | null): Promise<void>;
  removeBanner(url: string | null): Promise<void>;
}

/** The Openverse-backed `BotLook`. Loaded lazily so the worker's import graph stays light. */
export function stockLook(random: () => number): BotLook {
  const mod = () => import('./stock-image.server');
  return {
    avatar: async (userId, query) => (await mod()).storeBotAvatar(userId, query, random),
    banner: async (userId, query) => (await mod()).storeBotBanner(userId, query, random),
    removeAvatar: async (url) => (await mod()).removeBotAvatar(url),
    removeBanner: async (url) => (await mod()).removeBotBanner(url),
  };
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
    reactionPost: (o) => generateReactionPost({ ...o, model }),
    image: (text, userId) => generatePostImage({ text, userId, model }),
    imageConfigured: isImageGenConfigured,
    imageQueries: (persona) => generateBotImageQueries(persona, { model }),
    bio: (persona, currentBio) => generateBotBio(persona, currentBio, { model }),
    nameVariant: (persona, currentName) => generateBotNameVariant(persona, currentName, { model }),
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
  /**
   * Fresh outside headlines ([] when outside news is off). Optional so a test that predates
   * reactions can leave it out: absent means none.
   */
  headlines?: () => Promise<Headline[]>;
  /** The live sitewide announcement, or null (also on any error). Absent means none. */
  announcement?: () => Promise<LiveAnnouncement | null>;
  /** Where pictures come from. Absent means bots keep the avatar they were minted with. */
  look?: BotLook;
}

/** Default for `BotDeps.headlines`: `getFreshHeadlines()`, [] on any error. Loaded lazily so the worker's import graph stays light. */
async function freshHeadlines(): Promise<Headline[]> {
  try {
    const { getFreshHeadlines } = await import('./headlines.server');
    return await getFreshHeadlines();
  } catch {
    return [];
  }
}

/** Default for `BotDeps.announcement`: `getCurrentAnnouncement()` adapted; null on any error. */
export async function liveAnnouncement(): Promise<LiveAnnouncement | null> {
  try {
    const { getCurrentAnnouncement } = await import('@/lib/sitewide-announcement.server');
    const a = await getCurrentAnnouncement();
    if (!a) return null;
    const announcedAt = Date.parse(a.announcedAt);
    if (!Number.isFinite(announcedAt)) return null;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      slug: a.slug,
      business: a.business,
      announcedAt,
      discussionPostId: typeof a.discussionPostId === 'string' ? a.discussionPostId : null,
    };
  } catch {
    return null;
  }
}

export function defaultDeps(overrides: Partial<BotDeps> = {}): BotDeps {
  const cfg = overrides.cfg ?? loadBotConfig();
  const log = overrides.log ?? consoleLog;
  const random = overrides.random ?? Math.random;
  return {
    repo: prismaBotRepo,
    ai: deepseekAi(cfg.model),
    notify: httpNotifier(log),
    cfg,
    log,
    now: Date.now,
    random,
    headlines: freshHeadlines,
    announcement: liveAnnouncement,
    look: stockLook(random),
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
  const persona = composePersona(spec);
  // Minted with the placeholder avatar; `dressNewBot` replaces it. A placeholder that survives
  // (the photo search failed) is upgraded by the refresh run within hours.
  const id = await d.repo.createBotUser({
    name: profile.name,
    handle,
    image: buildAvatarUrl(handle, spec.avatarStyle),
    persona,
    bio: [...profile.bio].slice(0, 160).join(''),
  });
  d.log.info('bot_worker.bot_created', { handle, name: profile.name });
  if (id) {
    await isolated(d, 'bot_worker.look_failed', () =>
      dressNewBot(d, { id, handle, name: profile.name, persona }),
    );
  }
}

// ─── looks ──────────────────────────────────────────────────────────────────

/** One picture-fetch allowance shared by a run (Openverse's anonymous quota is 200 a day). */
interface ImageBudget {
  left: number;
}

function takeImage(budget: ImageBudget): boolean {
  if (budget.left <= 0) return false;
  budget.left--;
  return true;
}

/** Searches for this persona, with the generic list behind them. */
async function imageQueries(
  d: BotDeps,
  persona: string,
): Promise<{ avatar: string[]; banner: string[] }> {
  try {
    return await d.ai.imageQueries(persona);
  } catch {
    return { avatar: [], banner: [] };
  }
}

function pickQuery(list: string[], generic: (r: number) => string, d: BotDeps): string {
  // One time in five a generic subject even when the persona's own exist: people's pictures are
  // not always about their hobby.
  if (list.length === 0 || d.random() < 0.2) return generic(d.random());
  return pickOne(list, d.random);
}

/**
 * A new avatar of a freshly rolled kind: a photo (fetched; null when the fetch failed or the
 * budget is spent), a cartoon or initials (URLs, always available).
 */
async function newAvatar(
  d: BotDeps,
  look: BotLook,
  bot: { id: string; handle: string; name: string },
  queries: () => Promise<{ avatar: string[]; banner: string[] }>,
  budget: ImageBudget,
): Promise<string | null> {
  const kind = rollAvatarKind(d.random());
  if (kind === 'cartoon') return cartoonAvatarUrl(`${bot.handle}-${d.now()}`, d.random(), d.random());
  if (kind === 'initials') return initialsAvatarUrl(bot.name || bot.handle, d.random());
  if (!takeImage(budget)) return null;
  const q = await queries();
  return look.avatar(bot.id, pickQuery(q.avatar, genericAvatarQuery, d));
}

async function newBanner(
  d: BotDeps,
  look: BotLook,
  botId: string,
  queries: () => Promise<{ avatar: string[]; banner: string[] }>,
  budget: ImageBudget,
): Promise<{ url: string; sizeBytes: number } | null> {
  if (!takeImage(budget)) return null;
  const q = await queries();
  return look.banner(botId, pickQuery(q.banner, genericBannerQuery, d));
}

/** Memoise the persona's searches so a run asks the model at most once per bot. */
function lazyQueries(d: BotDeps, persona: string) {
  let p: Promise<{ avatar: string[]; banner: string[] }> | null = null;
  return () => (p ??= imageQueries(d, persona));
}

/** Give a just-minted bot its first look: an avatar of a rolled kind and, two times in three, a banner. */
export async function dressNewBot(
  d: BotDeps,
  bot: { id: string; handle: string; name: string; persona: string },
): Promise<void> {
  const look = d.look;
  if (!look || !d.cfg.profileRefresh) return;
  const budget: ImageBudget = { left: 2 };
  const queries = lazyQueries(d, bot.persona);
  const patch: BotProfilePatch = {};
  const image = await newAvatar(d, look, bot, queries, budget);
  if (image) patch.image = image;
  if (wantsBanner(d.random())) {
    const banner = await newBanner(d, look, bot.id, queries, budget);
    if (banner) patch.banner = banner;
  }
  if (Object.keys(patch).length > 0) await d.repo.updateBotProfile(bot.id, patch);
}

/**
 * The refresh run: upgrade placeholder avatars (at most `legacyUpgradesPerTick`), and give every
 * bot a small chance of a new avatar, banner, bio or display name (`refreshPlan`). At most
 * `refreshMaxImagesPerTick` pictures are fetched per run. Handles never change. Returns how many
 * bots changed.
 */
export async function runRefreshTick(d: BotDeps): Promise<number> {
  const look = d.look;
  if (!look || !d.cfg.profileRefresh) return 0;
  const bots = shuffled(await d.repo.botProfiles(), d.random);
  const budget: ImageBudget = { left: d.cfg.refreshMaxImagesPerTick };
  let legacyLeft = d.cfg.legacyUpgradesPerTick;
  let changed = 0;
  for (const b of bots) {
    if (b.botPersona === '') continue;
    const plan = refreshPlan(b, d.cfg.drift, d.now(), d.random);
    if (plan.legacy) {
      if (legacyLeft <= 0) plan.avatar = false;
      else legacyLeft--;
    }
    // A bannerless bot getting its placeholder upgraded may get its first banner with it; one
    // drifting into a banner change gets one only as often as new bots do.
    const bannerDue =
      (plan.banner || (plan.legacy && plan.avatar)) && (b.bannerUrl != null || wantsBanner(d.random()));
    if (!plan.avatar && !bannerDue && !plan.bio && !plan.name) continue;

    await isolated(d, 'bot_worker.refresh_failed', async () => {
      const persona = aiPersona(b.id, b.botPersona);
      const queries = lazyQueries(d, persona);
      const patch: BotProfilePatch = {};
      if (plan.avatar) {
        const image = await newAvatar(d, look, b, queries, budget);
        if (image && image !== b.image) patch.image = image;
      }
      if (bannerDue) {
        const banner = await newBanner(d, look, b.id, queries, budget);
        if (banner) patch.banner = banner;
      }
      if (plan.bio) {
        const bio = await d.ai.bio(persona, b.bio).catch(() => '');
        if (bio && bio !== b.bio) patch.bio = [...bio].slice(0, 160).join('');
      }
      if (plan.name && b.name) {
        const name = await d.ai.nameVariant(persona, b.name).catch(() => '');
        if (name && name !== b.name) patch.name = name;
      }
      const fields = Object.keys(patch);
      if (fields.length === 0) return;
      await d.repo.updateBotProfile(b.id, patch);
      if (patch.image) await look.removeAvatar(b.image);
      if (patch.banner) await look.removeBanner(b.bannerUrl);
      changed++;
      d.log.info('bot_worker.profile_refreshed', { botId: b.id, fields, legacy: plan.legacy });
    });
  }
  return changed;
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

/**
 * What a post tick knows about the items bots can react to. Loaded ONCE per tick (not per bot)
 * by `loadReactionContext` and shared by the tick's bots, which update it as they go so two bots
 * in one tick spread across headlines instead of piling onto one.
 */
export interface ReactionContext {
  now: number;
  announcement: LiveAnnouncement | null;
  /** Hours since the announcement went live; null when none is live. */
  announcementAgeH: number | null;
  /** Headlines still young enough to react to. */
  headlines: Headline[];
  /** Bots that reacted to each headline so far, including earlier in this tick. */
  headlineReactions: Map<string, number>;
  /** `reactionKey(...)` of every reaction the tick's bots have made (before and during the tick). */
  reacted: Set<string>;
}

export function reactionKey(botId: string, kind: ReactionKind, refKey: string): string {
  return `${botId}\n${kind}\n${refKey}`;
}

/**
 * Load the live announcement, the fresh headlines, the per-headline reaction counts and what the
 * due bots already reacted to. Null (every bot posts as usual) when reactions are switched off,
 * nobody is due, or the reaction tables cannot be read (without them a bot could react twice).
 * Never throws.
 */
export async function loadReactionContext(
  d: BotDeps,
  botIds: string[],
): Promise<ReactionContext | null> {
  if (!d.cfg.reactionsEnabled || botIds.length === 0) return null;
  try {
    const now = d.now();
    const [announcement, allHeadlines] = await Promise.all([
      (d.announcement?.() ?? Promise.resolve(null)).catch(() => null),
      (d.headlines?.() ?? Promise.resolve([])).catch((): Headline[] => []),
    ]);
    const headlines = allHeadlines.filter(
      (h) => headlineWeight(ageHours(now, h.publishedAt), 0) > 0,
    );
    const refKeys = headlines.map((h) => h.key);
    if (announcement) refKeys.push(announcement.id);
    const ctx: ReactionContext = {
      now,
      announcement,
      announcementAgeH: announcement ? ageHours(now, announcement.announcedAt) : null,
      headlines,
      headlineReactions: new Map(),
      reacted: new Set(),
    };
    if (refKeys.length === 0) return ctx;
    const [counts, mine] = await Promise.all([
      headlines.length > 0
        ? d.repo.reactionCounts('news', headlines.map((h) => h.key))
        : Promise.resolve(new Map<string, number>()),
      d.repo.reactionsBy(botIds, refKeys),
    ]);
    ctx.headlineReactions = counts;
    for (const r of mine) ctx.reacted.add(reactionKey(r.botId, r.kind, r.refKey));
    return ctx;
  } catch (e) {
    d.log.warn('bot_worker.reaction_context_failed', { err: (e as Error)?.message });
    return null;
  }
}

/** The headlines this bot has not reacted to yet. */
function openHeadlines(ctx: ReactionContext, botId: string): Headline[] {
  return ctx.headlines.filter((h) => !ctx.reacted.has(reactionKey(botId, 'news', h.key)));
}

/**
 * What this bot may post about: `postKindPmf`, with the kinds it cannot use (an announcement it
 * already reacted to, no headline left that it has not covered) removed and the rest re-normalised,
 * so a bot that already reacted falls through to news or its usual post and never loses its turn.
 */
export function reactionPmf(ctx: ReactionContext, botId: string): PostKindPmf {
  const base = postKindPmf({
    announcementAgeH: ctx.announcementAgeH,
    headlineCount: ctx.headlines.length,
  });
  const a = ctx.announcement;
  const announcement =
    a && !ctx.reacted.has(reactionKey(botId, 'announcement', a.id)) ? base.announcement : 0;
  const news = openHeadlines(ctx, botId).length > 0 ? base.news : 0;
  const total = announcement + news + base.usual;
  if (total <= 0) return { announcement: 0, news: 0, usual: 1 };
  return { announcement: announcement / total, news: news / total, usual: base.usual / total };
}

/** A headline for this bot: fresh ones that few bots covered win (`headlineWeight`). */
export function pickHeadline(ctx: ReactionContext, botId: string, u: number): Headline | null {
  const open = openHeadlines(ctx, botId);
  const weights = open.map((h) =>
    headlineWeight(ageHours(ctx.now, h.publishedAt), ctx.headlineReactions.get(h.key) ?? 0),
  );
  return pickWeighted(open, weights, u);
}

/** Smallest room left for the post's own words before a link is dropped instead of squeezing them. */
const MIN_TEXT_BESIDE_LINK = 40;

/**
 * The post with the link on its own line, the way the announcement's own feed post carries its
 * link (a bare absolute http(s) URL is what the feed renders as a link). The whole stays within
 * the RMHark limit: the text is clipped on a word boundary, and a link too long to leave the
 * text room is left off.
 */
export function withReactionLink(text: string, link: string, include: boolean): string {
  if (!include || !/^https?:\/\/\S+$/i.test(link)) return text;
  const room = MAX_RMHARK_LENGTH - link.length - 1;
  if (room < MIN_TEXT_BESIDE_LINK) return text;
  const body = text.length <= room ? text : cleanGeneratedText(text, room);
  return `${body}\n${link}`;
}

/**
 * Write one reaction post. False when there turned out to be nothing to react to, so the caller
 * posts as usual; true once a reaction was attempted (posted, or an empty generation dropped).
 */
async function postReaction(
  d: BotDeps,
  b: BotUserRow,
  ctx: ReactionContext,
  kind: ReactionKind,
): Promise<boolean> {
  let item: { refKey: string; title: string; summary: string; source: string; link: string };
  if (kind === 'announcement') {
    const a = ctx.announcement;
    if (!a) return false;
    item = {
      refKey: a.id,
      title: a.title,
      summary: a.description,
      source: getBusiness(a.business).name,
      link: `${SITE_URL}/blog/${a.slug}`,
    };
  } else {
    const h = pickHeadline(ctx, b.id, d.random());
    if (!h) return false;
    item = { refKey: h.key, title: h.title, summary: h.summary, source: h.source, link: h.url };
  }

  // Claim it in the shared context before the first await, so the tick's other bots see it.
  const key = reactionKey(b.id, kind, item.refKey);
  const bump = (by: number) => {
    if (kind === 'news') {
      ctx.headlineReactions.set(item.refKey, (ctx.headlineReactions.get(item.refKey) ?? 0) + by);
    }
  };
  ctx.reacted.add(key);
  bump(1);
  let posted = false;
  try {
    const text = await d.ai.reactionPost({
      persona: aiPersona(b.id, b.botPersona),
      kind,
      title: item.title,
      summary: item.summary,
      source: item.source,
    });
    if (text.trim() === '') return true;
    const linked = d.random() < REACTION_LINK_PROB;
    const content = withReactionLink(text, item.link, linked);
    const postId = await d.repo.insertPost(b.id, content, []);
    posted = true;
    const recorded = await d.repo
      .recordReaction({ botId: b.id, kind, refKey: item.refKey, postId })
      .catch((e) => {
        d.log.warn('bot_worker.reaction_record_failed', { bot: b.id, err: e?.message });
        return true;
      });
    if (!recorded) d.log.warn('bot_worker.reaction_duplicate', { bot: b.id, kind, refKey: item.refKey });
    await d.repo
      .touchBot(b.id)
      .catch((e) => d.log.warn('bot_worker.touch_failed', { bot: b.id, err: e?.message }));
    d.log.info('bot_worker.reaction_posted', {
      bot: b.id,
      kind,
      refKey: item.refKey,
      linked: content !== text,
    });
    return true;
  } finally {
    if (!posted) {
      ctx.reacted.delete(key);
      bump(-1);
    }
  }
}

/**
 * Generate and insert one post for a bot. With a reaction context, what it writes about is drawn
 * from `reactionPmf`: the live announcement, a headline, or its usual post. Failure-isolated: one
 * bad generation never takes down the tick.
 */
export async function postAsBot(
  d: BotDeps,
  b: BotUserRow,
  ctx: ReactionContext | null = null,
): Promise<void> {
  try {
    const kind: PostKind = ctx ? sampleKind(reactionPmf(ctx, b.id), d.random()) : 'usual';
    if (kind !== 'usual' && ctx && (await postReaction(d, b, ctx, kind))) return;
    const content = await d.ai.post(aiPersona(b.id, b.botPersona));
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

/**
 * Load all bots, keep those due this tick, shuffle, cap, and post GenConcurrency at a time. The
 * reaction context (announcement, headlines, reaction counts) is loaded once for the whole tick.
 */
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
  const ctx = await loadReactionContext(
    d,
    due.map((b) => b.id),
  );
  await forEachLimited(due.length, d.cfg.genConcurrency, (i) => postAsBot(d, due[i]!, ctx));
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
    persona: aiPersona(botId, persona),
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
      persona: aiPersona(bot.id, bot.botPersona),
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

/** How strongly a thread reply favours recent comments: the n-th newest weighs this to the n. */
const THREAD_RECENCY_DECAY = 0.7;

/** `botId` answers one of `others` (newest first; recent ones favoured), never its own comment. */
async function answerThreadComment(
  d: BotDeps,
  botId: string,
  others: readonly BotThreadComment[],
  postId: string,
): Promise<boolean> {
  const target = pickWeighted(
    others,
    others.map((_, rank) => Math.pow(THREAD_RECENCY_DECAY, rank)),
    d.random(),
  );
  if (!target || target.userId === botId) return false;
  if (await d.repo.commentAlreadyAnswered(target.id, botId)) return false;
  return replyToComment(d, botId, target.id, postId);
}

/** A top-level comment from `bot` on the post. */
async function commentOnPost(
  d: BotDeps,
  bot: BotUserRow,
  postId: string,
  post: { content: string; quotedContent: string },
): Promise<boolean> {
  const content = await d.ai.reply({
    persona: aiPersona(bot.id, bot.botPersona),
    postContent: post.content,
    quotedPostContent: post.quotedContent,
    thread: [],
  });
  if (content.trim() === '') return false;
  await d.repo.insertComment(postId, bot.id, content, null); // top-level: no parent
  await d.repo
    .touchBot(bot.id)
    .catch((e) => d.log.warn('bot_worker.touch_failed', { bot: bot.id, err: e?.message }));
  return true;
}

/**
 * Bots talk under the live announcement's discussion post. Each tick draws how many new bot
 * comments land there from a Poisson whose rate follows `announcementCommentsPerTick` (a burst
 * that fades into a trickle until the reaction window closes), scaled by the admin posting-rate
 * multiplier like the other proactive chatter. Each new comment, from a bot below its per-thread
 * cap, either answers another bot's comment (THREAD_REPLY_PROB, favouring recent ones, never its
 * own) with the real thread as context, or comments on the post itself. Stops at the thread cap.
 * Further back-and-forth needs nothing here: `reactToComments` answers comments aimed at a bot.
 */
export async function seedAnnouncementThread(d: BotDeps): Promise<number> {
  if (!d.cfg.reactionsEnabled || !d.announcement) return 0;
  const s = await currentSettings(d);
  if (s.postRateMultiplier <= 0) return 0; // paused from /admin/bots
  const a = await d.announcement().catch(() => null);
  if (!a || !a.discussionPostId) return 0;
  const postId = a.discussionPostId;
  const ageH = ageHours(d.now(), a.announcedAt);
  if (ageH > ANNOUNCEMENT_REACTION_WINDOW_H) return 0;
  const lambda =
    announcementCommentsPerTick(ageH, effectiveTickMs(d.cfg.replyTickMs)) * s.postRateMultiplier;
  const n = samplePoisson(lambda, d.random);
  if (n === 0) return 0;

  const existing = await d.repo.botCommentsOnPost(postId);
  if (existing.length >= MAX_BOT_COMMENTS_PER_ANNOUNCEMENT) return 0;
  const post = await d.repo.postForReply(postId);
  if (!post) return 0; // the discussion post was deleted
  const bots = (await d.repo.botsExcept('')).filter((b) => b.botPersona !== '');
  // Newest first, so a lower index is a more recent comment.
  const comments = [...existing].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  const perBot = new Map<string, number>();
  for (const c of comments) perBot.set(c.userId, (perBot.get(c.userId) ?? 0) + 1);
  let total = comments.length;
  let made = 0;

  for (let i = 0; i < n && total < MAX_BOT_COMMENTS_PER_ANNOUNCEMENT; i++) {
    const eligible = bots.filter((b) => (perBot.get(b.id) ?? 0) < MAX_COMMENTS_PER_BOT_PER_THREAD);
    if (eligible.length === 0) break;
    const bot = pickOne(eligible, d.random);
    const others = comments.filter((c) => c.userId !== bot.id);
    const threaded = others.length > 0 && d.random() < THREAD_REPLY_PROB;
    let ok: boolean;
    try {
      ok = threaded
        ? await answerThreadComment(d, bot.id, others, postId)
        : await commentOnPost(d, bot, postId, post);
    } catch (e) {
      d.log.error('bot_worker.announcement_comment_failed', { bot: bot.id, err: (e as Error)?.message });
      ok = false;
    }
    if (!ok) continue;
    made++;
    total++;
    perBot.set(bot.id, (perBot.get(bot.id) ?? 0) + 1);
    d.log.info('bot_worker.announcement_comment', { bot: bot.id, post: postId, threaded });
  }
  return made;
}

export async function runReplyTick(d: BotDeps): Promise<void> {
  await isolated(d, 'bot_worker.react_failed', () => reactToComments(d));
  await isolated(d, 'bot_worker.seed_failed', () => seedBotConversation(d));
  await isolated(d, 'bot_worker.announcement_thread_failed', async () => {
    await seedAnnouncementThread(d);
  });
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
        content = await d.ai.dmReply(aiPersona(c.botId, persona), turns);
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
      const content = await d.ai.dmOpener(aiPersona(bot.id, bot.botPersona));
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
 * Create the five queues, schedule their crons and attach the workers. With no
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
    { name: BOT_REFRESH_QUEUE, cron: BOT_REFRESH_CRON, run: () => runRefreshTick(d) },
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
