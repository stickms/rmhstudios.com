/**
 * Blackjack table client. The connection itself is the shared casino factory
 * (`../table-client.ts`); this declares only Blackjack's own table events.
 *
 * `rejoin-seat`: the hub holds a seat through a mid-round disconnect, and its
 * `JOIN_ROOM` reconnect branch hands it back.
 */

import { createCasinoTableClient } from '../table-client';
import { useBlackjackStore } from './store';
import {
  C2S,
  S2C,
} from './events';

const table =
  createCasinoTableClient(
    {
      name: 'Blackjack',
      store:
        useBlackjackStore.getState,
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
          S2C.TURN,
          (
            data,
          ) =>
            store().handleTurn(
              data,
            ),
        );
        socket.on(
          S2C.CARD_DEALT,
          (
            data,
          ) =>
            store().handleCardDealt(
              data,
            ),
        );
        socket.on(
          S2C.DEALER_REVEAL,
          (
            data,
          ) =>
            store().handleDealerReveal(
              data,
            ),
        );
        socket.on(
          S2C.ROUND_RESULTS,
          (
            data,
          ) =>
            store().handleRoundResults(
              data,
            ),
        );
        socket.on(
          S2C.INSURANCE_OFFER,
          (
            data,
          ) =>
            store().handleInsuranceOffer(
              data,
            ),
        );
        socket.on(
          S2C.INSURANCE_RESOLVED,
          () =>
            store().handleInsuranceResolved(),
        );
      },
    },
  );

/** Concurrent callers share one in-flight connect (see single-flight.ts). */
export const connectToBlackjack =
  table.connect;
export const getBlackjackSocket =
  table.getSocket;
export const disconnectFromBlackjack =
  table.disconnect;
/** Balance pushes for the parent page's coin counter. */
export const onBalanceUpdate =
  table.onBalanceUpdate;
