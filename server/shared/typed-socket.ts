/**
 * Bind a hub's handlers to a typed event contract, validating on the way in.
 *
 * This is the socket tier's answer to `lib/api/handler.server`'s
 * `defineHandler`: one place that writes down the order every inbound event
 * must be processed in — **rate limit → `safeParse` → handler → try/catch** —
 * so no handler has to remember it and none of them can get it subtly wrong.
 *
 * `server/rmhbox/schemas.ts` and `server/rmhtube/schemas.ts` already had a
 * `validated()` wrapper doing exactly this, per hub, against schemas the client
 * never sees. `bind()` is the same idea with the two gaps closed: the schema
 * comes from the *shared* contract in `lib/<app>/events.ts`, so client and
 * server cannot disagree about a payload; and the games hub — 18 games that
 * hand-rolled their own `sanitizeX()` coercions, or skipped them — can use it
 * too.
 *
 * ## What a malformed payload does
 *
 * `protocol:error` then **disconnect**, by default. That is a deliberate,
 * slightly severe choice and it needs a matching discipline in the schemas: a
 * contract must encode the tolerance the handler *already had*. If today's
 * handler clamps a wild number rather than rejecting it, the schema must
 * clamp too (`z.coerce` / `.catch()` / `.default()`), or the first deploy
 * kicks every honest client running last week's bundle. The disconnect is for
 * input no honest client could produce — a missing required field, a string
 * where an object belongs — which is to say a modified client, which is to say
 * exactly the traffic worth hanging up on.
 *
 * A handler that throws is never a disconnect: that is our bug, not theirs. It
 * is logged and swallowed, because one game's exception must not take down a
 * hub hosting seventeen others.
 */

import type { Socket } from 'socket.io';
import {
  PROTOCOL_ERROR_EVENT,
  type C2SKeys,
  type EventMap,
  type Payload,
  type ProtocolErrorPayload,
} from '../../lib/shared/realtime/contract';
import type { Logger } from './logger';

/* ─── Handler shapes ─────────────────────────────────────────────────────── */

type Parsed<E extends EventMap, K extends keyof E> = Payload<E[K]['c2s']>;

type Ack<E extends EventMap, K extends keyof E> = Payload<E[K]['ack']>;

/**
 * A handler for one event. Receives the *parsed* payload — by this point the
 * `unknown` from the wire has been through the contract's schema — and the
 * socket it arrived on.
 */
export type EventHandler<E extends EventMap, K extends keyof E> = (
  payload: Parsed<E, K>,
  socket: Socket,
) => Ack<E, K> | void | Promise<Ack<E, K> | void>;

/**
 * The handler table: exactly the contract's inbound events, no more and no less.
 *
 * Because it is derived rather than declared, adding a `c2s` event to the
 * contract is a compile error here until someone handles it, and deleting one
 * is a compile error until the dead handler goes. That is the property the
 * name-map convention could never have.
 */
export type Handlers<E extends EventMap> = {
  [K in C2SKeys<E>]: EventHandler<E, K>;
};

export interface BindOptions {
  /** For log lines — which app's contract this is. */
  app: string;
  logger: Logger;
  /**
   * The hub's rate limiter, e.g. `checkRateLimit` from `server/<hub>/rate-limit`.
   * Returning false drops the event before it is parsed. Omit to skip — but a
   * hub that omits it has no per-socket budget, which per `server/CLAUDE.md`
   * §Gotchas 5 also means the event is missing from the hub's allowlist.
   */
  rateLimit?: (socketId: string, eventName: string) => boolean;
  /** Told when an event is dropped for exceeding its budget, so the app can say so. */
  onRateLimited?: (socket: Socket, eventName: string) => void;
  /**
   * What to do about a payload that does not parse. `disconnect` (the default)
   * emits `protocol:error` and hangs up; `warn` emits it and drops just that
   * event, for a contract still being tightened against live clients.
   */
  onInvalid?: 'disconnect' | 'warn';
}

/* ─── The binder ─────────────────────────────────────────────────────────── */

/**
 * Register every inbound event in `events` on `socket`.
 *
 * Only events with a `c2s` schema are bound; `s2c`-only entries describe what
 * the server emits and have nothing to listen for.
 */
export function bindEvents<E extends EventMap>(
  socket: Socket,
  events: E,
  handlers: Handlers<E>,
  options: BindOptions,
): void {
  const { app, logger, rateLimit, onRateLimited, onInvalid = 'disconnect' } = options;

  for (const name of Object.keys(events)) {
    const schema = events[name].c2s;
    if (!schema) continue;

    const handler = (handlers as Record<string, EventHandler<E, keyof E> | undefined>)[name];
    if (!handler) {
      // A contract entry with no handler is a hole in the server, not in the
      // client — surface it at boot rather than as a silently ignored event.
      logger.warn({ event: 'contract_handler_missing', app, eventName: name });
      continue;
    }

    socket.on(name, async (raw: unknown, ack?: (result: unknown) => void) => {
      if (rateLimit && !rateLimit(socket.id, name)) {
        logger.warn({
          event: 'rate_limited',
          app,
          eventName: name,
          socketId: socket.id,
          userId: socket.data?.userId,
        });
        onRateLimited?.(socket, name);
        return;
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        // Log the issue paths, never the payload: it is attacker-controlled and
        // may be large, and the shape is what tells us which field drifted.
        logger.warn({
          event: 'protocol_invalid_payload',
          app,
          eventName: name,
          socketId: socket.id,
          userId: socket.data?.userId,
          issues: parsed.error.issues.slice(0, 8).map((i) => ({
            path: i.path.join('.'),
            code: i.code,
          })),
          action: onInvalid,
        });
        const payload: ProtocolErrorPayload = { event: name, reason: 'invalid_payload' };
        socket.emit(PROTOCOL_ERROR_EVENT, payload);
        if (onInvalid === 'disconnect') socket.disconnect(true);
        return;
      }

      try {
        const result = await handler(parsed.data as Parsed<E, keyof E>, socket);
        // socket.io only supplies `ack` when the client passed a callback, so
        // an unacked emit of an acked event is normal, not an error.
        if (ack && result !== undefined) ack(result);
      } catch (error) {
        // Our bug, not theirs: never disconnect, never rethrow. An unhandled
        // rejection here would take down a process hosting every other game.
        logger.error({
          event: 'handler_uncaught_error',
          app,
          eventName: name,
          socketId: socket.id,
          userId: socket.data?.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}
