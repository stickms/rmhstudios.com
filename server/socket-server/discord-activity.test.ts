import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  applyDiscordActivityToken,
  resetDiscordActivityForTests,
  type DiscordActivityDeps,
} from './discord-activity';

const fetchMock =
  vi.fn();
const warn =
  vi.fn();
const deps: DiscordActivityDeps =
  {
    appId:
      'app-1',
    getPool:
      () =>
        null,
    logger:
      {
        warn,
      },
  };

const socketAt =
  (
    ip: string,
  ) =>
    ({
      data: {} as Record<
        string,
        unknown
      >,
      handshake:
        {
          headers:
            {
              'cf-connecting-ip':
                ip,
            },
          address:
            ip,
        },
    }) as never;
const info =
  () => ({
    ok: true,
    status: 200,
    json: async () => ({
      application:
        {
          id: 'app-1',
        },
      expires:
        new Date(
          Date.now() +
            3600_000,
        ).toISOString(),
      user: {
        id: '555',
        username:
          'sam',
      },
    }),
  });

beforeEach(
  () => {
    resetDiscordActivityForTests();
    fetchMock.mockReset();
    warn.mockReset();
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );
  },
);
afterEach(
  () =>
    vi.unstubAllGlobals(),
);

describe('hub Discord Activity token verification', () => {
  it('attaches the verified Discord id and caches the verdict', async () => {
    fetchMock.mockResolvedValue(
      info(),
    );
    const s =
      socketAt(
        '1.1.1.1',
      );
    expect(
      await applyDiscordActivityToken(
        s,
        't',
        deps,
      ),
    ).toBe(
      true,
    );
    expect(
      (
        s as {
          data: Record<
            string,
            unknown
          >;
        }
      )
        .data
        .discordId,
    ).toBe(
      '555',
    );
    expect(
      await applyDiscordActivityToken(
        socketAt(
          '1.1.1.1',
        ),
        't',
        deps,
      ),
    ).toBe(
      true,
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('remembers a refused token: the second attempt makes no outbound call', async () => {
    fetchMock.mockResolvedValue(
      {
        ok: false,
        status: 401,
      },
    );
    expect(
      await applyDiscordActivityToken(
        socketAt(
          '1.1.1.2',
        ),
        'bad',
        deps,
      ),
    ).toBe(
      false,
    );
    expect(
      await applyDiscordActivityToken(
        socketAt(
          '1.1.1.2',
        ),
        'bad',
        deps,
      ),
    ).toBe(
      false,
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not remember a 5xx or 429 (the call throws, soft-auth leaves the socket anonymous)', async () => {
    fetchMock.mockResolvedValueOnce(
      {
        ok: false,
        status: 503,
      },
    );
    await expect(
      applyDiscordActivityToken(
        socketAt(
          '1.1.1.3',
        ),
        'x',
        deps,
      ),
    ).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(
      {
        ok: false,
        status: 429,
      },
    );
    await expect(
      applyDiscordActivityToken(
        socketAt(
          '1.1.1.3',
        ),
        'x',
        deps,
      ),
    ).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(
      info(),
    );
    expect(
      await applyDiscordActivityToken(
        socketAt(
          '1.1.1.3',
        ),
        'x',
        deps,
      ),
    ).toBe(
      true,
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      3,
    );
  });

  it('shares one outbound call between concurrent verifications of one token', async () => {
    let release!: (
      v: unknown,
    ) => void;
    fetchMock.mockReturnValue(
      new Promise(
        (
          r,
        ) =>
          (release =
            r),
      ),
    );
    const calls =
      [
        1,
        2,
        3,
      ].map(
        () =>
          applyDiscordActivityToken(
            socketAt(
              '1.1.1.4',
            ),
            'same',
            deps,
          ),
      );
    release(
      info(),
    );
    expect(
      await Promise.all(
        calls,
      ),
    ).toEqual(
      [
        true,
        true,
        true,
      ],
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('limits unseen-token verifications per IP before calling Discord, logging once', async () => {
    fetchMock.mockResolvedValue(
      {
        ok: false,
        status: 401,
      },
    );
    for (
      let i = 0;
      i <
      40;
      i++
    )
      await applyDiscordActivityToken(
        socketAt(
          '9.9.9.9',
        ),
        `spray-${i}`,
        deps,
      );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      30,
    );
    expect(
      warn,
    ).toHaveBeenCalledTimes(
      1,
    );
    await applyDiscordActivityToken(
      socketAt(
        '8.8.8.8',
      ),
      'fresh',
      deps,
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      31,
    );
  });
});
