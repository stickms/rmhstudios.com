/**
 * The bot's pg-boss wiring with a token set: every queue is scheduled, the four ticks are wrapped so a
 * tick's error never fails its job, and the B07 heartbeat is NOT wrapped, so a minute with the gateway down
 * lands as a `failed` job (the status service reads only `completed` heartbeats). `./bot` is replaced by a
 * fake so no gateway is opened.
 */
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const fake =
  vi.hoisted(
    () => ({
      ready: false,
      started: 0,
    }),
  );

vi.mock(
  './bot',
  () => ({
    loadBotConfig:
      () => ({}),
    DiscordBot: class {
      isReady() {
        return fake.ready;
      }
      async start() {
        fake.started++;
      }
      async stop() {}
      async careTick() {
        throw new Error(
          'tick boom',
        );
      }
      async watchFlush() {}
      async watchIdentities() {}
      async summaryTick() {}
    },
  }),
);

import {
  DISCORD_BOT_QUEUES,
  HEARTBEAT_RETENTION_SECONDS,
  botDisabledReason,
  registerDiscordBot,
  stopDiscordBot,
} from './jobs';

afterEach(
  async () => {
    vi.unstubAllEnvs();
    await stopDiscordBot();
  },
);

function fakeBoss() {
  const handlers =
    new Map<
      string,
      () => Promise<void>
    >();
  const queues =
    new Map<
      string,
      | object
      | undefined
    >();
  const schedules =
    new Map<
      string,
      string
    >();
  return {
    handlers,
    queues,
    schedules,
    createQueue:
      vi.fn(
        async (
          n: string,
          o?: object,
        ) =>
          void queues.set(
            n,
            o,
          ),
      ),
    schedule:
      vi.fn(
        async (
          n: string,
          cron: string,
        ) =>
          void schedules.set(
            n,
            cron,
          ),
      ),
    unschedule:
      vi.fn(
        async () =>
          undefined,
      ),
    work: vi.fn(
      async (
        n: string,
        h: () => Promise<void>,
      ) =>
        void handlers.set(
          n,
          h,
        ),
    ),
    send: vi.fn(
      async () =>
        undefined,
    ),
  };
}

describe('botDisabledReason', () => {
  it('starts in production on either token, and nowhere without one', () => {
    expect(
      botDisabledReason(
        {
          NODE_ENV:
            'production',
          DISCORD_BOT_TOKEN:
            'x',
        },
      ),
    ).toBeNull();
    expect(
      botDisabledReason(
        {
          NODE_ENV:
            'production',
          DISCORD_ACTIVITY_BOT_TOKEN:
            'x',
        },
      ),
    ).toBeNull();
    expect(
      botDisabledReason(
        {
          NODE_ENV:
            'production',
        },
      ),
    ).toMatch(
      /no DISCORD_BOT_TOKEN/,
    );
  });

  it('keeps a dev .env with the shared token off the production bot unless the guard is set', () => {
    expect(
      botDisabledReason(
        {
          DISCORD_ACTIVITY_BOT_TOKEN:
            'x',
        },
      ),
    ).toMatch(
      /GUILD_ALLOWLIST/,
    );
    expect(
      botDisabledReason(
        {
          NODE_ENV:
            'development',
          DISCORD_BOT_TOKEN:
            'x',
        },
      ),
    ).toMatch(
      /GUILD_ALLOWLIST/,
    );
    expect(
      botDisabledReason(
        {
          DISCORD_BOT_TOKEN:
            'x',
          DISCORD_BOT_GUILD_ALLOWLIST:
            'g',
        },
      ),
    ).toBeNull();
  });
});

describe('registerDiscordBot with a token', () => {
  it('starts the bot on DISCORD_ACTIVITY_BOT_TOKEN alone, with no runtime switch', async () => {
    vi.stubEnv(
      'NODE_ENV',
      'production',
    );
    vi.stubEnv(
      'DISCORD_BOT_TOKEN',
      '',
    );
    vi.stubEnv(
      'DISCORD_ACTIVITY_BOT_TOKEN',
      'x',
    );
    const before =
      fake.started;
    const boss =
      fakeBoss();
    await registerDiscordBot(
      boss,
    );
    expect(
      fake.started,
    ).toBe(
      before +
        1,
    );
    expect(
      [
        ...boss.schedules.keys(),
      ].sort(),
    ).toEqual(
      Object.values(
        DISCORD_BOT_QUEUES,
      ).sort(),
    );
    expect(
      boss.unschedule,
    ).not.toHaveBeenCalled();
  });

  it('wraps the ticks but lets the heartbeat fail its job while the gateway is down', async () => {
    vi.stubEnv(
      'NODE_ENV',
      'production',
    );
    vi.stubEnv(
      'DISCORD_BOT_TOKEN',
      'x',
    );
    const boss =
      fakeBoss();
    await registerDiscordBot(
      boss,
    );

    // A tick's error is logged, never thrown into pg-boss.
    await expect(
      boss.handlers.get(
        DISCORD_BOT_QUEUES.care,
      )!(),
    ).resolves.toBeUndefined();

    const beat =
      boss.handlers.get(
        DISCORD_BOT_QUEUES.heartbeat,
      )!;
    expect(
      boss.schedules.get(
        DISCORD_BOT_QUEUES.heartbeat,
      ),
    ).toBe(
      '* * * * *',
    );
    expect(
      boss.queues.get(
        DISCORD_BOT_QUEUES.heartbeat,
      ),
    ).toMatchObject(
      {
        policy:
          'exclusive',
        retryLimit: 0,
        deleteAfterSeconds:
          HEARTBEAT_RETENTION_SECONDS,
      },
    );
    fake.ready = false;
    await expect(
      beat(),
    ).rejects.toThrow();
    fake.ready = true;
    await expect(
      beat(),
    ).resolves.toBeUndefined();
  });
});
