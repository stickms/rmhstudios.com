/**
 * Joining a room: the game client may turn an admission down (the room is another game's: a CS:GO
 * room's code opened on the TF2 page). The controller must then stop, not go on to connect.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TF2_S2C } from '../../net/events';
import { P2pJoinController } from './p2p-join';

type Net = ConstructorParameters<typeof P2pJoinController>[0];

function fakeNet() {
  const listeners = new Map<string, (payload: unknown) => void>();
  const p2p = { join: vi.fn(), leave: vi.fn(), signal: vi.fn(), relayStart: vi.fn(), relay: vi.fn() };
  const net = {
    tf2: { p2p },
    subscribeTf2: (event: string, fn: (payload: unknown) => void) => {
      listeners.set(event, fn);
      return () => listeners.delete(event);
    },
  } as unknown as Net;
  return { net, p2p, fire: (event: string, payload: unknown) => listeners.get(event)?.(payload) };
}

const admitted = { code: 'ABC234', peerId: 'peer00000001', host: 'Ada', game: 'csgo', map: 'de_dust2', mode: 'de', name: 'Ada’s server', maxPlayers: 10 };

describe('P2pJoinController', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the hub to join by code', () => {
    const { net, p2p } = fakeNet();
    const join = new P2pJoinController(net, 'ABC234', {});
    join.start();
    expect(p2p.join).toHaveBeenCalledWith('ABC234', { canHost: true });
    join.stop();
  });

  it('opens no connection when the admission is turned down', () => {
    const peer = vi.fn();
    vi.stubGlobal('RTCPeerConnection', peer);
    const { net, p2p, fire } = fakeNet();
    const seen: Array<string | undefined> = [];
    const join: P2pJoinController = new P2pJoinController(net, 'ABC234', {
      onAdmitted: (info) => {
        seen.push(info.game);
        join.stop();
      },
    });
    join.start();
    fire(TF2_S2C.P2P_ADMITTED, admitted);
    expect(seen).toEqual(['csgo']);
    expect(p2p.leave).toHaveBeenCalledTimes(1);
    expect(peer).not.toHaveBeenCalled();
  });
});
