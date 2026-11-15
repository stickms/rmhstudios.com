/**
 * The hub client and the room list. A list is one game's and its answer does not say whose, so the
 * client must ask for none on its own: the TF2 list it used to request on every connect arrived after
 * the list /csgo had asked for and emptied "Games to join" there.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { TF2_C2S } from './events';

interface Captured {
  onStatus?: (
    status: string,
  ) => void;
  onConnect?: (
    socket: unknown,
    info: {
      isReconnect: boolean;
    },
  ) => void;
}

const h =
  vi.hoisted(
    () => ({
      options:
        null as Captured | null,
      socket:
        {
          emit: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
          connected: true,
        },
      emit: vi.fn(
        (
          _event: string,
          _data?: unknown,
          _options?: unknown,
        ) =>
          true,
      ),
    }),
  );

vi.mock(
  '@/lib/shared/realtime/client',
  () => ({
    createRealtimeClient:
      (
        options: Captured & {
          bind?: (
            socket: unknown,
          ) => void;
        },
      ) => {
        h.options =
          options;
        options.bind?.(
          h.socket,
        );
        return {
          socket:
            h.socket,
          emit: h.emit,
          reconnectNow:
            vi.fn(),
          destroy:
            vi.fn(),
        };
      },
  }),
);

describe('the hub client and the room list', () => {
  beforeEach(
    async () => {
      vi.resetModules();
      h.options =
        null;
      h.socket.emit.mockClear();
      h.emit.mockClear();
    },
  );

  it('asks for no room list of its own when the hub connects', async () => {
    const net =
      await import('./client');
    await net.connectTf2();
    h.options?.onConnect?.(
      h.socket,
      {
        isReconnect: false,
      },
    );
    h.options?.onStatus?.(
      'connected',
    );
    const listed =
      [
        ...h
          .socket
          .emit
          .mock
          .calls,
        ...h
          .emit
          .mock
          .calls,
      ].filter(
        ([
          event,
        ]) =>
          event ===
          TF2_C2S.LIST_ROOMS,
      );
    expect(
      listed,
    ).toEqual(
      [],
    );
  });

  it('tells every browser the hub is connected, so each lists its own game', async () => {
    const net =
      await import('./client');
    const remove =
      net.addTf2Handlers(
        {
          onStatus:
            (
              s,
            ) =>
              s ===
                'connected' &&
              net.tf2.listRooms(
                0,
                'csgo',
              ),
        },
      );
    await net.connectTf2();
    h.options?.onStatus?.(
      'connected',
    );
    remove();
    expect(
      h.emit.mock.calls.filter(
        ([
          event,
        ]) =>
          event ===
          TF2_C2S.LIST_ROOMS,
      ),
    ).toEqual(
      [
        [
          TF2_C2S.LIST_ROOMS,
          {
            offset: 0,
            game: 'csgo',
          },
          {
            queue: false,
          },
        ],
      ],
    );
  });
});
