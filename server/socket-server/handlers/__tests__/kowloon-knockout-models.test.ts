import { afterEach, describe, expect, it } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { __resetKowloonRooms, registerKowloonKnockoutHandlers } from '../kowloon-knockout';

type Handler = (payload?: unknown) => void;

function makeWorld() {
  const sockets = new Map<string, FakeSocket>();
  const io = { sockets: { sockets } } as unknown as Server;
  class FakeSocket {
    handlers = new Map<string, Handler>();
    emitted: { event: string; payload: any }[] = [];
    constructor(public id: string) {
      sockets.set(id, this);
      registerKowloonKnockoutHandlers(io, this as unknown as Socket);
    }
    on(event: string, h: Handler) {
      this.handlers.set(event, h);
      return this;
    }
    emit(event: string, payload?: unknown) {
      this.emitted.push({ event, payload });
      return true;
    }
    fire(event: string, payload?: unknown) {
      this.handlers.get(event)?.(payload);
    }
    last(event: string) {
      return [...this.emitted].reverse().find((e) => e.event === event)?.payload;
    }
  }
  return { make: (id: string) => new FakeSocket(id) };
}

const modelsOf = (lobby: any) => lobby.seats.map((s: any) => s.modelId);

describe('kowloon knockout: fighter model ids', () => {
  afterEach(() => __resetKowloonRooms());

  it('carries a valid model id from create/join into the lobby and the match start', () => {
    const w = makeWorld();
    const host = w.make('h1');
    const guest = w.make('g1');
    host.fire('kk:create_room', { mode: 'ffa', isPublic: true, fighterModel: 'tf2_heavy' });
    const code = host.last('kk:room_created').code as string;
    guest.fire('kk:join_room', { code, fighterModel: 'hl2_barney' });
    const lobby = host.last('kk:lobby_update');
    expect(modelsOf(lobby).slice(0, 2)).toEqual(['tf2_heavy', 'hl2_barney']);
    host.fire('kk:start');
    expect(guest.last('kk:match_start').seats.map((s: any) => s.modelId).slice(0, 2)).toEqual(['tf2_heavy', 'hl2_barney']);
  });

  it('coerces a forged or missing model id to the default Y-Bot', () => {
    const w = makeWorld();
    const host = w.make('h1');
    const guest = w.make('g1');
    host.fire('kk:create_room', { mode: 'ffa', isPublic: true, fighterModel: '../../etc/passwd' });
    const code = host.last('kk:room_created').code as string;
    guest.fire('kk:join_room', { code }); // an older client sends no model
    expect(modelsOf(host.last('kk:lobby_update')).slice(0, 2)).toEqual(['ybot', 'ybot']);
    guest.fire('kk:set_fighter', { fighterClass: 'iron_bull', fighterModel: { evil: true } });
    expect(modelsOf(host.last('kk:lobby_update'))[1]).toBe('ybot');
    guest.fire('kk:set_fighter', { fighterClass: 'iron_bull', fighterModel: 'tf2_spy' });
    expect(modelsOf(host.last('kk:lobby_update'))[1]).toBe('tf2_spy');
  });

  it('gives CPU seats a roster model', () => {
    const w = makeWorld();
    const host = w.make('h1');
    host.fire('kk:create_room', { mode: 'ffa', isPublic: true });
    const cpu = host.last('kk:lobby_update').seats.find((s: any) => !s.human);
    expect(typeof cpu.modelId).toBe('string');
    expect(cpu.modelId.length).toBeGreaterThan(0);
  });
});
