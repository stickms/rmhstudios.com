import type { Server } from 'socket.io';
import type { FeatureSocketServer } from '../../../server/socket-server/features';
import {
  registerBlackjackHandlers,
  handleBlackjackDisconnect,
  initializeBlackjackPublicTable,
  listPublicRooms as listBlackjackRooms,
  refundBlackjackOnShutdown,
  restoreBlackjackTables,
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
import { logger } from '../../../server/socket-server/logger';
import { openCasinoTableStore, type CasinoTableStore } from './table-store';

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

/** The durable table store this process opened at boot, or `null` (the default: `CASINO_DURABLE_TABLES` is off). */
let tableStore: CasinoTableStore | null = null;

/**
 * Boot, BEFORE `listen()`: open the durable table store and bring back the tables the previous process saved
 * (third-pass audit OP3; `table-store.ts`). With `CASINO_DURABLE_TABLES` unset this resolves at once having
 * done nothing. Never throws: the hub must start whatever the store or the database is doing.
 *
 * Blackjack is the only game on the store. Roulette, baccarat and Hold'em still refund at shutdown.
 *
 * @param store a test's own store; production passes nothing and the environment decides.
 */
export async function restoreCasinoTables(io: Server, store?: CasinoTableStore): Promise<void> {
  try {
    tableStore = store ?? (await openCasinoTableStore(logger));
    if (!tableStore) return;
    await restoreBlackjackTables(io, tableStore);
  } catch (err) {
    logger.error({ event: 'casino_tables_restore_error', error: String(err) });
  }
}

/** Shutdown, after {@link CASINO_SHUTDOWN_REFUNDS} have settled: close the store's connection. */
export async function closeCasinoTableStore(): Promise<void> {
  const store = tableStore;
  tableStore = null;
  await store?.close().catch(() => {});
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
 *
 * With durable tables on, blackjack's entry saves its tables instead of refunding them (same call, same
 * synchronous claim: it snapshots and empties its rooms before it awaits anything).
 */
export const CASINO_SHUTDOWN_REFUNDS: ReadonlyArray<readonly [game: string, run: (deadlineMs: number) => Promise<unknown>]> = [
  ['blackjack', refundBlackjackOnShutdown],
  ['roulette', refundRouletteOnShutdown],
  ['baccarat', refundBaccaratOnShutdown],
  ['holdem', cashOutHoldemOnShutdown],
];

export { CASINO_SHUTDOWN_DEADLINE_MS } from './casino-shutdown';
