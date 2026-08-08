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
 * render. See `lib/shared/realtime/protocol.ts` for the client half and for why
 * the declaration below is duplicated rather than imported (short version: the
 * `server-builder` stage used to copy a curated subset of `lib/` that excluded
 * this module — `server/CLAUDE.md` gotchas 7 and 8 explain what importing an
 * uncopied `lib/` module does to a bundle). That stage now copies `lib/`
 * wholesale, so the duplication is no longer forced and can be collapsed; see
 * the note in `lib/__tests__/protocol-version.test.ts`.
 *
 * `lib/__tests__/protocol-version.test.ts` fails the build if the two copies
 * drift, which is the property that matters: a silent divergence would reject
 * every client on the planet.
 *
 * ## Rollout posture: lenient by default
 *
 * A client that sends NO version is allowed through. That is not timidity, it
 * is correctness — most of this hub's clients are bare `io()` calls
 * (`lib/holdem/socket.ts`, `lib/altair/multiplayer/socket.ts`, and a dozen
 * more) that have never sent a handshake field in their lives, and every tab
 * open at the moment this first deploys is one of them. Rejecting "absent"
 * would take every game on the site down at the instant the guard shipped, to
 * fix a bug that only bites across a shape change.
 *
 * So: absent ⇒ allowed, different ⇒ rejected. Set SOCKET_PROTOCOL_STRICT=1 to
 * also reject absent, once `createRealtimeClient` is the only way in.
 */

/**
 * The events whose payload shape both halves must agree on.
 *
 * MIRROR OF `lib/shared/realtime/protocol.ts` — keep the two identical and
 * SORTED. Cross-app contract events only; per-game names are namespaced by
 * prefix and isolated by room, so adding a game cannot break a tab playing a
 * different one, and folding them in would churn the version on every additive
 * change until nobody read the reload prompt.
 */
export const PROTOCOL_EVENTS: readonly string[] = [
  'call:accept',
  'call:accepted',
  'call:cancel',
  'call:decline',
  'call:ended',
  'call:hangup',
  'call:ice',
  'call:incoming',
  'call:invite',
  'call:mute',
  'call:rejected',
  'call:ringing',
  'call:signal',
  'party:accept',
  'party:create',
  'party:disbanded',
  'party:error',
  'party:invite',
  'party:invited',
  'party:kick',
  'party:leave',
  'party:queue',
  'party:state',
  'party:ticket',
  'party:transfer',
  'protocol:outdated',
  'space:chat',
  'space:end',
  'space:ended',
  'space:error',
  'space:join',
  'space:leave',
  'space:message',
  'space:pin',
  'space:pinned',
  'space:react',
  'space:reaction',
  'space:state',
];

/**
 * Bump when a PAYLOAD shape changes without an event name changing.
 *
 * MIRROR OF `lib/shared/realtime/protocol.ts`. The name hash catches added,
 * removed and renamed events for free; it cannot see `{ userId }` becoming
 * `{ user: { id } }`, which is the mismatch that actually produces the silent
 * mid-match no-op.
 */
export const PROTOCOL_REVISION = 1;

/**
 * A stable, dependency-free hash of the declared contract.
 *
 * MIRROR OF `lib/shared/realtime/protocol.ts` — must stay byte-identical, or
 * the two halves compute different versions from the same contract and every
 * client is rejected. FNV-1a twice with different offset bases (64 bits, 16 hex
 * chars) rather than `node:crypto`, because the browser half has to compute the
 * same value without shipping a crypto polyfill. This is a change detector, not
 * a security boundary — a forged version only buys a client a connection it
 * will then fail against, i.e. the pre-E2 behaviour.
 */
export function hashEvents(events: readonly string[], revision: number): string {
  const input = `v${revision}\n${events.join('\n')}`;
  return fnv1a(input, 0x811c9dc5) + fnv1a(input, 0x01000193);
}

/** One 32-bit FNV-1a pass, returned as 8 lowercase hex chars. */
function fnv1a(input: string, offsetBasis: number): string {
  let hash = offsetBasis >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // The FNV prime (16777619) via shifts — `hash * 16777619` overflows the
    // float53 mantissa and silently loses the low bits.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The version this hub speaks. */
export const PROTOCOL_VERSION = hashEvents(PROTOCOL_EVENTS, PROTOCOL_REVISION);

/** The handshake `auth` key the version travels under. */
export const PROTOCOL_AUTH_KEY = 'protocol';

/** The event emitted before an out-of-date client is refused. */
export const PROTOCOL_OUTDATED_EVENT = 'protocol:outdated';

/** The `connect_error` message that accompanies it. */
export const PROTOCOL_OUTDATED_REASON = 'protocol-outdated';

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
