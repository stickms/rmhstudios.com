/**
 * Roulette table client. The connection itself is the shared casino factory
 * (`../table-client.ts`); this declares only Roulette's own table events.
 *
 * `rejoin-seat`: the hub holds a seat through a mid-spin disconnect so the
 * spin settles to it, and its `JOIN_ROOM` reconnect branch hands it back.
 */

import { createCasinoTableClient } from '../table-client';
import { useRouletteStore } from './store';
import {
  C2S,
  S2C,
} from './events';

const table =
  createCasinoTableClient(
    {
      name: 'Roulette',
      store:
        useRouletteStore.getState,
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
          S2C.SPIN_RESULT,
          (
            data,
          ) =>
            store().handleSpinResult(
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
export const connectToRoulette =
  table.connect;
export const getRouletteSocket =
  table.getSocket;
export const disconnectFromRoulette =
  table.disconnect;
export const onRouletteBalanceUpdate =
  table.onBalanceUpdate;
