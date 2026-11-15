import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  checkConnect,
  loadPolicy,
} from '../policy';
import { CLOSE_REASON } from '../wisp';

const p =
  loadPolicy(
    {},
  );
const pub =
  async () => [
    {
      address:
        '93.184.216.34',
      family:
        4 as const,
    },
  ];
const base =
  {
    streamType:
      'tcp' as const,
    port: 443,
    host: 'example.com',
    openStreams: 0,
  };
const blocked =
  {
    ok: false,
    reason:
      CLOSE_REASON.blocked,
  };

describe('loadPolicy', () => {
  it('defaults: enabled, mail ports denied', () => {
    expect(
      p.enabled,
    ).toBe(
      true,
    );
    expect(
      [
        ...p.deniedPorts,
      ],
    ).toEqual(
      [
        25,
        465,
        587,
        2525,
      ],
    );
    expect(
      p.maxStreams,
    ).toBe(
      64,
    );
  });
  it('can be disabled and the denied ports overridden', () => {
    expect(
      loadPolicy(
        {
          RMHOS_NET_ENABLED:
            '0',
        },
      )
        .enabled,
    ).toBe(
      false,
    );
    expect(
      loadPolicy(
        {
          RMHOS_NET_DENIED_PORTS:
            '25, 6667',
        },
      )
        .deniedPorts,
    ).toEqual(
      new Set(
        [
          25,
          6667,
        ],
      ),
    );
  });
});

describe('checkConnect', () => {
  it('allows a public host and returns the checked address', async () => {
    expect(
      await checkConnect(
        p,
        base,
        pub,
      ),
    ).toEqual(
      {
        ok: true,
        address:
          '93.184.216.34',
        family: 4,
      },
    );
  });
  it('blocks denied ports, allows every other port', async () => {
    expect(
      await checkConnect(
        p,
        {
          ...base,
          port: 25,
        },
        pub,
      ),
    ).toEqual(
      blocked,
    );
    expect(
      await checkConnect(
        p,
        {
          ...base,
          port: 587,
        },
        pub,
      ),
    ).toEqual(
      blocked,
    );
    for (const port of [
      22,
      443,
      6667,
    ])
      expect(
        (
          await checkConnect(
            p,
            {
              ...base,
              port,
            },
            pub,
          )
        )
          .ok,
      ).toBe(
        true,
      );
  });
  it('blocks udp', async () => {
    expect(
      await checkConnect(
        p,
        {
          ...base,
          streamType:
            'udp',
        },
        pub,
      ),
    ).toEqual(
      blocked,
    );
  });
  it('throttles at the stream cap', async () => {
    expect(
      await checkConnect(
        p,
        {
          ...base,
          openStreams: 64,
        },
        pub,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          CLOSE_REASON.throttled,
      },
    );
  });
  it('blocks private, loopback and metadata hosts without trusting the resolver', async () => {
    for (const host of [
      '127.0.0.1',
      'localhost',
      'foo.localhost',
      '169.254.169.254',
      '[::1]',
      '::ffff:10.0.0.5',
      '10.1.2.3',
    ])
      expect(
        await checkConnect(
          p,
          {
            ...base,
            host,
          },
          async () => [
            {
              address:
                '127.0.0.1',
              family: 4,
            },
          ],
        ),
      ).toEqual(
        blocked,
      );
  });
  it('allows a public IP literal', async () => {
    expect(
      await checkConnect(
        p,
        {
          ...base,
          host: '93.184.216.34',
        },
        async () => [],
      ),
    ).toEqual(
      {
        ok: true,
        address:
          '93.184.216.34',
        family: 4,
      },
    );
  });
  it('blocks a mixed public/private answer (rebinding)', async () => {
    expect(
      await checkConnect(
        p,
        base,
        async () => [
          {
            address:
              '93.184.216.34',
            family: 4,
          },
          {
            address:
              '10.0.0.5',
            family: 4,
          },
        ],
      ),
    ).toEqual(
      blocked,
    );
  });
  it('maps resolve failure and empty answers to unreachable', async () => {
    const unreachable =
      {
        ok: false,
        reason:
          CLOSE_REASON.unreachable,
      };
    expect(
      await checkConnect(
        p,
        base,
        async () => {
          throw new Error(
            'ENOTFOUND',
          );
        },
      ),
    ).toEqual(
      unreachable,
    );
    expect(
      await checkConnect(
        p,
        base,
        async () => [],
      ),
    ).toEqual(
      unreachable,
    );
  });
  it('rejects an empty host', async () => {
    expect(
      await checkConnect(
        p,
        {
          ...base,
          host: '',
        },
        pub,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          CLOSE_REASON.invalid,
      },
    );
  });
  it('blocks IPv6 spellings of private space and private mapped resolver answers', async () => {
    for (const host of [
      '[::1%lo]',
      '0:0:0:0:0:ffff:7f00:1',
      '::ffff:169.254.169.254',
    ])
      expect(
        await checkConnect(
          p,
          {
            ...base,
            host,
          },
          pub,
        ),
        host,
      ).toEqual(
        blocked,
      );
    expect(
      await checkConnect(
        p,
        base,
        async () => [
          {
            address:
              '::ffff:10.0.0.5',
            family: 6,
          },
        ],
      ),
    ).toEqual(
      blocked,
    );
  });
  it('blocks localhost with a trailing dot', async () => {
    for (const host of [
      'localhost.',
      'foo.localhost.',
    ])
      expect(
        await checkConnect(
          p,
          {
            ...base,
            host,
          },
          pub,
        ),
        host,
      ).toEqual(
        blocked,
      );
  });
});

describe('loadPolicy limits', () => {
  it('uses the spec defaults', () => {
    expect(
      p.bytesPerSecond,
    ).toBe(
      2 *
        1024 *
        1024,
    );
    expect(
      p.bytesPerDay,
    ).toBe(
      2 *
        1024 **
          3,
    );
  });
  it('never yields an empty deny-list', () => {
    for (const v of [
      '',
      ' , ',
      'abc',
      '0,70000',
    ])
      expect(
        [
          ...loadPolicy(
            {
              RMHOS_NET_DENIED_PORTS:
                v,
            },
          )
            .deniedPorts,
        ],
        v,
      ).toEqual(
        [
          25,
          465,
          587,
          2525,
        ],
      );
  });
});

describe('loadPolicy operator switches', () => {
  it('defaults: no allow-list, scan brake 300, 200 sessions, 20 MiB/s and 100 GiB/day globally', () => {
    expect(
      p.allowedPorts,
    ).toBeNull();
    expect(
      p.maxDestinationsPer10Min,
    ).toBe(
      300,
    );
    expect(
      p.maxSessions,
    ).toBe(
      200,
    );
    expect(
      p.globalBytesPerSecond,
    ).toBe(
      20 *
        1024 *
        1024,
    );
    expect(
      p.globalBytesPerDay,
    ).toBe(
      100 *
        1024 **
          3,
    );
  });
  it('reads every override', () => {
    const q =
      loadPolicy(
        {
          RMHOS_NET_ALLOWED_PORTS:
            '80, 443',
          RMHOS_NET_MAX_DESTINATIONS_PER_10MIN:
            '5',
          RMHOS_NET_MAX_SESSIONS:
            '3',
          RMHOS_NET_GLOBAL_BYTES_PER_SECOND:
            '1000',
          RMHOS_NET_GLOBAL_BYTES_PER_DAY:
            '2000',
        },
      );
    expect(
      q.allowedPorts,
    ).toEqual(
      new Set(
        [
          80,
          443,
        ],
      ),
    );
    expect(
      [
        q.maxDestinationsPer10Min,
        q.maxSessions,
        q.globalBytesPerSecond,
        q.globalBytesPerDay,
      ],
    ).toEqual(
      [
        5,
        3,
        1000,
        2000,
      ],
    );
  });
  it('an allow-list admits only its ports and ignores the deny-list; a junk one allows nothing', async () => {
    const q =
      loadPolicy(
        {
          RMHOS_NET_ALLOWED_PORTS:
            '80,443',
          RMHOS_NET_DENIED_PORTS:
            '80',
        },
      );
    const at =
      (
        port: number,
      ) =>
        checkConnect(
          q,
          {
            ...base,
            port,
          },
          pub,
        );
    expect(
      (
        await at(
          443,
        )
      )
        .ok,
    ).toBe(
      true,
    );
    expect(
      (
        await at(
          80,
        )
      )
        .ok,
    ).toBe(
      true,
    );
    expect(
      await at(
        22,
      ),
    ).toEqual(
      blocked,
    );
    const junk =
      loadPolicy(
        {
          RMHOS_NET_ALLOWED_PORTS:
            'abc',
        },
      );
    expect(
      await checkConnect(
        junk,
        base,
        pub,
      ),
    ).toEqual(
      blocked,
    );
  });
});
