/**
 * Altair co-op in-match relays: guest input -> host, host snapshots -> guests,
 * host-only end of run. The host's browser owns the simulation, so everything a
 * client sends here is untrusted: these pin who may send what, what is
 * forwarded, and that a client can never mint coins through the end-of-run report.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetAltairLobbies, handleAltairDisconnect, registerAltairHandlers } from '../handlers';
import { all, last, makeWorld } from '../../../../server/socket-server/test-support/fake-world';
import { config } from '../../../../server/socket-server/config';

const E = {
  create: 'altair:lobby:create',
  join: 'altair:lobby:join',
  classSelect: 'altair:class:select',
  ready: 'altair:class:ready',
  start: 'altair:game:start',
  input: 'altair:game:input',
  snapshot: 'altair:game:state_snapshot',
  end: 'altair:game:end',
  offer: 'altair:game:level_up_offer',
  choice: 'altair:game:level_up_choice',
  results: 'altair:game:results',
  error: 'altair:error',
};

function playing() {
  const w = makeWorld(registerAltairHandlers);
  const host = w.connect('sock-host', { userId: 'host', userName: 'host' });
  w.send(host, E.create, {});
  const lobbyId = (last<{ lobbyId: string }>(host, 'altair:lobby:created') as { lobbyId: string }).lobbyId;
  const guest = w.connect('sock-guest', { userId: 'guest', userName: 'guest' });
  w.send(guest, E.join, { lobbyId });
  for (const s of [host, guest]) {
    w.send(s, E.classSelect, { classId: 'knight' });
    w.send(s, E.ready, { ready: true });
  }
  w.send(host, E.start, {});
  vi.advanceTimersByTime(5000);
  return { w, host, guest };
}

const snapshot = (over: Record<string, unknown> = {}) => ({
  tick: 1,
  time: 0.05,
  sharedKills: 0,
  players: [],
  enemies: [],
  projectiles: [],
  pickups: [],
  ...over,
});

describe('altair game relays', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    __resetAltairLobbies();
    vi.useRealTimers();
  });

  it('rate limits cover the in-match events (an unlisted event is silently dropped)', () => {
    const rules = config.SOCKET_RATE_LIMITS as Record<string, { max: number }>;
    expect(rules['altair:game:input'].max).toBeGreaterThan(1200); // 20 Hz = 1200/min exactly
    expect(rules['altair:game:state_snapshot'].max).toBeGreaterThan(1200);
    expect(rules['altair:game:end']).toBeTruthy();
  });

  describe('a user with several sockets (call socket, other features)', () => {
    it('still reaches the Altair socket after another socket connects last', () => {
      const { w, host, guest } = playing();
      // The same user opens another socket to the hub AFTER joining: it also runs
      // registerAltairHandlers and used to steal the "current socket" slot.
      const other = w.connect('sock-guest-2', { userId: 'guest', userName: 'guest' });
      w.send(host, E.snapshot, snapshot());
      expect(all(guest, E.snapshot).length).toBe(1);
      w.send(guest, E.input, { seq: 1, dx: 1, dy: 0 });
      expect(last(host, E.input)).toBeTruthy();
      void other;
    });

    it('closing the other socket is not a drop; closing the last one is', () => {
      const { w, host, guest } = playing();
      const other = w.connect('sock-guest-2', { userId: 'guest', userName: 'guest' });
      w.disconnect(other);
      handleAltairDisconnect(w.io, other as never);
      expect(all(host, 'altair:game:event').filter((e) => (e as { type: string }).type === 'player_disconnected')).toEqual([]);
      const view = () => last<{ players: { userId: string; isConnected: boolean }[] }>(host, 'altair:lobby:state_snapshot');
      expect(view()?.players.find((p) => p.userId === 'guest')?.isConnected).toBe(true);
      w.disconnect(guest);
      handleAltairDisconnect(w.io, guest as never);
      expect(view()?.players.find((p) => p.userId === 'guest')?.isConnected).toBe(false);
    });
  });

  describe('drop-in', () => {
    function joiner() {
      const s = playing();
      const lobbyId = (last<{ lobbyId: string }>(s.host, 'altair:lobby:created') as { lobbyId: string }).lobbyId;
      const late = s.w.connect('sock-late', { userId: 'late', userName: 'late' });
      s.w.send(late, E.join, { lobbyId });
      return { ...s, late };
    }
    const joined = (s: ReturnType<typeof joiner>['host']) =>
      all<{ player: { userId: string; classId: string | null; slot: number } }>(s, 'altair:game:player_joined');

    it('a mid-run joiner is announced without a class, then picks exactly once', () => {
      const { w, host, late } = joiner();
      expect(joined(host).map((j) => j.player.classId)).toEqual([null]);
      w.send(late, E.classSelect, { classId: 'arcanist' });
      const events = joined(host);
      expect(events.length).toBe(2);
      expect(events[1].player).toMatchObject({ userId: 'late', classId: 'arcanist' });
      // A second pick is refused: classes are locked in a running match.
      w.send(late, E.classSelect, { classId: 'knight' });
      expect(all<{ code: string }>(late, E.error).map((e) => e.code)).toContain('WRONG_STATE');
      expect(joined(host).length).toBe(2);
    });

    it('a player who started the match cannot swap class mid-run', () => {
      const { w, host, guest } = joiner();
      w.send(guest, E.classSelect, { classId: 'arcanist' });
      expect(all<{ code: string }>(guest, E.error).map((e) => e.code)).toContain('WRONG_STATE');
      expect(joined(host).filter((j) => j.player.userId === 'guest')).toEqual([]);
    });

    it('rejects an unknown class from a joiner', () => {
      const { w, late } = joiner();
      w.send(late, E.classSelect, { classId: 'not-a-class' });
      expect(all<{ code: string }>(late, E.error).map((e) => e.code)).toContain('INVALID_PAYLOAD');
    });
  });

  describe('input', () => {
    it('forwards a guest intent to the host only, rebuilt field by field', () => {
      const { w, host, guest } = playing();
      w.send(guest, E.input, { seq: 4, dx: 0.5, dy: -1, x: 99999, hp: 1e9, extra: 'x' });
      expect(last(host, E.input)).toEqual({ userId: 'guest', seq: 4, dx: 0.5, dy: -1 });
      expect(all(guest, E.input)).toEqual([]);
    });

    it('does not relay the host own input back to itself', () => {
      const { w, host } = playing();
      w.send(host, E.input, { seq: 1, dx: 1, dy: 0 });
      expect(all(host, E.input)).toEqual([]);
    });

    it.each([
      ['non-object', 'go'],
      ['missing seq', { dx: 0, dy: 0 }],
      ['negative seq', { seq: -1, dx: 0, dy: 0 }],
      ['fractional seq', { seq: 1.5, dx: 0, dy: 0 }],
      ['string axis', { seq: 1, dx: '1', dy: 0 }],
      ['NaN axis', { seq: 1, dx: Number.NaN, dy: 0 }],
      ['Infinity axis', { seq: 1, dx: 0, dy: Number.POSITIVE_INFINITY }],
      ['huge axis', { seq: 1, dx: 40, dy: 0 }],
    ])('drops a malformed intent: %s', (_name, payload) => {
      const { w, host, guest } = playing();
      w.send(guest, E.input, payload);
      expect(all(host, E.input)).toEqual([]);
    });

    it('ignores input outside PLAYING', () => {
      const w = makeWorld(registerAltairHandlers);
      const host = w.connect('sock-host', { userId: 'host', userName: 'host' });
      w.send(host, E.create, {});
      const lobbyId = (last<{ lobbyId: string }>(host, 'altair:lobby:created') as { lobbyId: string }).lobbyId;
      const guest = w.connect('sock-guest', { userId: 'guest', userName: 'guest' });
      w.send(guest, E.join, { lobbyId });
      w.send(guest, E.input, { seq: 1, dx: 1, dy: 0 });
      expect(all(host, E.input)).toEqual([]);
    });
  });

  describe('snapshots', () => {
    it('relays a well-formed snapshot to guests and clamps sharedKills', () => {
      const { w, host, guest } = playing();
      w.send(host, E.snapshot, snapshot({ sharedKills: 7 }));
      expect(all(guest, E.snapshot).length).toBe(1);
      expect(all(host, E.snapshot)).toEqual([]);
    });

    it.each([
      ['no tick', { tick: undefined }],
      ['non-finite time', { time: Number.POSITIVE_INFINITY }],
      ['players not an array', { players: 'x' }],
      ['five players', { players: [1, 2, 3, 4, 5] }],
      ['oversized enemies', { enemies: new Array(4001).fill(0) }],
    ])('refuses to relay a malformed snapshot: %s', (_name, over) => {
      const { w, host, guest } = playing();
      w.send(host, E.snapshot, snapshot(over));
      expect(all(guest, E.snapshot)).toEqual([]);
    });
  });

  describe('level-up (host -> one guest, guest -> host)', () => {
    const offer = (over: Record<string, unknown> = {}) => ({
      userId: 'guest',
      level: 4,
      remaining: 10,
      choices: [
        { type: 'new_weapon', weaponId: 'whip' },
        { type: 'upgrade_passive', passiveId: 'might', newLevel: 2 },
        { type: 'gold', amount: 25 },
      ],
      ...over,
    });

    it('rate limits exist for both directions', () => {
      const rules = config.SOCKET_RATE_LIMITS as Record<string, { max: number }>;
      expect(rules['altair:game:level_up_choice']).toBeTruthy();
      expect(rules['altair:game:level_up_offer']).toBeTruthy();
    });

    it('the host offers choices to exactly that guest, rebuilt field by field', () => {
      const { w, host, guest } = playing();
      w.send(host, E.offer, offer({ choices: [{ type: 'new_weapon', weaponId: 'whip', evil: '<script>' }] }));
      expect(last(guest, E.offer)).toEqual({ level: 4, remaining: 10, choices: [{ type: 'new_weapon', weaponId: 'whip' }] });
      expect(all(host, E.offer)).toEqual([]);
    });

    it('a guest cannot offer upgrades to anyone', () => {
      const { w, host, guest } = playing();
      w.send(guest, E.offer, offer({ userId: 'host' }));
      expect(all(host, E.offer)).toEqual([]);
      expect(all<{ code: string }>(guest, E.error).map((e) => e.code)).toContain('NOT_HOST');
    });

    it.each([
      ['unknown target', { userId: 'stranger' }],
      ['the host itself', { userId: 'host' }],
      ['no choices', { choices: [] }],
      ['too many choices', { choices: new Array(7).fill({ type: 'gold', amount: 25 }) }],
      ['unknown choice type', { choices: [{ type: 'grant_admin' }] }],
      ['non-array choices', { choices: 'x' }],
    ])('drops a malformed offer: %s', (_n, over) => {
      const { w, host, guest } = playing();
      w.send(host, E.offer, offer(over));
      expect(all(guest, E.offer)).toEqual([]);
    });

    it('relays a guest pick to the host as a bare index', () => {
      const { w, host, guest } = playing();
      w.send(guest, E.choice, { choiceIndex: 2, extra: 'x' });
      expect(last(host, E.choice)).toEqual({ userId: 'guest', choiceIndex: 2 });
    });

    it.each([[-1], [1.5], ['1'], [99], [null]])('drops a bad pick index %s', (idx) => {
      const { w, host, guest } = playing();
      w.send(guest, E.choice, { choiceIndex: idx });
      expect(all(host, E.choice)).toEqual([]);
    });
  });

  describe('end of run (host only)', () => {
    const report = (over: Record<string, unknown> = {}) => ({
      victory: false,
      time: 321.5,
      sharedKills: 120,
      bossesDefeated: ['hollow_king'],
      players: [
        { userId: 'host', level: 6, kills: 70, timeSurvived: 300, revivesGiven: 1, revivesReceived: 0, wasDowned: false, wasAliveAtEnd: false },
        { userId: 'guest', level: 5, kills: 50, timeSurvived: 280, revivesGiven: 0, revivesReceived: 1, wasDowned: true, wasAliveAtEnd: false },
      ],
      ...over,
    });

    it('broadcasts RESULTS with the clamped per-player stats', () => {
      const { w, host, guest } = playing();
      w.send(host, E.end, report());
      for (const s of [host, guest]) {
        const res = last<{
          victory: boolean;
          sharedKills: number;
          bossesDefeated: string[];
          players: { userId: string; kills: number; level: number; coinsEarned: number }[];
        }>(s, E.results);
        expect(res?.victory).toBe(false);
        expect(res?.sharedKills).toBe(120);
        expect(res?.bossesDefeated).toEqual(['hollow_king']);
        expect(res?.players.find((p) => p.userId === 'guest')?.kills).toBe(50);
      }
    });

    it('a guest cannot end the run', () => {
      const { w, host, guest } = playing();
      w.send(guest, E.end, report({ victory: true }));
      expect(all(host, E.results)).toEqual([]);
      expect(all<{ code: string }>(guest, E.error).map((e) => e.code)).toContain('NOT_HOST');
    });

    it('never mints coins: coinsEarned is 0 whatever the client claims', () => {
      const { w, host, guest } = playing();
      w.send(
        host,
        E.end,
        report({
          players: [
            { userId: 'host', level: 6, kills: 1, coins: 9_999_999, coinsEarned: 9_999_999, coinBreakdown: { enemyDrops: 9e9 } },
            { userId: 'guest', level: 1, kills: 1 },
          ],
        }),
      );
      const res = last<{ players: { coinsEarned: number; coinBreakdown: Record<string, number> }[] }>(guest, E.results);
      expect(res?.players.every((p) => p.coinsEarned === 0)).toBe(true);
      expect(res?.players.every((p) => Object.values(p.coinBreakdown).every((v) => v === 0))).toBe(true);
    });

    it('clamps absurd numbers and ignores unknown users', () => {
      const { w, host, guest } = playing();
      w.send(
        host,
        E.end,
        report({
          time: 1e12,
          sharedKills: 1e15,
          players: [
            { userId: 'host', level: 1e9, kills: -5, timeSurvived: Number.NaN },
            { userId: 'stranger', level: 99, kills: 99 },
          ],
        }),
      );
      const res = last<{
        sharedKills: number;
        timeSurvived: number;
        players: { userId: string; level: number; kills: number; timeSurvived: number }[];
      }>(guest, E.results);
      expect(res?.sharedKills).toBeLessThanOrEqual(10_000_000);
      expect(res?.timeSurvived).toBeLessThanOrEqual(6 * 60 * 60);
      const hostRow = res?.players.find((p) => p.userId === 'host');
      expect(hostRow?.level).toBeLessThanOrEqual(999);
      expect(hostRow?.kills).toBe(0);
      expect(hostRow?.timeSurvived).toBe(0);
      expect(res?.players.some((p) => p.userId === 'stranger')).toBe(false);
    });

    it('rejects a malformed report and ends nothing', () => {
      const { w, host, guest } = playing();
      w.send(host, E.end, { victory: true });
      expect(all<{ code: string }>(host, E.error).map((e) => e.code)).toContain('INVALID_PAYLOAD');
      expect(all(guest, E.results)).toEqual([]);
    });

    it('a second report does not end it twice', () => {
      const { w, host, guest } = playing();
      w.send(host, E.end, report());
      w.send(host, E.end, report({ victory: true }));
      expect(all(guest, E.results).length).toBe(1);
    });
  });
});
