import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  GuestLineParser,
  SHARE_ARCHIVE_PATH,
  encodeCommand,
} from '../agent-protocol';

const ENTROPY =
  'ab'.repeat(
    64,
  );

describe('encodeCommand', () => {
  it('encodes each command as one newline-terminated line', () => {
    expect(
      encodeCommand(
        {
          type: 'session',
          user: 'alice',
          epoch: 1794700000,
          entropy:
            ENTROPY,
        },
      ),
    ).toBe(
      `SESSION alice 1794700000 ${ENTROPY}\n`,
    );
    expect(
      encodeCommand(
        {
          type: 'restore',
        },
      ),
    ).toBe(
      'RESTORE\n',
    );
    expect(
      encodeCommand(
        {
          type: 'save',
          nonce:
            'n1',
        },
      ),
    ).toBe(
      'SAVE n1\n',
    );
    expect(
      encodeCommand(
        {
          type: 'shutdown',
        },
      ),
    ).toBe(
      'SHUTDOWN\n',
    );
  });

  it('rejects a session without a valid epoch and 64 bytes of hex entropy', () => {
    const base =
      {
        type: 'session' as const,
        user: 'alice',
        epoch: 1794700000,
        entropy:
          ENTROPY,
      };
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            entropy:
              '',
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            entropy:
              'ab'.repeat(
                63,
              ),
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            entropy:
              'AB'.repeat(
                64,
              ),
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            entropy: `${'ab'.repeat(63)}\nSHUTDOWN`,
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            epoch: 1.5,
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            epoch: 0,
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            epoch:
              -5,
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            epoch:
              Number.NaN,
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            ...base,
            epoch:
              2 **
              60,
          },
        ),
    ).toThrow();
  });

  it('rejects an epoch outside 2020-01-01 .. 2100-01-01', () => {
    const base = { type: 'session' as const, user: 'alice', epoch: 1794700000, entropy: ENTROPY };
    expect(() => encodeCommand({ ...base, epoch: 1 })).toThrow();
    expect(() => encodeCommand({ ...base, epoch: 1577836799 })).toThrow();
    expect(() => encodeCommand({ ...base, epoch: 4102444801 })).toThrow();
    expect(() => encodeCommand({ ...base, epoch: 99999999999 })).toThrow();
    expect(encodeCommand({ ...base, epoch: 1577836800 })).toContain(' 1577836800 ');
    expect(encodeCommand({ ...base, epoch: 4102444800 })).toContain(' 4102444800 ');
  });

  it('rejects values that could inject a second command', () => {
    expect(
      () =>
        encodeCommand(
          {
            type: 'session',
            user: 'a b\nSHUTDOWN',
            epoch: 1794700000,
            entropy:
              ENTROPY,
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            type: 'save',
            nonce:
              '',
          },
        ),
    ).toThrow();
    expect(
      () =>
        encodeCommand(
          {
            type: 'save',
            nonce:
              'x'.repeat(
                32,
              ),
          },
        ),
    ).toThrow();
  });
});

describe('GuestLineParser', () => {
  it('buffers partial lines, strips CR and ignores kernel noise', () => {
    const p =
      new GuestLineParser();
    expect(
      p.push(
        '[ 0.1] kernel noise\nRMHOS REA',
      ),
    ).toEqual(
      [],
    );
    expect(
      p.push(
        'DY\r\nRMHOS SAVED n1 2048\n',
      ),
    ).toEqual(
      [
        {
          type: 'ready',
        },
        {
          type: 'saved',
          nonce:
            'n1',
          bytes: 2048,
        },
      ],
    );
  });

  it('reports errors and malformed lines', () => {
    const p =
      new GuestLineParser();
    expect(
      p.push(
        'RMHOS ERR quota\nRMHOS SAVED n1 notanumber\n',
      ),
    ).toEqual(
      [
        {
          type: 'error',
          code: 'quota',
        },
        {
          type: 'error',
          code: 'protocol',
        },
      ],
    );
  });

  it('parses the remaining events', () => {
    const p =
      new GuestLineParser();
    expect(
      p.push(
        'RMHOS SESSION_OK\nRMHOS RESTORED\nRMHOS POWEROFF\n',
      ),
    ).toEqual(
      [
        {
          type: 'session-ok',
        },
        {
          type: 'restored',
        },
        {
          type: 'poweroff',
        },
      ],
    );
  });

  it('flags an unknown RMHOS verb as a protocol error', () => {
    expect(
      new GuestLineParser().push(
        'RMHOS WAT\n',
      ),
    ).toEqual(
      [
        {
          type: 'error',
          code: 'protocol',
        },
      ],
    );
  });
});

describe('GuestLineParser hardening', () => {
  it('drops an oversized unterminated noise line silently', () => {
    const p =
      new GuestLineParser();
    expect(
      p.push(
        'x'.repeat(
          5000,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      p.push(
        'RMHOS READY\n',
      ),
    ).toEqual(
      [
        {
          type: 'ready',
        },
      ],
    );
  });

  it('reports one protocol error for an oversized RMHOS line', () => {
    const p =
      new GuestLineParser();
    expect(
      p.push(
        'RMHOS ' +
          'x'.repeat(
            5000,
          ),
      ),
    ).toEqual(
      [
        {
          type: 'error',
          code: 'protocol',
        },
      ],
    );
    expect(
      p.push(
        'RMHOS READY\n',
      ),
    ).toEqual(
      [
        {
          type: 'ready',
        },
      ],
    );
  });

  it.each(
    [
      'RMHOS ERR bad code!',
      'RMHOS SAVED n1 99999999999999999999',
      'RMHOS SAVED n1 -5',
      'RMHOS SAVED bad! 5',
    ],
  )(
    'rejects %s',
    (
      line,
    ) =>
      expect(
        new GuestLineParser().push(
          `${line}\n`,
        ),
      ).toEqual(
        [
          {
            type: 'error',
            code: 'protocol',
          },
        ],
      ),
  );
});

it('exposes the archive path inside the share', () => {
  expect(
    SHARE_ARCHIVE_PATH,
  ).toBe(
    '/sync/home.tar',
  );
});
