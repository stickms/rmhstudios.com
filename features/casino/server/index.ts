import type { Server } from 'socket.io';
import type { FeatureSocketServer } from '../../../server/socket-server/features';
import {
  registerBlackjackHandlers,
  handleBlackjackDisconnect,
  initializeBlackjackPublicTable,
  listPublicRooms as listBlackjackRooms,
  refundBlackjackOnShutdown,
} from './blackjack';
import {
  registerHoldemHandlers,
  handleHoldemDisconnect,
  initializeHoldem,
  listPublicRooms as listHoldemRooms,
  cashOutHoldemOnShutdown,
} from './holdem';
import {
  registerBaccaratHandlers,
  handleBaccaratDisconnect,
  initializeBaccarat,
  listPublicRooms as listBaccaratRooms,
  refundBaccaratOnShutdown,
} from './baccarat';
import {
  registerRouletteHandlers,
  handleRouletteDisconnect,
  initializeRoulette,
  listPublicRooms as listRouletteRooms,
  refundRouletteOnShutdown,
} from './roulette';

/**
 * The casino's socket surface (Blackjack, Hold'em, Baccarat, Roulette), registered by
 * `server/socket-server/features.ts`. Pinned to its own hub slot: the four calls sat between
 * Studio Jam and Lights Out. Registration and disconnect order is blackjack, holdem, baccarat,
 * roulette, as before.
 */
const casino: FeatureSocketServer = {
  id: 'casino',
  slot: 'casino',
  register(io, socket) {
    registerBlackjackHandlers(io, socket);
    registerHoldemHandlers(io, socket);
    registerBaccaratHandlers(io, socket);
    registerRouletteHandlers(io, socket);
  },
  onDisconnect(io, socket) {
    handleBlackjackDisconnect(io, socket);
    handleHoldemDisconnect(io, socket);
    handleBaccaratDisconnect(io, socket);
    handleRouletteDisconnect(io, socket);
  },
};

export default casino;

/** Boot: each table module opens its public table / lobby broadcaster. Called once after `listen()`. */
export function initializeCasino(io: Server): void {
  initializeBlackjackPublicTable(io);
  initializeHoldem(io);
  initializeBaccarat(io);
  initializeRoulette(io);
}

/** The read-only lobby snapshot served at `/internal/casino-rooms` (no identities, hands or balances). */
export function listCasinoRooms() {
  return {
    blackjack: listBlackjackRooms(),
    holdem: listHoldemRooms(),
    baccarat: listBaccaratRooms(),
    roulette: listRouletteRooms(),
  };
}

/**
 * The refund-on-shutdown contract (see `casino-shutdown.ts`). ORDER IS BEHAVIOUR: `shutdown()` calls these
 * in this order, synchronously, before `io.close()`, so each module claims its stakes before the disconnect
 * fan-out and no payout timer can pay a refunded stake.
 */
export const CASINO_SHUTDOWN_REFUNDS: ReadonlyArray<readonly [game: string, run: (deadlineMs: number) => Promise<unknown>]> = [
  ['blackjack', refundBlackjackOnShutdown],
  ['roulette', refundRouletteOnShutdown],
  ['baccarat', refundBaccaratOnShutdown],
  ['holdem', cashOutHoldemOnShutdown],
];

export { CASINO_SHUTDOWN_DEADLINE_MS } from './casino-shutdown';
