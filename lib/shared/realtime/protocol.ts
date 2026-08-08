/**
 * Realtime protocol version — the CLIENT half (E2).
 *
 * ## The problem
 *
 * The hubs and their clients are deployed together; a browser tab open across a
 * deploy is not. An old tab meets a new server and fails in whatever way the
 * payload mismatch produces — which, in practice, is a silent no-op mid-match.
 * Nobody sees an error; the game just stops responding.
 *
 * ## The fix
 *
 * Both halves declare the same event contract, hash it to a short version, and
 * exchange it in the socket.io handshake. A mismatch is answered with an
 * explicit `protocol:outdated` before the connection is refused, so the client
 * can SAY what happened instead of retrying into a wall.
 *
 * The client deliberately does **not** reload on its own — see
 * `lib/shared/realtime/client.ts`. Reloading a player mid-round is a worse
 * outcome than the mismatch it fixes.
 *
 * ## Why this file is duplicated in `server/shared/protocol.ts`
 *
 * It should not be. The two halves are byte-identical declarations because the
 * Dockerfile's `server-builder` stage USED to copy a curated per-module subset
 * of `lib/`, and this file was not in it — a `server/` bundle importing an
 * uncopied `lib/` module either fails the image build or, worse, ships a bundle
 * that throws MODULE_NOT_FOUND on boot (server/CLAUDE.md gotchas 7 and 8).
 *
 * **That constraint is gone.** The stage now copies `lib/` wholesale, so this
 * file is in the build context and `server/shared/protocol.ts` can simply
 * re-export from here:
 *
 * ```ts
 * export { PROTOCOL_EVENTS, PROTOCOL_VERSION } from '../../lib/shared/realtime/protocol';
 * ```
 *
 * (a RELATIVE specifier, not `@/…` — gotcha 7). Doing that deletes the
 * duplicate declaration and `lib/__tests__/protocol-version.test.ts` along with
 * it. Until someone does, that test fails the build if the two copies drift,
 * which is the property that actually matters: a silent divergence would reject
 * every client on the planet.
 */

/**
 * The events whose payload shape both halves must agree on.
 *
 * Cross-app contract events only — the ones a client and a hub both construct
 * and destructure. Per-game event names are deliberately absent: they are
 * namespaced by prefix and isolated by room, so adding a game cannot break a
 * tab playing a different one, and folding them in here would churn the version
 * on every additive change and train everyone to ignore the reload prompt.
 *
 * **Sorted, and must stay sorted** — the hash is order-sensitive and the test
 * asserts the ordering, so two people adding an event in the same release can't
 * produce two different versions from the same set.
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
 * Bump this when a PAYLOAD shape changes without an event name changing.
 *
 * The event-name hash catches added, removed and renamed events for free. It
 * cannot see `{ userId }` becoming `{ user: { id } }` on an existing event —
 * which is the mismatch that actually produces the silent mid-match no-op. That
 * is what this integer is for. It is the only part of the version a human has
 * to remember, so it is one number in one place with this comment attached.
 */
export const PROTOCOL_REVISION = 1;

/**
 * A stable, dependency-free hash of the declared contract.
 *
 * Two FNV-1a passes over the same input with different offset bases, giving 64
 * bits in 16 hex chars. FNV rather than SHA-256 because this must produce the
 * SAME value in a browser and in Node without shipping a crypto polyfill to the
 * browser or importing `node:crypto` into a file the client bundles — and
 * because this is a change detector, not a security boundary. Nothing trusts
 * the value; a forged one only lets a client connect to a hub it will then fail
 * against, which is precisely the pre-E2 behaviour.
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
    // float53 mantissa and silently loses the low bits, which would make the
    // hash platform-dependent.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The version both halves exchange in the socket.io handshake. */
export const PROTOCOL_VERSION = hashEvents(PROTOCOL_EVENTS, PROTOCOL_REVISION);

/** The handshake `auth` key the version travels under. */
export const PROTOCOL_AUTH_KEY = 'protocol';

/** The event a hub emits before refusing an out-of-date client. */
export const PROTOCOL_OUTDATED_EVENT = 'protocol:outdated';

/** The `connect_error` message that accompanies it. */
export const PROTOCOL_OUTDATED_REASON = 'protocol-outdated';

/** Payload of `protocol:outdated`. */
export interface ProtocolOutdated {
  /** The version the server speaks. Present so a log line can say both sides. */
  expected: string;
  /** What the client sent, echoed back. */
  received: string;
}
