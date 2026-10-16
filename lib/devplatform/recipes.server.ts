/**
 * D5 recipes — "when X then Y". Triggers: someone follows you, you set a
 * personal best, a market listing drops under your price. Actions: post to a
 * Discord webhook (via safeFetch) or notify yourself. Polled triggers run in a
 * pg-boss job; personal bests are enqueued from score submission. Every recipe
 * is rate-limited per hour, and a member can hold at most MAX_RECIPES.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { safeFetch } from '@/lib/ssrf-guard.server';
import { createNotification } from '@/lib/notifications.server';
import { rateLimit } from '@/lib/rate-limit';
import { getShopItem, SHOP_ITEMS } from '@/lib/shop/catalog';
import { getGameAdapter } from '@/lib/game/adapters.server';
import { games } from '@/lib/games';
import {
  MAX_RECIPES,
  type CreateRecipeInput,
  type RecipeAction,
  type RecipeTrigger,
  type RecipeView,
} from '@/lib/devplatform/recipes';

export const RECIPE_POLL_QUEUE = 'devplatform.recipes-poll';
export const RECIPE_POLL_CRON = '*/2 * * * *';
export const RECIPE_EVENT_QUEUE = 'devplatform.recipe-event';

const MIN_GAP_MS = 60_000;
const HOURLY_CAP = 20;

type Cfg = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function gameTitle(id: string): string {
  return games.find((g) => g.id === id)?.title ?? id;
}

function triggerLabel(trigger: string, c: Cfg): string {
  if (trigger === 'new_follower') return 'Someone follows me';
  if (trigger === 'new_pb') return `I set a personal best in ${gameTitle(str(c.gameId))}`;
  const item = getShopItem(str(c.itemId))?.name ?? str(c.itemId);
  return `${item} is listed under ${num(c.maxPrice)} coins`;
}

function actionLabel(action: string, c: Cfg): string {
  return action === 'dm_self' ? 'Notify me' : `Post to Discord (…${str(c.url).slice(-4)})`;
}

/** Pickable games (those that record scores) and market-tradable shop items. */
export function recipeOptions() {
  return {
    games: games
      .filter((g) => getGameAdapter(g.id)?.submit)
      .map((g) => ({ id: g.id, title: g.title })),
    items: SHOP_ITEMS.map((i) => ({ id: i.id, name: i.name })),
  };
}

export async function listRecipes(userId: string): Promise<RecipeView[]> {
  const rows = await prisma.devRecipe.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: MAX_RECIPES,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    trigger: r.trigger as RecipeTrigger,
    triggerLabel: triggerLabel(r.trigger, r.triggerConfig as Cfg),
    action: r.action as RecipeAction,
    actionLabel: actionLabel(r.action, r.actionConfig as Cfg),
    enabled: r.enabled,
    fireCount: r.fireCount,
    lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
    lastError: r.lastError,
  }));
}

export type CreateResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function createRecipe(
  userId: string,
  input: CreateRecipeInput,
): Promise<CreateResult> {
  if (input.trigger === 'new_pb' && !games.some((g) => g.id === input.gameId))
    return { ok: false, status: 400, error: 'Unknown game' };
  if (input.trigger === 'price_below' && !getShopItem(input.itemId!))
    return { ok: false, status: 400, error: 'Unknown item' };
  if ((await prisma.devRecipe.count({ where: { userId } })) >= MAX_RECIPES)
    return { ok: false, status: 400, error: `You can have at most ${MAX_RECIPES} recipes.` };

  const triggerConfig =
    input.trigger === 'new_pb'
      ? { gameId: input.gameId }
      : input.trigger === 'price_below'
        ? { itemId: input.itemId, maxPrice: input.maxPrice }
        : {};
  const actionConfig = input.action === 'discord_webhook' ? { url: input.discordUrl } : {};
  const row = await prisma.devRecipe.create({
    data: {
      userId,
      name: input.name,
      trigger: input.trigger,
      triggerConfig,
      action: input.action,
      actionConfig,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function setRecipeEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const r = await prisma.devRecipe.updateMany({
    where: { id, userId },
    // Re-enabling restarts the cursor so a paused recipe doesn't replay history.
    data: enabled ? { enabled, lastCheckedAt: new Date(), lastError: null } : { enabled },
  });
  return r.count > 0;
}

export async function deleteRecipe(userId: string, id: string): Promise<boolean> {
  return (await prisma.devRecipe.deleteMany({ where: { id, userId } })).count > 0;
}

interface RecipeRow {
  id: string;
  userId: string;
  action: string;
  actionConfig: unknown;
  lastFiredAt: Date | null;
}

/** Deliver one message; returns an error string or null. Disables dead webhooks. */
async function deliver(r: RecipeRow, message: string): Promise<string | null> {
  const c = r.actionConfig as Cfg;
  if (r.action === 'dm_self') {
    await createNotification({
      userId: r.userId,
      type: 'SYSTEM',
      entityType: 'recipe',
      entityId: r.id,
      preview: message.slice(0, 280),
      link: '/developer',
    });
    return null;
  }
  try {
    const res = await safeFetch(str(c.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'RMH Studios',
        content: message.slice(0, 1900),
        allowed_mentions: { parse: [] },
      }),
      allowedHosts: ['discord.com', 'discordapp.com'],
      timeoutMs: 8000,
    });
    if (res.status === 404 || res.status === 401) return 'webhook-gone';
    return res.ok ? null : `Discord returned ${res.status}`;
  } catch (e) {
    return (e as Error).message.slice(0, 190);
  }
}

/** Fire a recipe with a message: spacing + hourly cap, then bookkeeping. */
async function fire(r: RecipeRow, message: string): Promise<void> {
  const now = Date.now();
  const tooSoon = r.lastFiredAt && now - r.lastFiredAt.getTime() < MIN_GAP_MS;
  if (
    tooSoon ||
    !rateLimit(r.id, { limit: HOURLY_CAP, windowMs: 3_600_000, prefix: 'recipe' }).allowed
  ) {
    await prisma.devRecipe.update({
      where: { id: r.id },
      data: { lastError: 'Rate limited — event skipped' },
    });
    return;
  }
  const err = await deliver(r, message);
  await prisma.devRecipe.update({
    where: { id: r.id },
    data: err
      ? {
          lastError:
            err === 'webhook-gone' ? 'Discord webhook no longer exists — recipe paused' : err,
          ...(err === 'webhook-gone' ? { enabled: false } : {}),
        }
      : { lastFiredAt: new Date(), fireCount: { increment: 1 }, lastError: null },
  });
}

/** Polled triggers (new follower, market price). Bounded: 200 recipes per run. */
export async function runPolledRecipes(): Promise<number> {
  const recipes = await prisma.devRecipe.findMany({
    where: { enabled: true, trigger: { in: ['new_follower', 'price_below'] } },
    orderBy: { lastCheckedAt: 'asc' },
    take: 200,
  });
  let fired = 0;
  for (const r of recipes) {
    const since = r.lastCheckedAt;
    const checkedAt = new Date();
    const c = r.triggerConfig as Cfg;
    let message: string | null = null;
    try {
      if (r.trigger === 'new_follower') {
        const rows = await prisma.follow.findMany({
          where: { followingId: r.userId, createdAt: { gt: since } },
          orderBy: { createdAt: 'desc' },
          take: 4,
          select: { follower: { select: { name: true, handle: true } } },
        });
        if (rows.length) {
          const names = rows.map((x) => x.follower.name || x.follower.handle || 'Someone');
          message =
            rows.length === 1
              ? `${names[0]} followed you on RMH Studios.`
              : `${names.slice(0, 3).join(', ')}${rows.length > 3 ? ' and others' : ''} followed you on RMH Studios.`;
        }
      } else {
        const l = await prisma.marketListing.findFirst({
          where: {
            status: 'ACTIVE',
            itemId: str(c.itemId),
            priceCoins: { lt: num(c.maxPrice) },
            createdAt: { gt: since },
            sellerId: { not: r.userId },
          },
          orderBy: { priceCoins: 'asc' },
          select: { priceCoins: true },
        });
        if (l) {
          const name = getShopItem(str(c.itemId))?.name ?? str(c.itemId);
          message = `${name} is listed on the market for ${l.priceCoins} coins (your limit: ${num(c.maxPrice)}).`;
        }
      }
      if (message) {
        await fire(r, message);
        fired++;
      }
    } catch (e) {
      console.error('[recipes] run failed', r.id, (e as Error).message);
    }
    if (message || checkedAt.getTime() - since.getTime() > 3_600_000) {
      await prisma.devRecipe
        .update({ where: { id: r.id }, data: { lastCheckedAt: checkedAt } })
        .catch(() => {});
    }
  }
  return fired;
}

interface RecipeEvent {
  userId: string;
  trigger: 'new_pb';
  gameId: string;
  score: number;
}

async function handleRecipeEvent(e: RecipeEvent): Promise<void> {
  const recipes = await prisma.devRecipe.findMany({
    where: { userId: e.userId, trigger: e.trigger, enabled: true },
    take: MAX_RECIPES,
  });
  for (const r of recipes) {
    if (str((r.triggerConfig as Cfg).gameId) !== e.gameId) continue;
    await fire(
      r,
      `New personal best in ${gameTitle(e.gameId)}: ${e.score.toLocaleString('en-US')}!`,
    );
  }
}

/** Called from score submission on a personal best. Never throws. */
export async function emitPersonalBest(
  userId: string,
  gameId: string,
  score: number,
): Promise<void> {
  try {
    const any = await prisma.devRecipe.findFirst({
      where: { userId, trigger: 'new_pb', enabled: true },
      select: { id: true },
    });
    if (!any) return;
    const ev: RecipeEvent = { userId, trigger: 'new_pb', gameId, score };
    const boss = await getBoss();
    if (boss) {
      await boss.send(RECIPE_EVENT_QUEUE, ev, { retryLimit: 1, expireInSeconds: 300 });
    } else {
      await handleRecipeEvent(ev);
    }
  } catch (e) {
    console.error('[recipes] emit failed', (e as Error).message);
  }
}

export async function registerRecipeJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(RECIPE_POLL_QUEUE);
  await boss.createQueue(RECIPE_EVENT_QUEUE);
  await boss.schedule(RECIPE_POLL_QUEUE, RECIPE_POLL_CRON, {}, { tz: 'UTC' });
  await boss.work(RECIPE_POLL_QUEUE, async () => {
    await runPolledRecipes();
  });
  await boss.work<RecipeEvent>(RECIPE_EVENT_QUEUE, async (jobs) => {
    for (const j of jobs) await handleRecipeEvent(j.data);
  });
}
