/**
 * The socket event contract — one declaration, both sides' types, one validator.
 *
 * The platform has 20 `lib/<app>/events.ts` modules holding event *names* and
 * 11 `lib/<app>/socket.ts` clients consuming them. Sharing the names was the
 * first half of the job and it worked: nobody inlines an event string. The
 * second half never happened — the **payload** attached to a name is agreed by
 * discipline alone. Rename a field on the server, forget the client, and
 * nothing fails: not the typecheck (the payload is `unknown` on the wire), not
 * the tests, not the build. It fails for a player, mid-match, as a value that
 * is quietly `undefined`.
 *
 * So declare the payload where the name is already declared:
 *
 * ```ts
 * export const EVENTS = defineEvents({
 *   'ls:join':   { c2s: z.object({ code: z.string() }) },
 *   'ls:lobby':  { s2c: LobbySnapshotZ },
 *   'ls:finish': { c2s: ScoreReportZ, ack: z.object({ accepted: z.boolean() }) },
 * });
 *
 * export type C2S = ClientToServer<typeof EVENTS>;  // typed emit()
 * export type S2C = ServerToClient<typeof EVENTS>;  // typed on()
 * ```
 *
 * Three things follow from one declaration:
 *
 * 1. **The client is typed.** `Socket<S2C, C2S>` from `socket.io-client` makes
 *    `emit('ls:join', { cod: … })` a compile error rather than a support ticket.
 * 2. **The server validates.** `server/shared/typed-socket.ts` `bind()`s the
 *    same map and `safeParse`s every inbound payload, so a modified client
 *    gets a `protocol:error`, not a handler crash.
 * 3. **The protocol is versionable.** {@link eventSignatures} is a stable,
 *    order-independent description of the surface — hash it and a client whose
 *    hash predates a breaking change can be refused at the handshake (E2).
 *
 * Deliberately dependency-free apart from zod's *types*, because both the
 * browser bundle and the esbuild server bundle pull this file in verbatim.
 */

import type { z, ZodType } from 'zod';

/**
 * One event's payload shapes. Every field is optional because most events
 * travel one way: a command has only `c2s`, a broadcast only `s2c`.
 *
 * - `c2s` — what the client may send. Validated on the server.
 * - `s2c` — what the server sends. Types the client's listener.
 * - `ack`  — the value passed to socket.io's acknowledgement callback.
 */
export interface EventSpec {
  c2s?: ZodType;
  s2c?: ZodType;
  ack?: ZodType;
}

export type EventMap = Record<string, EventSpec>;

/**
 * Declare an event map.
 *
 * At runtime this is the identity function; its whole job is the `const` type
 * parameter, which pins the literal keys and the exact zod types so the
 * helpers below can derive real signatures instead of `Record<string, unknown>`.
 */
export function defineEvents<const E extends EventMap>(events: E): E {
  return events;
}

/* ─── Deriving both directions ───────────────────────────────────────────── */

/** The parsed (post-`safeParse`) type of a schema slot, or `never` if absent. */
export type Payload<S> = S extends ZodType ? z.infer<S> : never;

/**
 * The names whose spec actually declares direction `D`.
 *
 * Written as `E[K][D] extends ZodType` rather than `extends undefined`: with a
 * `const` type parameter an absent `c2s` is a *missing property*, and indexing
 * a missing property falls back to the `EventSpec` constraint (`ZodType |
 * undefined`) instead of resolving to `undefined`. Testing for presence works
 * either way; testing for absence silently matches everything.
 */
type KeysWith<E extends EventMap, D extends keyof EventSpec> = {
  [K in keyof E]: E[K][D] extends ZodType ? K : never;
}[keyof E] &
  string;

/** Event names carrying a client→server payload — the server's inbound surface. */
export type C2SKeys<E extends EventMap> = KeysWith<E, 'c2s'>;
/** Event names carrying a server→client payload. */
export type S2CKeys<E extends EventMap> = KeysWith<E, 's2c'>;

/**
 * The client→server half: what the client may `emit` and the server listens for.
 *
 * Shaped to satisfy socket.io's `Socket<ListenEvents, EmitEvents>` generics, so
 * it can be handed straight to `Socket<ServerToClient<E>, ClientToServer<E>>`
 * on the client and the mirror image on the server.
 */
export type ClientToServer<E extends EventMap> = {
  [K in KeysWith<E, 'c2s'>]: E[K]['ack'] extends ZodType
    ? (payload: Payload<E[K]['c2s']>, ack: (result: Payload<E[K]['ack']>) => void) => void
    : (payload: Payload<E[K]['c2s']>) => void;
};

/** The server→client half: what the server emits and the client listens for. */
export type ServerToClient<E extends EventMap> = {
  [K in KeysWith<E, 's2c'>]: (payload: Payload<E[K]['s2c']>) => void;
};

/** The payload type of a single event, for annotating a handler in isolation. */
export type C2SPayload<E extends EventMap, K extends KeysWith<E, 'c2s'>> = Payload<E[K]['c2s']>;
export type S2CPayload<E extends EventMap, K extends KeysWith<E, 's2c'>> = Payload<E[K]['s2c']>;
export type AckPayload<E extends EventMap, K extends keyof E> = Payload<E[K]['ack']>;

/* ─── Reflection, for the handshake and for tests ────────────────────────── */

/** Every event name in the map, sorted — declaration order must not matter. */
export function eventNames<E extends EventMap>(events: E): string[] {
  return Object.keys(events).sort();
}

/** Names that carry a client→server payload, i.e. the server's inbound surface. */
export function inboundNames<E extends EventMap>(events: E): string[] {
  return Object.keys(events)
    .filter((name) => events[name].c2s !== undefined)
    .sort();
}

/**
 * A stable, order-independent description of the event surface.
 *
 * This is the input `server/shared/protocol.ts` hashes into `PROTOCOL_VERSION`.
 * It records each name plus which directions it carries, so adding an event,
 * removing one, or turning a one-way broadcast into a request/ack all move the
 * hash. It deliberately does NOT reach into the zod schemas: a schema's
 * internals have no stable serialization across zod versions, so hashing them
 * would churn the protocol version on a dependency bump.
 */
export function eventSignatures<E extends EventMap>(events: E): string[] {
  return Object.keys(events)
    .sort()
    .map((name) => {
      const spec = events[name];
      const directions = [
        spec.c2s ? 'c2s' : null,
        spec.s2c ? 's2c' : null,
        spec.ack ? 'ack' : null,
      ].filter(Boolean);
      return `${name}:${directions.join('+')}`;
    });
}

/**
 * The event name every contract reserves for "your payload did not parse".
 *
 * A single well-known name rather than a per-app error event, because the
 * client that needs to hear it is by definition one that disagrees with us
 * about the app's own event names.
 */
export const PROTOCOL_ERROR_EVENT = 'protocol:error';

/** Payload of {@link PROTOCOL_ERROR_EVENT}. Kept small — it crosses a trust boundary. */
export interface ProtocolErrorPayload {
  /** The event whose payload failed to parse. */
  event: string;
  /** Machine-readable cause. `invalid_payload` today; room for the E2 version check. */
  reason: 'invalid_payload' | 'unknown_event' | 'version_mismatch';
}
