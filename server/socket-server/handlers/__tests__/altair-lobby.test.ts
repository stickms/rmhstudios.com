/**
 * Altair co-op lobby state machine.
 *
 * The bug this guards: Start could never succeed (nothing set a class-select
 * state, and ready-up had no reachable UI), and once it could, a roster change
 * during the countdown would still launch the match. These run against the real
 * handler with fake sockets so they exercise the shipped ordering.
 *
 *   WAITING -> COUNTDOWN -> PLAYING -> RESULTS -> WAITING
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALTAIR_DISCONNECT_GRACE_MS,
  __resetAltairLobbies,
  handleAltairDisconnect,
  registerAltairHandlers,
} from '../altair';
import { all, last, makeWorld, type FakeSocket } from '../../test-support/fake-world';

const E = {
  create: 'altair:lobby:create',
  join: 'altair:lobby:join',
  leave: 'altair:lobby:leave',
  kick: 'altair:lobby:kick',
  classSelect: 'altair:class:select',
  ready: 'altair:class:ready',
  start: 'altair:game:start',
  snapshot: 'altair:game:state_snapshot',
  lobbyState: 'altair:lobby:state_snapshot',
  error: 'altair:error',
  countdown: 'altair:game:countdown',
  started: 'altair:game:started',
  results: 'altair:game:results',
  gameEvent: 'altair:game:event',
  disbanded: 'altair:lobby:disbanded',
};

interface LobbyView {
  state: string;
  hostUserId: string;
  players: { userId: string; classId: string | null; isReady: boolean }[];
  runSeed?: number | null;
}

function setup() {
  const w = makeWorld(registerAltairHandlers);
  const user = (id: string): FakeSocket => w.connect(`sock-${id}`, { userId: id, userName: id });
  const host = user('host');
  w.send(host, E.create, {});
  const lobbyId = (last<{ lobbyId: string }>(host, 'altair:lobby:created') as { lobbyId: string }).lobbyId;
  const guest = user('guest');
  w.send(guest, E.join, { lobbyId });
  const view = (s: FakeSocket) => last<LobbyView>(s, E.lobbyState) as LobbyView;
  const errors = (s: FakeSocket) => all<{ code: string }>(s, E.error).map((e) => e.code);
  const readyUp = (s: FakeSocket, classId = 'knight') => {
    w.send(s, E.classSelect, { classId });
    w.send(s, E.ready, { ready: true });
  };
  return { w, host, guest, user, lobbyId, view, errors, readyUp };
}

describe('altair lobby: start gating', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    __resetAltairLobbies();
    vi.useRealTimers();
  });

  it('rejects Start until every player has a class and is ready', () => {
    const { w, host, guest, errors, readyUp, view } = setup();

    w.send(host, E.start, {});
    expect(errors(host)).toEqual(['NOT_READY']);
    expect(view(host).state).toBe('WAITING');

    readyUp(host);
    w.send(host, E.start, {});
    expect(errors(host)).toEqual(['NOT_READY', 'NOT_READY']);

    w.send(guest, E.classSelect, { classId: 'knight' });
    w.send(host, E.start, {});
    expect(errors(host).length).toBe(3);
    expect(view(host).state).toBe('WAITING');
  });

  it('accepts Start once everyone is ready, counts down, then PLAYING', () => {
    const { w, host, guest, readyUp, view } = setup();
    readyUp(host);
    readyUp(guest, 'arcanist');

    w.send(host, E.start, {});
    expect(view(host).state).toBe('COUNTDOWN');
    expect(last<{ seconds: number }>(guest, E.countdown)).toEqual({ seconds: 5 });

    vi.advanceTimersByTime(5000);
    expect(last(host, E.started)).toBeTruthy();
    expect(last(guest, E.started)).toBeTruthy();
    expect(view(guest).state).toBe('PLAYING');
  });

  it('the hub issues the run seed and tells only the host', () => {
    const { w, host, guest, readyUp, view } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(host, E.start, {});
    expect(view(host).runSeed ?? null).toBeNull(); // nothing before the countdown ends
    vi.advanceTimersByTime(5000);
    const seed = view(host).runSeed;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(view(guest).runSeed ?? null).toBeNull();
  });

  it('needs at least two players', () => {
    const w = makeWorld(registerAltairHandlers);
    const solo = w.connect('s', { userId: 'solo', userName: 'solo' });
    w.send(solo, E.create, {});
    w.send(solo, E.classSelect, { classId: 'knight' });
    w.send(solo, E.ready, { ready: true });
    w.send(solo, E.start, {});
    expect(all<{ code: string }>(solo, E.error).map((e) => e.code)).toEqual(['NEED_MORE_PLAYERS']);
  });

  it('only the host can start', () => {
    const { w, host, guest, errors, readyUp } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(guest, E.start, {});
    expect(errors(guest)).toEqual(['NOT_HOST']);
  });

  it('a second Start during the countdown is refused (no double match)', () => {
    const { w, host, guest, errors, readyUp } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(host, E.start, {});
    w.send(host, E.start, {});
    expect(errors(host)).toEqual(['WRONG_STATE']);
    vi.advanceTimersByTime(5000);
    expect(all(host, E.started).length).toBe(1);
  });
});

describe('altair lobby: class and ready', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    __resetAltairLobbies();
    vi.useRealTimers();
  });

  it('changing class un-readies the player', () => {
    const { w, host, view, readyUp } = setup();
    readyUp(host);
    expect(view(host).players.find((p) => p.userId === 'host')!.isReady).toBe(true);
    w.send(host, E.classSelect, { classId: 'arcanist' });
    const me = view(host).players.find((p) => p.userId === 'host')!;
    expect(me.classId).toBe('arcanist');
    expect(me.isReady).toBe(false);
  });

  it('rejects an unknown class and ready without a class', () => {
    const { w, host, errors } = setup();
    w.send(host, E.classSelect, { classId: 'not-a-class' });
    w.send(host, E.ready, { ready: true });
    expect(errors(host)).toEqual(['INVALID_PAYLOAD', 'NOT_READY']);
  });

  it('locks classes once the countdown starts', () => {
    const { w, host, guest, errors, readyUp } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(host, E.start, {});
    w.send(guest, E.classSelect, { classId: 'arcanist' });
    expect(errors(guest)).toEqual(['WRONG_STATE']);
  });
});

describe('altair lobby: leave / disconnect / disband per state', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    __resetAltairLobbies();
    vi.useRealTimers();
  });

  it('WAITING: a guest leaving just shrinks the roster', () => {
    const { w, host, guest, view } = setup();
    w.send(guest, E.leave, {});
    expect(view(host).players.map((p) => p.userId)).toEqual(['host']);
  });

  it('WAITING: the last player leaving disbands the lobby', () => {
    const { w, host, guest, lobbyId } = setup();
    w.send(guest, E.leave, {});
    w.send(host, E.leave, {});
    const late = w.connect('late', { userId: 'late', userName: 'late' });
    w.send(late, E.join, { lobbyId });
    expect(all<{ code: string }>(late, E.error).map((e) => e.code)).toEqual(['LOBBY_NOT_FOUND']);
  });

  it('WAITING: host leaving hands the host role to the next player', () => {
    const { w, host, guest, view } = setup();
    w.send(host, E.leave, {});
    expect(view(guest).hostUserId).toBe('guest');
  });

  it('COUNTDOWN: a leave cancels the countdown and clears ready', () => {
    const { w, host, guest, readyUp, view } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(host, E.start, {});
    w.send(guest, E.leave, {});
    expect(view(host).state).toBe('WAITING');
    expect(view(host).players.every((p) => !p.isReady)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(all(host, E.started).length).toBe(0);
  });

  it('COUNTDOWN: a disconnect cancels the countdown too', () => {
    const { w, host, guest, readyUp, view } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(host, E.start, {});
    w.disconnect(guest);
    handleAltairDisconnect(w.io, guest as never);
    expect(view(host).state).toBe('WAITING');
    vi.advanceTimersByTime(10_000);
    expect(all(host, E.started).length).toBe(0);
  });

  it('COUNTDOWN: a kick cancels the countdown', () => {
    const { w, host, guest, readyUp, view } = setup();
    readyUp(host);
    readyUp(guest);
    w.send(host, E.start, {});
    w.send(host, E.kick, { targetUserId: 'guest' });
    expect(view(host).state).toBe('WAITING');
    vi.advanceTimersByTime(10_000);
    expect(all(host, E.started).length).toBe(0);
  });

  function playing() {
    const s = setup();
    s.readyUp(s.host);
    s.readyUp(s.guest);
    s.w.send(s.host, E.start, {});
    vi.advanceTimersByTime(5000);
    return s;
  }

  it('PLAYING: only the host may push snapshots; guests receive them', () => {
    const { w, host, guest } = playing();
    const snap = (tick: number, sharedKills: number) => ({
      tick, time: tick / 60, sharedKills, players: [], enemies: [], projectiles: [], pickups: [],
    });
    w.send(guest, E.snapshot, snap(1, 99));
    expect(last(host, E.snapshot)).toBeUndefined();
    w.send(host, E.snapshot, snap(2, 3));
    expect(last<{ tick: number }>(guest, E.snapshot)?.tick).toBe(2);
  });

  it('PLAYING: a guest dropping is held for the grace window, then removed', () => {
    const { w, host, guest, view } = playing();
    w.disconnect(guest);
    handleAltairDisconnect(w.io, guest as never);
    expect(view(host).players.find((p) => p.userId === 'guest')!).toBeTruthy();
    vi.advanceTimersByTime(ALTAIR_DISCONNECT_GRACE_MS + 1);
    expect(view(host).players.map((p) => p.userId)).toEqual(['host']);
    expect(view(host).state).toBe('PLAYING');
  });

  it('PLAYING: host dropping tells guests, and ends the run when the grace expires', () => {
    const { w, host, guest, view } = playing();
    w.disconnect(host);
    handleAltairDisconnect(w.io, host as never);
    const ev = all<{ type: string }>(guest, E.gameEvent).map((e) => e.type);
    expect(ev).toContain('host_disconnected');
    expect(view(guest).state).toBe('PLAYING');

    vi.advanceTimersByTime(ALTAIR_DISCONNECT_GRACE_MS + 1);
    const res = last<{ endedReason?: string }>(guest, E.results);
    expect(res?.endedReason).toBe('host_left');
    expect(view(guest).state).toBe('RESULTS');
  });

  it('PLAYING: host explicitly leaving ends the run for everyone with a reason', () => {
    const { w, host, guest } = playing();
    w.send(host, E.leave, {});
    expect(last<{ endedReason?: string }>(guest, E.results)?.endedReason).toBe('host_left');
  });

  it('RESULTS returns the lobby to WAITING with ready cleared', () => {
    const { w, host, guest, view } = playing();
    w.send(host, E.leave, {});
    vi.advanceTimersByTime(15_000);
    expect(view(guest).state).toBe('WAITING');
    expect(view(guest).players.every((p) => !p.isReady && p.classId === null)).toBe(true);
    void w;
  });
});
