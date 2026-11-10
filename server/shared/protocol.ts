/**
 * Realtime protocol version — the SERVER half (E2).
 *
 * A hub and its clients ship together; a browser tab open across a deploy does
 * not. Before this, an old tab meeting a new server produced a silent no-op
 * mid-match — no error, no reconnect, just a game that stopped answering.
 *
 * Both halves declare the same event contract, hash it to a short version, and
 * exchange it in the socket.io handshake. `protocolGuard` refuses a mismatched
 * client, but emits `protocol:outdated` FIRST so the client has something to
 * render. The contract itself (the event list, the revision, the hash and the
 * wire constants) is declared once, in `lib/shared/realtime/protocol.ts`, and
 * imported here, so the two halves cannot drift. The import is relative
 * (`server/CLAUDE.md` gotcha 7); the `server-builder` stage copies `lib/`
 * wholesale, so it is in every hub's build context.
 *
 * ## Rollout posture: lenient by default
 *
 * A client that sends NO version is allowed through. That is not timidity, it
 * is correctness — most of this hub's clients are bare `io()` calls
 * (`features/casino/engine/holdem/socket.ts`, `features/altair/engine/multiplayer/socket.ts`, and a dozen
 * more) that have never sent a handshake field in their lives, and every tab
 * open at the moment this first deploys is one of them. Rejecting "absent"
 * would take every game on the site down at the instant the guard shipped, to
 * fix a bug that only bites across a shape change.
 *
 * So: absent ⇒ allowed, different ⇒ rejected. Set SOCKET_PROTOCOL_STRICT=1 to
 * also reject absent, once `createRealtimeClient` is the only way in.
 */

import {
  PROTOCOL_AUTH_KEY,
  PROTOCOL_OUTDATED_EVENT,
  PROTOCOL_OUTDATED_REASON,
  PROTOCOL_VERSION,
} from '../../lib/shared/realtime/protocol';

/** What the guard decided about one handshake. */
export type ProtocolVerdict = 'match' | 'absent' | 'mismatch';

/** Classify a handshake's declared protocol version. */
export function checkProtocol(declared: unknown, expected = PROTOCOL_VERSION): ProtocolVerdict {
  if (typeof declared !== 'string' || declared === '') return 'absent';
  return declared === expected ? 'match' : 'mismatch';
}

/** True when a versionless client should also be refused. */
export function protocolStrict(): boolean {
  const raw = process.env.SOCKET_PROTOCOL_STRICT;
  return raw === '1' || raw === 'true';
}

/** The minimum of socket.io's Socket this guard needs. */
interface GuardSocket {
  handshake: { auth?: Record<string, unknown> };
  emit(event: string, payload: unknown): unknown;
}

/**
 * A middleware error carrying a payload.
 *
 * socket.io serialises `err.data` into the client's `connect_error` — the
 * documented way to say WHY a handshake was refused. The guard sends the
 * verdict twice, by `emit` and by `err.data`, because the two paths fail
 * differently: an emit issued from middleware races the connection teardown,
 * and `err.data` is only readable once the client has a `connect_error`
 * handler. Between them the client always learns it is outdated rather than
 * mistaking it for the auth failure it otherwise looks exactly like.
 */
export interface ProtocolError extends Error {
  data?: { expected: string; received: string };
}

interface GuardLogger {
  warn(entry: { event: string; [key: string]: unknown }): void;
}

/**
 * socket.io middleware that refuses a client speaking a different protocol.
 *
 * ORDER MATTERS: `emit` before `next(err)`. socket.io tears the connection down
 * as soon as the middleware errors, so an emit afterwards goes nowhere and the
 * client sees only a generic `connect_error` — which is indistinguishable from
 * the auth failures `lib/shared/realtime/client.ts` already handles, and would
 * be reported to the player as "sign in again".
 *
 * Install it BEFORE the auth middleware: an outdated client should be told it
 * is outdated regardless of whether its session is still valid, and this check
 * costs no database round-trip.
 */
export function protocolGuard(logger?: GuardLogger, expected = PROTOCOL_VERSION) {
  const strict = protocolStrict();

  return function protocolMiddleware(
    socket: GuardSocket,
    next: (err?: Error) => void,
  ): void {
    const declared = socket.handshake.auth?.[PROTOCOL_AUTH_KEY];
    const verdict = checkProtocol(declared, expected);

    if (verdict === 'match') return next();
    if (verdict === 'absent' && !strict) {
      // A legacy `io()` client. Allowed, but counted — when this line stops
      // appearing, SOCKET_PROTOCOL_STRICT=1 becomes safe to turn on.
      logger?.warn({ event: 'protocol_absent', expected });
      return next();
    }

    const received = typeof declared === 'string' ? declared : '';
    logger?.warn({ event: 'protocol_outdated', expected, received: received || null, strict });

    // ORDER: emit, then error. Reversed, socket.io has already torn the
    // connection down and the payload goes nowhere.
    socket.emit(PROTOCOL_OUTDATED_EVENT, { expected, received });

    const error: ProtocolError = new Error(PROTOCOL_OUTDATED_REASON);
    error.data = { expected, received };
    next(error);
  };
}
