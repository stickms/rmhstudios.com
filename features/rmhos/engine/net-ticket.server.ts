import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { RMHOS } from './constants';

const CONTEXT =
  'rmhos-net-ticket-v1';

export type NetTicketResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'expired'
        | 'bad_signature';
    };

function assertSecret(
  secret: string,
): void {
  if (
    secret ===
    ''
  )
    throw new Error(
      'rmhos net ticket secret is empty',
    );
}

function mac(
  secret: string,
  userId: string,
  expiry: string,
): Buffer {
  const key =
    createHmac(
      'sha256',
      secret,
    )
      .update(
        CONTEXT,
      )
      .digest();
  return createHmac(
    'sha256',
    key,
  )
    .update(
      `${userId}.${expiry}`,
    )
    .digest();
}

/** Short-lived ticket that lets one user open the relay socket. */
export function signNetTicket(
  userId: string,
  secret: string,
  now: number = Date.now(),
): string {
  assertSecret(
    secret,
  );
  const expiry =
    String(
      now +
        RMHOS.ticketTtlMs,
    );
  return [
    Buffer.from(
      userId,
    ).toString(
      'base64url',
    ),
    expiry,
    mac(
      secret,
      userId,
      expiry,
    ).toString(
      'base64url',
    ),
  ].join(
    '.',
  );
}

export function verifyNetTicket(
  ticket: string,
  secret: string,
  now: number = Date.now(),
): NetTicketResult {
  assertSecret(
    secret,
  );
  const parts =
    ticket.split(
      '.',
    );
  if (
    parts.length !==
    3
  )
    return {
      ok: false,
      reason:
        'malformed',
    };
  const [
    idPart,
    expiry,
    sigPart,
  ] =
    parts as [
      string,
      string,
      string,
    ];
  if (
    !idPart ||
    !/^\d{1,16}$/.test(
      expiry,
    ) ||
    !sigPart
  )
    return {
      ok: false,
      reason:
        'malformed',
    };
  const userId =
    Buffer.from(
      idPart,
      'base64url',
    ).toString();
  if (
    !userId
  )
    return {
      ok: false,
      reason:
        'malformed',
    };
  const given =
    Buffer.from(
      sigPart,
      'base64url',
    );
  const expected =
    mac(
      secret,
      userId,
      expiry,
    );
  if (
    given.length !==
      expected.length ||
    !timingSafeEqual(
      given,
      expected,
    )
  ) {
    return {
      ok: false,
      reason:
        'bad_signature',
    };
  }
  if (
    now >
    Number(
      expiry,
    )
  )
    return {
      ok: false,
      reason:
        'expired',
    };
  return {
    ok: true,
    userId,
  };
}
