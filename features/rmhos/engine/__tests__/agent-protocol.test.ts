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

describe('encodeCommand', () => {
  it('encodes each command as one newline-terminated line', () => {
    expect(
      encodeCommand(
        {
          type: 'session',
          user: 'alice',
        },
      ),
    ).toBe(
      'SESSION alice\n',
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

  it('rejects values that could inject a second command', () => {
    expect(
      () =>
        encodeCommand(
          {
            type: 'session',
            user: 'a b\nSHUTDOWN',
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

it('exposes the archive path inside the share', () => {
  expect(
    SHARE_ARCHIVE_PATH,
  ).toBe(
    '/sync/home.tar',
  );
});
