/**
 * Matchmaking (P2) — socket event names, shared by both sides.
 *
 * Same contract as `lib/party/events.ts`: the strings live here so the client
 * hook and `server/socket-server/handlers/matchmaking.ts` import the same
 * constants and can never drift. Per `server/CLAUDE.md`, every name also needs
 * an entry in the socket server's `SOCKET_RATE_LIMITS`, which doubles as the
 * inbound-event allowlist — an event without one is silently dropped.
 *
 * The prefix is `queue:` and not the obvious `mm:`, because **Massive March
 * already owns `mm:`** — including an `mm:join` of its own. The hub isolates
 * games by event-name prefix and socket.io rooms, with no namespaces, so two
 * features sharing a prefix would each receive the other's traffic on the one
 * default namespace.
 */

export const MM_C2S = {
  /** Join the queue for a game. A party leader queues for the whole party. */
  JOIN: 'queue:join',
  /** Leave it. Idempotent. */
  LEAVE: 'queue:leave',
  /** Ask for the current wait estimate without joining. */
  PEEK: 'queue:peek',
} as const;

export const MM_S2C = {
  /** Position, estimate and current search band, pushed as they change. */
  STATE: 'queue:state',
  /** A match was made: the same ticket shape the party system hands out. */
  MATCHED: 'queue:matched',
  /** Recoverable error surfaced to the acting socket. */
  ERROR: 'queue:error',
  /** Queue stats for a game, in answer to PEEK. */
  STATS: 'queue:stats',
} as const;
