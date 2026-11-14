// Line protocol between the host and the in-guest agent over a serial port.
// Host -> guest: SESSION <user> | RESTORE | SAVE <nonce> | SHUTDOWN
// Guest -> host: lines prefixed "RMHOS "; anything else is kernel noise.

export type HostCommand =
  | {
      type: 'session';
      user: string;
    }
  | {
      type: 'restore';
    }
  | {
      type: 'save';
      nonce: string;
    }
  | {
      type: 'shutdown';
    };

export type GuestEvent =
  | {
      type: 'ready';
    }
  | {
      type: 'session-ok';
    }
  | {
      type: 'restored';
    }
  | {
      type: 'saved';
      nonce: string;
      bytes: number;
    }
  | {
      type: 'poweroff';
    }
  | {
      type: 'error';
      code: string;
    };

/** Path of the home archive inside the 9p share. */
export const SHARE_ARCHIVE_PATH =
  '/sync/home.tar';

const TOKEN =
  /^[a-z0-9_-]{1,31}$/i;

function token(
  value: string,
  what: string,
): string {
  if (
    !TOKEN.test(
      value,
    )
  )
    throw new Error(
      `invalid ${what}`,
    );
  return value;
}

export function encodeCommand(
  c: HostCommand,
): string {
  switch (
    c.type
  ) {
    case 'session':
      return `SESSION ${token(c.user, 'user')}\n`;
    case 'restore':
      return 'RESTORE\n';
    case 'save':
      return `SAVE ${token(c.nonce, 'nonce')}\n`;
    case 'shutdown':
      return 'SHUTDOWN\n';
  }
}

const PREFIX =
  'RMHOS ';
const PROTOCOL_ERROR: GuestEvent =
  {
    type: 'error',
    code: 'protocol',
  };

function parseLine(
  line: string,
): GuestEvent | null {
  if (
    !line.startsWith(
      PREFIX,
    )
  )
    return null;
  const [
    verb,
    a,
    b,
    ...rest
  ] =
    line
      .slice(
        PREFIX.length,
      )
      .split(
        ' ',
      );
  switch (
    verb
  ) {
    case 'READY':
      return {
        type: 'ready',
      };
    case 'SESSION_OK':
      return {
        type: 'session-ok',
      };
    case 'RESTORED':
      return {
        type: 'restored',
      };
    case 'POWEROFF':
      return {
        type: 'poweroff',
      };
    case 'ERR':
      return a !==
        undefined &&
        b ===
          undefined &&
        TOKEN.test(
          a,
        )
        ? {
            type: 'error',
            code: a,
          }
        : {
            ...PROTOCOL_ERROR,
          };
    case 'SAVED': {
      if (
        a ===
          undefined ||
        b ===
          undefined ||
        rest.length >
          0 ||
        !TOKEN.test(
          a,
        ) ||
        !/^\d+$/.test(
          b,
        )
      )
        return {
          ...PROTOCOL_ERROR,
        };
      const bytes =
        Number(
          b,
        );
      if (
        !Number.isSafeInteger(
          bytes,
        ) ||
        bytes <
          0
      )
        return {
          ...PROTOCOL_ERROR,
        };
      return {
        type: 'saved',
        nonce:
          a,
        bytes,
      };
    }
    default:
      return {
        ...PROTOCOL_ERROR,
      };
  }
}

/** Longest unterminated line kept; the guest never legitimately sends more. */
const MAX_BUFFER = 4096;

/** Incremental parser: feed it raw serial chunks, get complete events back. */
export class GuestLineParser {
  private buffer =
    '';

  push(
    chunk: string,
  ): GuestEvent[] {
    this.buffer +=
      chunk;
    const lines =
      this.buffer.split(
        '\n',
      );
    this.buffer =
      lines.pop() ??
      '';
    const events: GuestEvent[] =
      [];
    for (const raw of lines) {
      const event =
        parseLine(
          raw.replace(
            /\r$/,
            '',
          ),
        );
      if (
        event
      )
        events.push(
          event,
        );
    }
    if (
      this
        .buffer
        .length >
      MAX_BUFFER
    ) {
      if (
        this.buffer.startsWith(
          PREFIX,
        )
      )
        events.push(
          {
            ...PROTOCOL_ERROR,
          },
        );
      this.buffer =
        '';
    }
    return events;
  }
}
