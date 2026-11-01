import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import {
  KK_RESUME_GRACE_MS,
  __resetKowloonRooms,
  handleKowloonKnockoutDisconnect,
  registerKowloonKnockoutHandlers,
} from '../kowloon-knockout';

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
    count(event: string) {
      return this.emitted.filter((e) => e.event === event).length;
    }
    drop() {
      sockets.delete(this.id);
      handleKowloonKnockoutDisconnect(io, this as unknown as Socket);
    }
  }
  return { io, sockets, make: (id: string) => new FakeSocket(id) };
}

function startedMatch() {
  const w = makeWorld();
  const host = w.make('h1');
  const guest = w.make('g1');
  host.fire('kk:create_room', { mode: 'ffa', isPublic: true });
  const code = host.last('kk:room_created').code as string;
  guest.fire('kk:join_room', { code });
  host.fire('kk:start');
  return { w, host, guest, code };
}

describe('kowloon knockout: seat resume after a drop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    __resetKowloonRooms();
    vi.useRealTimers();
  });

  it('hands every seat a resume token with match_start', () => {
    const { host, guest } = startedMatch();
    expect(host.last('kk:match_start').resumeToken).toBeTruthy();
    expect(guest.last('kk:match_start').resumeToken).not.toBe(host.last('kk:match_start').resumeToken);
  });

  it('holds a guest seat through a drop and rebinds it on resume', () => {
    const { w, host, guest, code } = startedMatch();
    const token = guest.last('kk:match_start').resumeToken;
    guest.drop();
    expect(host.last('kk:peer_status')).toEqual({ seat: 1, connected: false });
    expect(host.count('kk:player_left')).toBe(0);

    vi.advanceTimersByTime(KK_RESUME_GRACE_MS - 1000);
    const fresh = w.make('g2');
    fresh.fire('kk:resume', { code, token });
    expect(fresh.last('kk:resumed')).toMatchObject({ you: 1, code });
    expect(host.last('kk:peer_status')).toEqual({ seat: 1, connected: true });

    // the old timer must not fire after a resume
    vi.advanceTimersByTime(KK_RESUME_GRACE_MS * 2);
    expect(host.count('kk:player_left')).toBe(0);
    // input from the new socket now reaches the host, and snapshots reach it
    fresh.fire('kk:input', { input: { a: 1 } });
    expect(host.last('kk:input')).toMatchObject({ seat: 1 });
    host.fire('kk:snapshot', { tick: 1 });
    expect(fresh.last('kk:snapshot')).toEqual({ tick: 1 });
  });

  it('frees the guest seat (CPU takes over) when the grace window lapses', () => {
    const { host, guest } = startedMatch();
    guest.drop();
    vi.advanceTimersByTime(KK_RESUME_GRACE_MS + 1);
    expect(host.last('kk:player_left')).toEqual({ seat: 1 });
  });

  it('ends the room for the guests with a clear message when a dropped host never returns', () => {
    const { host, guest, code, w } = startedMatch();
    const hostToken = host.last('kk:match_start').resumeToken;
    host.drop();
    expect(guest.last('kk:peer_status')).toEqual({ seat: 0, connected: false });
    vi.advanceTimersByTime(KK_RESUME_GRACE_MS + 1);
    expect(guest.last('kk:error')).toEqual({ message: 'Host left the room' });
    // the late host is told the room is gone rather than left hanging
    const late = w.make('h2');
    late.fire('kk:resume', { code, token: hostToken });
    expect(late.last('kk:error')).toEqual({ message: 'Room closed' });
  });

  it('rejects a wrong token', () => {
    const { w, guest, code } = startedMatch();
    guest.drop();
    const fresh = w.make('g2');
    fresh.fire('kk:resume', { code, token: 'nope' });
    expect(fresh.last('kk:error')).toEqual({ message: 'Room closed' });
    expect(fresh.count('kk:resumed')).toBe(0);
  });

  it('does not hold seats in the lobby (disconnect frees them at once)', () => {
    const w = makeWorld();
    const host = w.make('h1');
    const guest = w.make('g1');
    host.fire('kk:create_room', { mode: 'ffa', isPublic: true });
    guest.fire('kk:join_room', { code: host.last('kk:room_created').code });
    guest.drop();
    expect(host.last('kk:player_left')).toEqual({ seat: 1 });
  });
});
