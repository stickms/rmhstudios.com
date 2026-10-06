/**
 * Server side of Dunesday cloud sync: create/update/delete a synced plan,
 * check edit tokens, manage the Discord webhook, and the daily-lineup sweep.
 *
 * Capabilities instead of accounts. A plan is created anonymously and handed
 * back two strings: `feedId` (public — it is in every calendar and RSS URL)
 * and an edit token (secret — only its SHA-256 is stored, compared in constant
 * time). That keeps the planner usable signed out, which is the point of it,
 * and means a leaked calendar URL can read a watch list but never change it.
 *
 * Discord posting reuses the PF2e board's webhook helpers
 * (`lib/pf2ecal/discord.server.ts`): host-allowlisted on write AND on send,
 * never logged, never returned to a client except masked.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { maskWebhookUrl, postToWebhook, validateWebhookUrl } from '@/lib/pf2ecal/discord.server';
import {
  dailyLineupPayload,
  isDailyDue,
  isValidTimeZone,
  progressPayload,
  snapshot,
  testPayload,
  type FeedContext,
} from './feed';
import { hydrateState, type DunesdayState } from './state';

export const DUNESDAY_DAILY_QUEUE = 'dunesday.daily-lineup';
/** Every 10 minutes: the lineup window is two hours wide, so this never misses. */
export const DUNESDAY_DAILY_CRON = '*/10 * * * *';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function newFeedId(): string {
  return randomBytes(12).toString('base64url');
}

export function newEditToken(): string {
  return randomBytes(24).toString('base64url');
}

export function tokenMatches(token: string | null | undefined, hash: string): boolean {
  if (!token || token.length > 100) return false;
  const a = Buffer.from(sha256(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Normalise whatever the client sent through the same function the page uses. */
export function cleanState(raw: unknown, timeZone: string): DunesdayState {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  return hydrateState(raw, today);
}

function ctxFor(
  row: { state: unknown; timeZone: string; feedId: string },
  now = new Date(),
): FeedContext {
  return {
    state: hydrateState(
      row.state,
      new Intl.DateTimeFormat('en-CA', { timeZone: row.timeZone }).format(now),
    ),
    timeZone: row.timeZone,
    now,
    feedId: row.feedId,
    siteUrl: SITE_URL,
  };
}

export type SyncedPlanView = {
  feedId: string;
  state: DunesdayState;
  timeZone: string;
  discord: {
    webhook: string | null;
    daily: boolean;
    progress: boolean;
    name: string | null;
  };
};

const viewSelect = {
  feedId: true,
  state: true,
  timeZone: true,
  editTokenHash: true,
  discordWebhookUrl: true,
  discordDaily: true,
  discordProgress: true,
  discordName: true,
} as const satisfies Prisma.DunesdayPlanSelect;

type ViewRow = Prisma.DunesdayPlanGetPayload<{ select: typeof viewSelect }>;

function toView(row: ViewRow): SyncedPlanView {
  return {
    feedId: row.feedId,
    state: hydrateState(row.state),
    timeZone: row.timeZone,
    discord: {
      webhook: maskWebhookUrl(row.discordWebhookUrl),
      daily: row.discordDaily,
      progress: row.discordProgress,
      name: row.discordName,
    },
  };
}

export async function createPlan(rawState: unknown, timeZone: string) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const feedId = newFeedId();
  const token = newEditToken();
  const state = cleanState(rawState, zone);
  await prisma.dunesdayPlan.create({
    data: {
      feedId,
      editTokenHash: sha256(token),
      state: state as unknown as Prisma.InputJsonValue,
      timeZone: zone,
    },
  });
  return { feedId, token };
}

/** Load a plan for its owner. `null` = no such plan; `false` = wrong token. */
export async function loadForOwner(
  feedId: string,
  token: string | null,
): Promise<ViewRow | null | false> {
  const row = await prisma.dunesdayPlan.findUnique({ where: { feedId }, select: viewSelect });
  if (!row) return null;
  return tokenMatches(token, row.editTokenHash) ? row : false;
}

export function viewOf(row: ViewRow): SyncedPlanView {
  return toView(row);
}

/**
 * Save a new state. If Discord progress posts are on, the difference against
 * the stored state becomes one post — sent after the write, and never allowed
 * to fail the save.
 */
export async function savePlan(
  row: ViewRow,
  rawState: unknown,
  timeZone: string,
): Promise<{ posted: boolean }> {
  const zone = isValidTimeZone(timeZone) ? timeZone : row.timeZone;
  const before = hydrateState(row.state);
  const after = cleanState(rawState, zone);
  await prisma.dunesdayPlan.update({
    where: { feedId: row.feedId },
    data: { state: after as unknown as Prisma.InputJsonValue, timeZone: zone },
  });

  if (!row.discordWebhookUrl || !row.discordProgress) return { posted: false };
  const payload = progressPayload(
    before,
    { ...ctxFor({ ...row, timeZone: zone }), state: after },
    row.discordName,
  );
  if (!payload) return { posted: false };
  const result = await postToWebhook(row.discordWebhookUrl, payload);
  if (!result.ok)
    console.error('[dunesday] progress post failed', { feedId: row.feedId, status: result.status });
  return { posted: result.ok };
}

export async function deletePlan(feedId: string): Promise<void> {
  await prisma.dunesdayPlan.deleteMany({ where: { feedId } });
}

export async function saveDiscord(
  row: ViewRow,
  input: { webhookUrl?: string | null; daily: boolean; progress: boolean; name: string | null },
): Promise<{ ok: true; view: SyncedPlanView } | { ok: false; error: string }> {
  let webhook: string | null | undefined;
  if (input.webhookUrl === null || input.webhookUrl === '') webhook = null;
  else if (typeof input.webhookUrl === 'string') {
    const check = validateWebhookUrl(input.webhookUrl);
    if (!check.ok || !check.url)
      return { ok: false, error: check.error ?? 'That is not a webhook URL.' };
    webhook = check.url;
  }
  const updated = await prisma.dunesdayPlan.update({
    where: { feedId: row.feedId },
    data: {
      ...(webhook !== undefined ? { discordWebhookUrl: webhook } : {}),
      discordDaily: input.daily,
      discordProgress: input.progress,
      discordName: input.name?.trim().slice(0, 40) || null,
    },
    select: viewSelect,
  });
  return { ok: true, view: toView(updated) };
}

/** "Send a test" — to the URL just typed if there is one, else the stored one. */
export async function sendTest(
  row: ViewRow,
  typedUrl?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  let url = row.discordWebhookUrl;
  if (typedUrl) {
    const check = validateWebhookUrl(typedUrl);
    if (!check.ok || !check.url) return { ok: false, error: check.error };
    url = check.url;
  }
  if (!url) return { ok: false, error: 'Paste a Discord webhook URL first.' };
  const result = await postToWebhook(url, testPayload(ctxFor(row)));
  return { ok: result.ok, error: result.error };
}

/** Public read for the calendar and RSS routes. */
export async function loadFeed(feedId: string) {
  return prisma.dunesdayPlan.findUnique({
    where: { feedId },
    select: { feedId: true, state: true, timeZone: true, updatedAt: true },
  });
}

export function feedContext(
  row: { state: unknown; timeZone: string; feedId: string },
  now = new Date(),
) {
  return ctxFor(row, now);
}

// ── The daily-lineup sweep (jobs worker) ───────────────────────────────────

export interface DailySweepResult {
  considered: number;
  sent: number;
  failed: number;
}

/**
 * Post tonight's lineup for every plan whose window is open. Idempotent on
 * `lastDailyPostDate`, claimed with a conditional update BEFORE sending — the
 * PF2e reminder sweep's ordering, for the same reason: a missed post is cheaper
 * than a channel that gets the same lineup five times when Discord is slow.
 */
export async function runDailySweep(now = new Date()): Promise<DailySweepResult> {
  const rows = await prisma.dunesdayPlan.findMany({
    where: { discordWebhookUrl: { not: null }, discordDaily: true },
    select: {
      id: true,
      feedId: true,
      state: true,
      timeZone: true,
      discordWebhookUrl: true,
      discordName: true,
      lastDailyPostDate: true,
    },
    take: 5000,
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const ctx = ctxFor(row, now);
    if (!isDailyDue(ctx, row.lastDailyPostDate)) continue;
    const today = snapshot(ctx.state, ctx.timeZone, now).today;
    const claim = await prisma.dunesdayPlan.updateMany({
      where: {
        id: row.id,
        OR: [{ lastDailyPostDate: null }, { lastDailyPostDate: { not: today } }],
      },
      data: { lastDailyPostDate: today },
    });
    if (claim.count === 0) continue;
    const payload = dailyLineupPayload(ctx, row.discordName);
    if (!payload || !row.discordWebhookUrl) continue;
    const result = await postToWebhook(row.discordWebhookUrl, payload);
    if (result.ok) sent++;
    else {
      failed++;
      // A deleted webhook will never work again: switch the daily post off
      // rather than retrying it every night forever.
      if (result.status === 404) {
        await prisma.dunesdayPlan.update({ where: { id: row.id }, data: { discordDaily: false } });
      }
      console.error('[dunesday] daily post failed', { feedId: row.feedId, status: result.status });
    }
  }
  return { considered: rows.length, sent, failed };
}

export async function registerDunesdayDailyCron(boss: {
  createQueue: (name: string) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(DUNESDAY_DAILY_QUEUE);
  await boss.schedule(DUNESDAY_DAILY_QUEUE, DUNESDAY_DAILY_CRON, {}, { tz: 'UTC' });
  await boss.work(DUNESDAY_DAILY_QUEUE, async () => {
    const result = await runDailySweep();
    if (result.sent > 0 || result.failed > 0) console.warn('[dunesday] daily sweep', result);
  });
}
