/**
 * Baccarat table client. The connection itself is the shared casino factory
 * (`../table-client.ts`); this declares only Baccarat's own table events.
 *
 * `rejoin-seat`: the hub holds a seat through a mid-round disconnect so the
 * round settles to it, and its `JOIN_ROOM` reconnect branch hands it back.
 */

import { createCasinoTableClient } from '../table-client';
import { useBaccaratStore } from './store';
import {
  C2S,
  S2C,
} from './events';

const table =
  createCasinoTableClient(
    {
      name: 'Baccarat',
      store:
        useBaccaratStore.getState,
      events:
        {
          C2S,
          S2C,
        },
      onReconnect:
        'rejoin-seat',
      bind: (
        socket,
        store,
      ) => {
        socket.on(
          S2C.BETTING_PHASE,
          (
            data,
          ) =>
            store().handleBettingPhase(
              data,
            ),
        );
        socket.on(
          S2C.CARD_REVEAL,
          (
            data,
          ) =>
            store().handleCardReveal(
              data,
            ),
        );
        socket.on(
          S2C.ROUND_RESULT,
          (
            data,
          ) =>
            store().handleRoundResult(
              data,
            ),
        );
      },
    },
  );

/** Concurrent callers share one in-flight connect (see single-flight.ts). */
export const connectToBaccarat =
  table.connect;
export const getBaccaratSocket =
  table.getSocket;
export const disconnectFromBaccarat =
  table.disconnect;
export const onBaccaratBalanceUpdate =
  table.onBalanceUpdate;
