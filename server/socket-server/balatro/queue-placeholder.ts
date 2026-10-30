/**
 * Balatro multiplayer — a stand-in for the matchmaking / party / invite /
 * spectate-list events until WS12's handlers/balatro-queue.ts lands (PLAN §4
 * WS1 registers both handlers; WS12 owns these events).
 *
 * Every event is still account-gated and rate limited (bound through
 * `bindEvents` on the frozen contract), so the auth walk and the rate-limit
 * coverage hold from day one:
 *
 *   - `balatro:spectate:list` already answers from the directory
 *     (`listSpectatableLobbies`: spectatable rooms whose host is connected);
 *   - `balatro:queue:join`, `balatro:queue:leave`, `balatro:party:queue` and
 *     `balatro:invite` answer `balatro:p2p:error { code: 'invalid' }` — not
 *     available yet.
 *
 * WS12 replaces this module: index.ts swaps `registerBalatroQueuePlaceholder`
 * for `registerBalatroQueueHandlers` (and its disconnect hook), and this file
 * is deleted. Relative imports only (server/CLAUDE.md gotcha 7).
 */

import type { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { bindEvents, type Handlers } from '../../shared/typed-socket';
import { BALATRO_S2C_EVENTS, type BalatroHubErrorCode, type BalatroS2CPayload } from '../../../lib/balatro/net/events';
import { balatroAccount, pickBalatroEvents } from '../handlers/balatro-p2p';
import { listSpectatableLobbies } from './directory';

export const BALATRO_QUEUE_C2S_EVENTS = [
  'balatro:queue:join',
  'balatro:queue:leave',
  'balatro:party:queue',
  'balatro:invite',
  'balatro:spectate:list',
] as const;

const QUEUE_EVENTS = pickBalatroEvents(BALATRO_QUEUE_C2S_EVENTS);

function fail(socket: Socket, event: string, code: BalatroHubErrorCode): void {
  socket.emit(BALATRO_S2C_EVENTS['balatro:p2p:error'], { event, code } satisfies BalatroS2CPayload<'balatro:p2p:error'>);
}

export function registerBalatroQueuePlaceholder(_io: Server, socket: Socket): void {
  /** Account required; then "not available yet". */
  const unavailable = (event: (typeof BALATRO_QUEUE_C2S_EVENTS)[number]) => () => {
    if (!balatroAccount(socket)) return fail(socket, event, 'auth-required');
    fail(socket, event, 'invalid');
  };

  const handlers: Handlers<typeof QUEUE_EVENTS> = {
    'balatro:queue:join': unavailable('balatro:queue:join'),
    'balatro:queue:leave': unavailable('balatro:queue:leave'),
    'balatro:party:queue': unavailable('balatro:party:queue'),
    'balatro:invite': unavailable('balatro:invite'),
    'balatro:spectate:list': () => {
      if (!balatroAccount(socket)) return fail(socket, 'balatro:spectate:list', 'auth-required');
      socket.emit(BALATRO_S2C_EVENTS['balatro:spectate:lobbies'], {
        lobbies: listSpectatableLobbies(),
      } satisfies BalatroS2CPayload<'balatro:spectate:lobbies'>);
    },
  };

  bindEvents(socket, QUEUE_EVENTS, handlers, {
    app: 'balatro',
    logger,
    rateLimit: checkRateLimit,
    onRateLimited: (sock, name) => fail(sock, name, 'rate-limited'),
  });
}

/** Nothing to clean up (no queue state yet). */
export function handleBalatroQueuePlaceholderDisconnect(_io: Server, _socket: Socket): void {}
