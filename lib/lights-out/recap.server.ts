/**
 * Lights Out daily recap (D3: ported from the Go worker `internal/recap`).
 * Server-only; runs in the `jobs` worker as a pg-boss cron every 5 minutes.
 *
 * Finds `discord_activity_channel` rows whose recap is due, builds an embed of
 * that guild's participants for the recap date (./recap-embed.ts), claims the
 * schedule by clearing it, then posts to the channel over Discord's REST API.
 *
 *   - no participants: just clear the schedule;
 *   - 403 / 404 (bot lacks access, channel gone): stays cleared;
 *   - transport error, 429 or 5xx: the schedule is put back so the next tick retries;
 *   - no DISCORD_ACTIVITY_BOT_TOKEN: nothing is posted but the schedule is still
 *     cleared, exactly as the Go worker did.
 *
 * Not ported: the Go worker also held a gateway connection so the Activity bot
 * showed "online / Playing RMHBox". That is presence only, nothing here depends
 * on it, and a gateway client is not something to hand-roll in this slice (the
 * Go discord-bot worker, which stays, keeps the bot online when it shares the token).
 *
 * Freshness for on-call (B06 `recap`, 20 min): the status service reads the last
 * COMPLETED job of RECAP_QUEUE from pg-boss's job table. Per-guild failures are
 * logged and do not fail the job; only the due-channels query throwing does.
 *
 * Env (names unchanged from the Go worker): DISCORD_ACTIVITY_BOT_TOKEN,
 * VITE_DISCORD_ACTIVITY_CLIENT_ID (fallback DISCORD_ACTIVITY_CLIENT_ID),
 * SITE_URL (fallback VITE_BETTER_AUTH_URL, default https://rmhstudios.com).
 */
import { prisma } from '@/lib/prisma.server';
import { buildRecapEmbed, type RecapEmbed, type RecapParticipant } from './recap-embed';

export const RECAP_QUEUE = 'lights-out.recap';
export const RECAP_CRON = '*/5 * * * *';

export interface DueChannel {
  id: string;
  guildId: string;
  channelId: string;
  recapDateKey: string;
}

export interface RecapRepo {
  dueChannels(now: Date): Promise<DueChannel[]>;
  participants(guildId: string, dateKey: string): Promise<RecapParticipant[]>;
  /** Claim: clear the schedule. Returns false when nothing was changed (already claimed). */
  clear(id: string, dateKey: string): Promise<boolean>;
  /** Put a cleared schedule back, only if nothing rescheduled the channel meanwhile. */
  restore(id: string, dateKey: string, now: Date): Promise<void>;
}

/** HTTP status of the Discord response (0 when posting is disabled); throws on transport errors. */
export type RecapPoster = (channelId: string, embed: RecapEmbed) => Promise<number>;

export interface RecapSettings {
  appId: string;
  siteUrl: string;
}

export function recapSettings(env: NodeJS.ProcessEnv = process.env): RecapSettings {
  const appId = env.VITE_DISCORD_ACTIVITY_CLIENT_ID || env.DISCORD_ACTIVITY_CLIENT_ID || '';
  const siteUrl = (env.SITE_URL || env.VITE_BETTER_AUTH_URL || 'https://rmhstudios.com').replace(
    /\/+$/,
    '',
  );
  return { appId, siteUrl };
}

export const prismaRecapRepo: RecapRepo = {
  async dueChannels(now) {
    const rows = await prisma.discordActivityChannel.findMany({
      where: {
        activity: 'lights-out',
        recapDueAt: { not: null, lte: now },
        recapDateKey: { not: null },
      },
      select: { id: true, guildId: true, channelId: true, recapDateKey: true },
    });
    return rows.map((r) => ({ ...r, recapDateKey: r.recapDateKey ?? '' }));
  },
  async participants(guildId, dateKey) {
    // Prisma `asc` puts NULL moves last on Postgres, like the Go query's NULLS LAST.
    return prisma.discordDailyParticipant.findMany({
      where: { guildId, dateKey },
      orderBy: { moves: 'asc' },
      select: { username: true, status: true, moves: true, ratingEmoji: true, ratingLabel: true },
    });
  },
  async clear(id, dateKey) {
    const r = await prisma.discordActivityChannel.updateMany({
      where: { id, recapDateKey: dateKey, recapDueAt: { not: null } },
      data: { recapDateKey: null, recapDueAt: null },
    });
    return r.count > 0;
  },
  async restore(id, dateKey, now) {
    await prisma.discordActivityChannel.updateMany({
      where: { id, recapDateKey: null, recapDueAt: null },
      data: { recapDateKey: dateKey, recapDueAt: now },
    });
  },
};

/** POST the embed with the activity bot's token; resolves to the HTTP status. */
export function discordPoster(token: string | undefined): RecapPoster {
  return async (channelId, embed) => {
    if (!token) return 0; // posting disabled (the Go worker's nil-session path)
    const res = await fetch(
      `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    return res.status;
  };
}

export interface RecapDeps {
  repo?: RecapRepo;
  post?: RecapPoster;
  settings?: RecapSettings;
  log?: Pick<Console, 'info' | 'warn' | 'error'>;
  now?: () => Date;
}

/** One pass over the due channels. Throws only if the due-channels query fails. */
export async function processDueRecaps(
  deps: RecapDeps = {},
): Promise<{ due: number; posted: number }> {
  const repo = deps.repo ?? prismaRecapRepo;
  const post = deps.post ?? discordPoster(process.env.DISCORD_ACTIVITY_BOT_TOKEN);
  const { appId, siteUrl } = deps.settings ?? recapSettings();
  const log = deps.log ?? console;
  const clock = deps.now ?? (() => new Date());

  const channels = await repo.dueChannels(clock());
  if (channels.length === 0) return { due: 0, posted: 0 };
  log.info(`[recap] found due recaps count=${channels.length}`);

  let posted = 0;
  for (const ch of channels) {
    try {
      const participants = await repo.participants(ch.guildId, ch.recapDateKey);
      const embed = buildRecapEmbed(
        participants,
        ch.recapDateKey,
        ch.guildId,
        appId,
        siteUrl,
        clock(),
      );
      if (!embed) {
        await repo.clear(ch.id, ch.recapDateKey);
        continue;
      }
      // Claim BEFORE posting so a failed clear can never re-post every tick.
      if (!(await repo.clear(ch.id, ch.recapDateKey))) continue; // someone else has it
      let status: number;
      try {
        status = await post(ch.channelId, embed);
      } catch (err) {
        log.warn(
          `[recap] post error, will retry guild=${ch.guildId} err=${(err as Error)?.message}`,
        );
        await repo.restore(ch.id, ch.recapDateKey, clock());
        continue;
      }
      if (status === 403 || status === 404) {
        log.info(`[recap] bot lacks access, recap cleared guild=${ch.guildId} status=${status}`);
      } else if (status === 429 || status >= 500) {
        log.warn(`[recap] discord ${status}, will retry guild=${ch.guildId}`);
        await repo.restore(ch.id, ch.recapDateKey, clock());
      } else {
        posted++;
        log.info(`[recap] posted recap guild=${ch.guildId} channel=${ch.channelId}`);
      }
    } catch (err) {
      log.error(`[recap] recap failed for guild=${ch.guildId} err=${(err as Error)?.message}`);
    }
  }
  return { due: channels.length, posted };
}

export async function registerRecapCron(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(RECAP_QUEUE, { policy: 'exclusive' });
  await boss.schedule(RECAP_QUEUE, RECAP_CRON, {}, { tz: 'UTC' });
  await boss.work(RECAP_QUEUE, async () => {
    await processDueRecaps();
  });
  // The Go worker ran one pass at startup before its ticker.
  await boss.send?.(RECAP_QUEUE, {}).catch(() => undefined);
}
