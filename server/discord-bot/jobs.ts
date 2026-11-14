/**
 * The Discord bot inside the `jobs` worker (redesign D3: the last Go worker, now the only copy).
 *
 * The bot starts whenever a token is configured (DISCORD_BOT_TOKEN, else DISCORD_ACTIVITY_BOT_TOKEN — the
 * rule the Go bot used) and logs `discord_bot.disabled` otherwise. The Go supervisor that used to run it,
 * and its `internal/discordbot` copy, were deleted once this port shipped: there is one runtime.
 *
 * One limit the Go bot never needed, because it never ran under `pnpm dev`: outside NODE_ENV=production
 * (the images set it) the bot also needs the guard's DISCORD_BOT_GUILD_ALLOWLIST (guard.ts). A dev `.env`
 * that carries the shared DISCORD_ACTIVITY_BOT_TOKEN for Lights Out recaps would otherwise open a second
 * gateway session on the production bot and answer production guilds from a laptop.
 *
 * Why in `jobs` rather than its own process: the bot's periodic work (care tick, tracker flush,
 * identity poll, summarizer) must be pg-boss crons (D4: one scheduler), and those ticks read the
 * gateway's in-memory state cache and share the tracker's mutex with the gateway handlers — so
 * the cron consumer and the gateway connection have to be the same process. `jobs` already carries
 * the Prisma pool and the DeepSeek and xAI clients the bot uses; its compose limits were raised by
 * what the supervisor's bot needed.
 *
 * The Go tickers became:
 *   discord-bot.care-tick          ALEX_TICK_INTERVAL (10m) → `6-59/10 * * * *`, first run 30 s after boot
 *   discord-bot.watch-flush        DISCORD_WATCH_FLUSH_INTERVAL (1m) → `* * * * *`
 *   discord-bot.watch-identity     hourly → `23 * * * *`
 *   discord-bot.watch-summary      30m → `11-59/30 * * * *`, first run 60 s after boot (+ the weekly digest)
 * Offsets keep them off the minute-0 pile-up (queue-policy.ts); every tick is a no-op until the
 * gateway is READY. All are `exclusive` with no retries: each tick catches its own errors and the
 * next one re-reads the state.
 *
 * And one that is new, the B07 signal (it replaces the supervisor's rmh_discord_gateway_connected gauge):
 *   discord-bot.gateway-heartbeat  every minute; COMPLETES only while the gateway is READY and FAILS otherwise.
 * The Go status service already reads pg-boss's job table for the Node jobs' freshness (B06); it reads this
 * queue the same way and raises B07 when the last completed heartbeat is over 5 minutes old while the queue
 * is still scheduled. With no token the bot unschedules every one of its queues, so a disabled bot is
 * not an outage (go-services/internal/status/workers.go `evaluateGateway`).
 */
import { createLogger } from '../shared/logger';
import {
  cronEvery,
  getDuration,
  getString,
} from './config';
import {
  loadGuardConfig,
  restricted,
} from './guard';
import type { DiscordBot } from './bot';

export const DISCORD_BOT_QUEUES =
  {
    care: 'discord-bot.care-tick',
    flush:
      'discord-bot.watch-flush',
    identity:
      'discord-bot.watch-identity',
    summary:
      'discord-bot.watch-summary',
    heartbeat:
      'discord-bot.gateway-heartbeat',
  } as const;

/**
 * How long pg-boss keeps a heartbeat row. Status only reads the newest completed one; a day bounds the
 * table at ~1440 rows for this queue instead of pg-boss's 7-day default.
 */
export const HEARTBEAT_RETENTION_SECONDS =
  24 *
  60 *
  60;

export interface DiscordBotBoss {
  createQueue: (
    name: string,
    options?: object,
  ) => Promise<unknown>;
  schedule: (
    name: string,
    cron: string,
    data: object,
    options: object,
  ) => Promise<unknown>;
  unschedule?: (
    name: string,
  ) => Promise<unknown>;
  work: (
    name: string,
    handler: () => Promise<void>,
  ) => Promise<unknown>;
  send?: (
    name: string,
    data: object,
    options?: object,
  ) => Promise<unknown>;
}

/** The crons for this configuration (pure; tested). */
export function discordBotCrons(
  env: Record<
    string,
    | string
    | undefined
  > = process.env,
): Record<
  string,
  string
> {
  const care =
    getDuration(
      'ALEX_TICK_INTERVAL',
      10 *
        60_000,
      env,
    );
  const flush =
    getDuration(
      'DISCORD_WATCH_FLUSH_INTERVAL',
      60_000,
      env,
    );
  return {
    [DISCORD_BOT_QUEUES.care]:
      cronEvery(
        care >
          0
          ? care
          : 10 *
              60_000,
        6,
      ),
    [DISCORD_BOT_QUEUES.flush]:
      cronEvery(
        flush >
          0
          ? flush
          : 60_000,
      ),
    [DISCORD_BOT_QUEUES.identity]:
      cronEvery(
        60 *
          60_000,
        23,
      ),
    [DISCORD_BOT_QUEUES.summary]:
      cronEvery(
        30 *
          60_000,
        11,
      ),
    [DISCORD_BOT_QUEUES.heartbeat]:
      '* * * * *',
  };
}

let bot: DiscordBot | null =
  null;

/** The running bot (null until registered, and when no token is set). */
export function runningDiscordBot(): DiscordBot | null {
  return bot;
}

/**
 * The heartbeat job body: resolves while the gateway is READY, throws otherwise, so pg-boss records the
 * minute as `completed` or `failed` and the status service can tell a live gateway from a dead one.
 */
export async function gatewayHeartbeat(
  b: Pick<
    DiscordBot,
    'isReady'
  >,
): Promise<void> {
  if (
    !b.isReady()
  )
    throw new Error(
      'discord gateway not ready',
    );
}

/** Why this process must not start the bot, or null when it should (pure; tested). */
export function botDisabledReason(
  env: Record<
    string,
    | string
    | undefined
  > = process.env,
):
  | string
  | null {
  if (
    !getString(
      'DISCORD_BOT_TOKEN',
      '',
      env,
    ) &&
    !getString(
      'DISCORD_ACTIVITY_BOT_TOKEN',
      '',
      env,
    )
  ) {
    return 'no DISCORD_BOT_TOKEN/DISCORD_ACTIVITY_BOT_TOKEN set';
  }
  if (
    env.NODE_ENV !==
      'production' &&
    !restricted(
      loadGuardConfig(
        env,
      ),
    )
  ) {
    return 'outside NODE_ENV=production the bot needs DISCORD_BOT_GUILD_ALLOWLIST (guard.ts)';
  }
  return null;
}

export async function registerDiscordBot(
  boss: DiscordBotBoss,
): Promise<void> {
  const log =
    createLogger(
      'discord-bot',
    );
  const disabled =
    botDisabledReason();
  if (
    disabled
  ) {
    // Drop any schedules a run with a token left: nothing would consume them, and the status service reads a
    // scheduled heartbeat queue as "the bot should be online" (B07).
    for (const q of Object.values(
      DISCORD_BOT_QUEUES,
    ))
      await boss
        .unschedule?.(
          q,
        )
        .catch(
          () =>
            undefined,
        );
    log.warn(
      {
        event:
          'discord_bot.disabled',
        detail:
          disabled,
      },
    );
    return;
  }
  // Imported here, not at load: without a token the @discordjs packages (and the bot's services) stay out of
  // the worker entirely.
  const {
    DiscordBot,
    loadBotConfig,
  } =
    await import('./bot');
  bot =
    new DiscordBot(
      loadBotConfig(),
    );
  const b =
    bot;

  const handlers: Record<
    string,
    () => Promise<void>
  > =
    {
      [DISCORD_BOT_QUEUES.care]:
        () =>
          b.careTick(),
      [DISCORD_BOT_QUEUES.flush]:
        () =>
          b.watchFlush(),
      [DISCORD_BOT_QUEUES.identity]:
        () =>
          b.watchIdentities(),
      [DISCORD_BOT_QUEUES.summary]:
        () =>
          b.summaryTick(),
    };
  const crons =
    discordBotCrons();
  for (const [
    queue,
    cron,
  ] of Object.entries(
    crons,
  )) {
    if (
      queue ===
      DISCORD_BOT_QUEUES.heartbeat
    )
      continue;
    // The flush/identity/summary ticks only matter with the tracker on; the queues exist either way
    // so a config change never strands a schedule.
    await boss.createQueue(
      queue,
      {
        policy:
          'exclusive',
        retryLimit: 0,
        expireInSeconds:
          10 *
          60,
      },
    );
    await boss.schedule(
      queue,
      cron,
      {},
      {
        tz: 'UTC',
      },
    );
    const run =
      handlers[
        queue
      ]!;
    await boss.work(
      queue,
      async () => {
        try {
          await run();
        } catch (err) {
          log.warn(
            {
              event:
                'discord_bot.tick_failed',
              queue,
              err: (
                err as Error
              )
                .message,
            },
          );
        }
      },
    );
  }
  // The heartbeat is the one handler whose failure is the point: it is not wrapped, so a minute with the
  // gateway down lands as a `failed` job and only a READY gateway produces `completed` ones.
  await boss.createQueue(
    DISCORD_BOT_QUEUES.heartbeat,
    {
      policy:
        'exclusive',
      retryLimit: 0,
      expireInSeconds: 60,
      deleteAfterSeconds:
        HEARTBEAT_RETENTION_SECONDS,
    },
  );
  await boss.schedule(
    DISCORD_BOT_QUEUES.heartbeat,
    crons[
      DISCORD_BOT_QUEUES
        .heartbeat
    ]!,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(
    DISCORD_BOT_QUEUES.heartbeat,
    () =>
      gatewayHeartbeat(
        b,
      ),
  );
  // The Go loops ran their first pass shortly after the gateway opened.
  await boss
    .send?.(
      DISCORD_BOT_QUEUES.care,
      {},
      {
        startAfter: 30,
      },
    )
    .catch(
      () =>
        undefined,
    );
  await boss
    .send?.(
      DISCORD_BOT_QUEUES.summary,
      {},
      {
        startAfter: 60,
      },
    )
    .catch(
      () =>
        undefined,
    );
  log.info(
    {
      event:
        'discord_bot.crons_registered',
      crons,
    },
  );

  // Not awaited: the gateway retries patiently and must not hold up the rest of the worker's boot.
  void b.start();
}

/** Graceful stop for the worker's SIGTERM path (gateway close, reply drain, tracker close). */
export async function stopDiscordBot(): Promise<void> {
  const b =
    bot;
  bot =
    null;
  if (
    b
  )
    await b.stop();
}
