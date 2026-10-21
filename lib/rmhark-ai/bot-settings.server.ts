/**
 * Bot-worker admin settings + activity stats for /admin/bots.
 *
 * The settings row is read by the Go bot-worker on every tick
 * (go-services/internal/botworker/repo.go `LoadSettings`), so saving here is
 * how an admin retunes the pool and posting rate without a deploy.
 */

import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import {
  DEFAULT_BOT_SETTINGS,
  BOT_POST_TICK_MINUTES,
  basePostsPerDay,
  botsMintedPerHour,
  habitIdForRate,
  habitPostsPerDay,
  projectPosting,
  type BotWorkerSettingsInput,
  type PostingEstimate,
} from '@/lib/rmhark-ai/bot-stats';

const SETTINGS_ID = 'default';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BotWorkerSettingsView extends BotWorkerSettingsInput {
  /** False until an admin saves; the worker then runs on its env defaults. */
  saved: boolean;
  updatedAt: string | null;
}

export interface BotActivityStats {
  totalBots: number;
  botsCreated24h: number;
  /** Bots per posting habit (lurker/steady/bursty/chatty). */
  habitMix: Record<string, number>;
  botPosts24h: number;
  botPosts7d: number;
  botPostsTotal: number;
  humanPosts24h: number;
  botComments24h: number;
  botDms24h: number;
  lastBotPostAt: string | null;
  /** The current pool's posts/day at a ×1 multiplier, for client previews. */
  basePerDay: number;
  /** Projection under the saved settings. */
  estimate: PostingEstimate;
  mintedPerHour: number;
  tickMinutes: number;
}

export async function getBotWorkerSettings(): Promise<BotWorkerSettingsView> {
  const row = await prisma.botWorkerSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return { ...DEFAULT_BOT_SETTINGS, saved: false, updatedAt: null };
  return {
    targetBotCount: row.targetBotCount,
    createBatch: row.createBatch,
    createIntervalMin: row.createIntervalMin,
    postRateMultiplier: row.postRateMultiplier,
    maxPostsPerTick: row.maxPostsPerTick,
    saved: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveBotWorkerSettings(
  adminId: string,
  input: BotWorkerSettingsInput,
): Promise<BotWorkerSettingsView> {
  await prisma.botWorkerSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...input, updatedById: adminId },
    update: { ...input, updatedById: adminId },
  });
  await logAdminAction(adminId, 'bot-settings.update', {
    targetType: 'bot_worker_settings',
    targetId: SETTINGS_ID,
    detail: JSON.stringify(input),
  });
  return getBotWorkerSettings();
}

export async function getBotActivityStats(settings: BotWorkerSettingsInput): Promise<BotActivityStats> {
  const now = Date.now();
  const since24h = new Date(now - DAY_MS);
  const since7d = new Date(now - 7 * DAY_MS);
  const botPost = { deletedAt: null, user: { isBot: true } } as const;

  const [
    bots,
    botsCreated24h,
    botPosts24h,
    botPosts7d,
    botPostsTotal,
    humanPosts24h,
    botComments24h,
    botDms24h,
  ] = await Promise.all([
    prisma.user.findMany({ where: { isBot: true }, select: { botPersona: true, botLastPostAt: true } }),
    prisma.user.count({ where: { isBot: true, createdAt: { gte: since24h } } }),
    prisma.rMHark.count({ where: { ...botPost, createdAt: { gte: since24h } } }),
    prisma.rMHark.count({ where: { ...botPost, createdAt: { gte: since7d } } }),
    prisma.rMHark.count({ where: botPost }),
    prisma.rMHark.count({ where: { deletedAt: null, user: { isBot: false }, createdAt: { gte: since24h } } }),
    prisma.rMHarkComment.count({ where: { deletedAt: null, user: { isBot: true }, createdAt: { gte: since24h } } }),
    prisma.directMessage.count({ where: { sender: { isBot: true }, createdAt: { gte: since24h } } }),
  ]);

  const basePerDay = basePostsPerDay(bots.map((b) => b.botPersona));
  const habitMix: Record<string, number> = {};
  let lastBotPost: Date | null = null;
  for (const b of bots) {
    const habit = habitIdForRate(habitPostsPerDay(b.botPersona));
    habitMix[habit] = (habitMix[habit] ?? 0) + 1;
    if (b.botLastPostAt && (!lastBotPost || b.botLastPostAt > lastBotPost)) lastBotPost = b.botLastPostAt;
  }

  return {
    totalBots: bots.length,
    botsCreated24h,
    habitMix,
    botPosts24h,
    botPosts7d,
    botPostsTotal,
    humanPosts24h,
    botComments24h,
    botDms24h,
    lastBotPostAt: lastBotPost?.toISOString() ?? null,
    basePerDay,
    estimate: projectPosting(basePerDay, settings, BOT_POST_TICK_MINUTES),
    mintedPerHour: botsMintedPerHour(settings),
    tickMinutes: BOT_POST_TICK_MINUTES,
  };
}
