/**
 * The Discord bot inside the `jobs` worker (redesign D3: the last Go worker).
 *
 * `DISCORD_BOT_RUNTIME=node` starts the gateway here and registers the bot's periodic work as
 * pg-boss crons; anything else (unset in production until the owner flips it) registers nothing
 * and the Go supervisor keeps running its discord-bot — which, in turn, idles when the variable IS
 * `node`, so exactly one runtime ever connects.
 *
 * Why in `jobs` rather than its own process: the bot's periodic work (care tick, tracker flush,
 * identity poll, summarizer) must be pg-boss crons (D4: one scheduler), and those ticks read the
 * gateway's in-memory state cache and share the tracker's mutex with the gateway handlers — so
 * the cron consumer and the gateway connection have to be the same process. The bot's own
 * footprint (a state cache for a handful of guilds, one websocket) is small beside the 1280m
 * container, and `jobs` already carries the Prisma pool, the DeepSeek and xAI clients it uses.
 *
 * The Go tickers became:
 *   discord-bot.care-tick       ALEX_TICK_INTERVAL (10m) → `6-59/10 * * * *`, first run 30 s after boot
 *   discord-bot.watch-flush     DISCORD_WATCH_FLUSH_INTERVAL (1m) → `* * * * *`
 *   discord-bot.watch-identity  hourly → `23 * * * *`
 *   discord-bot.watch-summary   30m → `11-59/30 * * * *`, first run 60 s after boot (+ the weekly digest)
 * Offsets keep them off the minute-0 pile-up (queue-policy.ts); every tick is a no-op until the
 * gateway is READY. All are `exclusive` with no retries: each tick catches its own errors and the
 * next one re-reads the state.
 */
import { createLogger } from '../shared/logger';
import { cronEvery, getDuration, getString, nodeRuntimeSelected } from './config';
import type { DiscordBot } from './bot';

export const DISCORD_BOT_QUEUES = {
  care: 'discord-bot.care-tick',
  flush: 'discord-bot.watch-flush',
  identity: 'discord-bot.watch-identity',
  summary: 'discord-bot.watch-summary',
} as const;

export interface DiscordBotBoss {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  unschedule?: (name: string) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
}

/** The crons for this configuration (pure; tested). */
export function discordBotCrons(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const care = getDuration('ALEX_TICK_INTERVAL', 10 * 60_000, env);
  const flush = getDuration('DISCORD_WATCH_FLUSH_INTERVAL', 60_000, env);
  return {
    [DISCORD_BOT_QUEUES.care]: cronEvery(care > 0 ? care : 10 * 60_000, 6),
    [DISCORD_BOT_QUEUES.flush]: cronEvery(flush > 0 ? flush : 60_000),
    [DISCORD_BOT_QUEUES.identity]: cronEvery(60 * 60_000, 23),
    [DISCORD_BOT_QUEUES.summary]: cronEvery(30 * 60_000, 11),
  };
}

let bot: DiscordBot | null = null;

/** The running bot (null unless DISCORD_BOT_RUNTIME=node and a token is set). */
export function runningDiscordBot(): DiscordBot | null {
  return bot;
}

export async function registerDiscordBot(boss: DiscordBotBoss): Promise<void> {
  const log = createLogger('discord-bot');
  if (!nodeRuntimeSelected()) {
    // The Go runtime owns the bot. Drop any schedules a previous `node` run left, so pg-boss does
    // not fill queues nobody consumes.
    for (const q of Object.values(DISCORD_BOT_QUEUES)) await boss.unschedule?.(q).catch(() => undefined);
    log.info({ event: 'discord_bot.runtime_go', detail: 'DISCORD_BOT_RUNTIME is not "node"; the Go supervisor runs the bot' });
    return;
  }
  if (!getString('DISCORD_BOT_TOKEN', '') && !getString('DISCORD_ACTIVITY_BOT_TOKEN', '')) {
    log.warn({ event: 'discord_bot.disabled', detail: 'no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set' });
    return;
  }
  // Imported here, not at load: the @discordjs packages (and the bot's services) stay out of the
  // jobs worker entirely while the Go runtime owns the bot.
  const { DiscordBot, loadBotConfig } = await import('./bot');
  bot = new DiscordBot(loadBotConfig());
  const b = bot;

  const handlers: Record<string, () => Promise<void>> = {
    [DISCORD_BOT_QUEUES.care]: () => b.careTick(),
    [DISCORD_BOT_QUEUES.flush]: () => b.watchFlush(),
    [DISCORD_BOT_QUEUES.identity]: () => b.watchIdentities(),
    [DISCORD_BOT_QUEUES.summary]: () => b.summaryTick(),
  };
  const crons = discordBotCrons();
  for (const [queue, cron] of Object.entries(crons)) {
    // The flush/identity/summary ticks only matter with the tracker on; the queues exist either way
    // so a config change never strands a schedule.
    await boss.createQueue(queue, { policy: 'exclusive', retryLimit: 0, expireInSeconds: 10 * 60 });
    await boss.schedule(queue, cron, {}, { tz: 'UTC' });
    const run = handlers[queue]!;
    await boss.work(queue, async () => {
      try {
        await run();
      } catch (err) {
        log.warn({ event: 'discord_bot.tick_failed', queue, err: (err as Error).message });
      }
    });
  }
  // The Go loops ran their first pass shortly after the gateway opened.
  await boss.send?.(DISCORD_BOT_QUEUES.care, {}, { startAfter: 30 }).catch(() => undefined);
  await boss.send?.(DISCORD_BOT_QUEUES.summary, {}, { startAfter: 60 }).catch(() => undefined);
  log.info({ event: 'discord_bot.crons_registered', crons });

  // Not awaited: the gateway retries patiently and must not hold up the rest of the worker's boot.
  void b.start();
}

/** Graceful stop for the worker's SIGTERM path (gateway close, reply drain, tracker close). */
export async function stopDiscordBot(): Promise<void> {
  const b = bot;
  bot = null;
  if (b) await b.stop();
}
