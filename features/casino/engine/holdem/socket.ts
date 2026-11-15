/**
 * Hold'em table client. The connection itself is the shared casino factory
 * (`../table-client.ts`); this declares only Hold'em's own table events.
 *
 * `back-to-lobby`: the hub folds and cashes out a Hold'em seat the moment its
 * socket drops, so a reconnect must not re-send `JOIN_ROOM` (a fresh buy-in).
 */

import { createCasinoTableClient } from '../table-client';
import { useHoldemStore } from './store';
import {
  C2S,
  S2C,
} from './events';

const table =
  createCasinoTableClient(
    {
      name: 'Holdem',
      store:
        useHoldemStore.getState,
      events:
        {
          C2S,
          S2C,
        },
      onReconnect:
        'back-to-lobby',
      bind: (
        socket,
        store,
      ) => {
        socket.on(
          S2C.NEW_HAND,
          (
            data,
          ) =>
            store().handleNewHand(
              data,
            ),
        );
        socket.on(
          S2C.TURN,
          (
            data,
          ) =>
            store().handleTurn(
              data,
            ),
        );
        socket.on(
          S2C.COMMUNITY_CARDS,
          (
            data,
          ) =>
            store().handleCommunityCards(
              data,
            ),
        );
        socket.on(
          S2C.HAND_RESULT,
          (
            data,
          ) =>
            store().handleHandResult(
              data,
            ),
        );
      },
    },
  );

/** Concurrent callers share one in-flight connect (see single-flight.ts). */
export const connectToHoldem =
  table.connect;
export const getHoldemSocket =
  table.getSocket;
export const disconnectFromHoldem =
  table.disconnect;
export const onHoldemBalanceUpdate =
  table.onBalanceUpdate;
