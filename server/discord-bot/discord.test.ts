/**
 * The REST port in channel test mode: what it lets out, what it reads back, and that it cleans
 * up after itself — the guarantees a live run on the shared production token relies on.
 */
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { REST } from '@discordjs/rest';
import {
  GuardRefusal,
  RestDiscordPort,
} from './discord';
import { loadGuardConfig } from './guard';

function port(
  env: Record<
    string,
    string
  >,
  history: unknown[] = [],
) {
  let n = 0;
  const rest =
    {
      post: vi.fn(
        async (
          _route: string,
          opts?: {
            body?: {
              content?: string;
            };
          },
        ) => ({
          id: `m${++n}`,
          content:
            opts
              ?.body
              ?.content,
        }),
      ),
      get: vi.fn(
        async () =>
          history,
      ),
      patch:
        vi.fn(
          async () => ({}),
        ),
      put: vi.fn(
        async () => [],
      ),
      delete:
        vi.fn(
          async (
            _route: string,
          ) =>
            undefined,
        ),
    };
  const sendPresence =
    vi.fn();
  const p =
    new RestDiscordPort(
      {
        rest: rest as unknown as REST,
        guard:
          loadGuardConfig(
            env,
          ),
        selfId:
          () =>
            'self',
        applicationId:
          () =>
            'app',
        channelGuild:
          () =>
            'g',
        sendPresence,
        logger:
          {
            info: vi.fn(),
            warn: vi.fn(),
          },
      },
    );
  return {
    p,
    rest,
    sendPresence,
  };
}

const TEST =
  {
    DISCORD_BOT_GUILD_ALLOWLIST:
      'g',
    DISCORD_BOT_CHANNEL_ALLOWLIST:
      'c',
    DISCORD_BOT_TEST_MAX_MESSAGES:
      '2',
  };

describe('RestDiscordPort', () => {
  it('passes straight through in production, presence included', async () => {
    const {
      p,
      rest,
      sendPresence,
    } =
      port(
        {},
      );
    await p.send(
      'anywhere',
      {
        content:
          'hi',
      },
    );
    expect(
      rest
        .post
        .mock
        .calls[0]![1],
    ).toMatchObject(
      {
        body: {
          content:
            'hi',
        },
      },
    );
    p.updatePresence(
      {
        status:
          'online',
        activities:
          [],
      },
    );
    expect(
      sendPresence,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('in test mode: prefixes, caps, records and deletes what it posted', async () => {
    const {
      p,
      rest,
      sendPresence,
    } =
      port(
        TEST,
      );
    await p.send(
      'c',
      {
        content:
          'hello',
      },
    );
    await p.send(
      'c',
      {
        embeds:
          [
            {
              title:
                'intro',
            },
          ],
      },
    );
    expect(
      rest.post.mock.calls.map(
        (
          c,
        ) =>
          (
            c[1] as {
              body: {
                content: string;
              };
            }
          )
            .body
            .content,
      ),
    ).toEqual(
      [
        '[test] hello',
        '[test]',
      ],
    );
    await expect(
      p.send(
        'c',
        {
          content:
            'third',
        },
      ),
    ).rejects.toBeInstanceOf(
      GuardRefusal,
    );
    await expect(
      p.send(
        'elsewhere',
        {
          content:
            'x',
        },
      ),
    ).rejects.toBeInstanceOf(
      GuardRefusal,
    );
    p.updatePresence(
      {
        status:
          'dnd',
        activities:
          [],
      },
    );
    expect(
      sendPresence,
    ).not.toHaveBeenCalled();
    expect(
      await p.cleanupTestMessages(),
    ).toBe(
      2,
    );
    expect(
      rest.delete.mock.calls.map(
        (
          c,
        ) =>
          c[0],
      ),
    ).toEqual(
      [
        '/channels/c/messages/m2',
        '/channels/c/messages/m1',
      ],
    );
  });

  it('in test mode: never hands back another user’s message', async () => {
    const {
      p,
    } =
      port(
        TEST,
        [
          {
            id: '1',
            channel_id:
              'c',
            author:
              {
                id: 'person',
              },
            content:
              'private',
          },
          {
            id: '2',
            channel_id:
              'c',
            author:
              {
                id: 'self',
              },
            content:
              'ours',
          },
        ],
      );
    expect(
      (
        await p.getMessages(
          'c',
          {
            limit: 50,
          },
        )
      ).map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        '2',
      ],
    );
    await expect(
      p.getMessage(
        'c',
        '1',
      ),
    ).rejects.toBeInstanceOf(
      GuardRefusal,
    );
  });

  it('refuses global command writes while restricted', async () => {
    const {
      p,
      rest,
    } =
      port(
        {
          DISCORD_BOT_GUILD_ALLOWLIST:
            'g',
        },
      );
    await expect(
      p.overwriteCommands(
        '',
        [],
      ),
    ).rejects.toBeInstanceOf(
      GuardRefusal,
    );
    expect(
      rest.put,
    ).not.toHaveBeenCalled();
    await p.getCommands(
      '',
    );
    expect(
      rest.get,
    ).toHaveBeenCalledWith(
      '/applications/app/commands',
    );
  });
});
