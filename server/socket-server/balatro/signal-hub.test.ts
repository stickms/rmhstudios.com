/**
 * The generic registry (server/socket-server/p2p/signal-hub.ts) on its own,
 * with injected time and timers: room limit and code reclaim, slots in peer
 * ids, successor choice, promotion bookkeeping, the host timeout and resume.
 * (Kept under balatro/ so it runs in `pnpm test:balatro`, its only user.)
 */

import { describe, expect, it } from 'vitest';
import { randomAlnum, SignalHub, type HubAccount } from '../p2p/signal-hub';
import { relaySlotOf } from '../../../lib/shared/p2p/relay';

const acct = (userId: string): HubAccount => ({ userId, name: userId, avatarUrl: null });

function makeHub(maxRooms = 3) {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; live: boolean }> = [];
  const timeouts: string[] = [];
  let n = 0;
  const hub = new SignalHub<{ tag: string }, null>({
    limits: { PEER_ID_LENGTH: 12, TOKEN_LENGTH: 24, MAX_ROOMS: maxRooms },
    relay: { MAX_PEERS_PER_ROOM: 2, BYTES_PER_SEC: 1000, BURST_BYTES: 2000, MAX_DEBT_BYTES: 4000, MAX_PACKET_BYTES: 5000 },
    generateCode: () => `CODE${String(++n).padStart(2, '2')}`.slice(0, 6),
    onHostTimeout: (room) => timeouts.push(room.code),
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => ((t as { live: boolean }).live = false),
  });
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) {
      t.live = false;
      t.fn();
    }
  };
  return { hub, advance, timeouts };
}

describe('SignalHub', () => {
  it('makes unbiased alphanumeric secrets of the asked length', () => {
    const s = randomAlnum(500);
    expect(s).toMatch(/^[A-Za-z0-9]{500}$/);
    expect(new Set(s).size).toBeGreaterThan(50);
  });

  it('caps rooms and re-claims only a free code', () => {
    const { hub } = makeHub(2);
    const r1 = hub.host('s1', acct('a'), { tag: '1' });
    expect(typeof r1).toBe('object');
    expect(hub.host('s2', acct('b'), { tag: '2' }, { code: (r1 as { code: string }).code, token: 't'.repeat(24) })).toBe('code-taken');
    const r2 = hub.host('s2', acct('b'), { tag: '2' }, { code: 'QQQQQQ', token: 't'.repeat(24) });
    expect(r2).toMatchObject({ code: 'QQQQQQ', token: 't'.repeat(24) });
    expect(hub.host('s3', acct('c'), { tag: '3' })).toBe('room-limit');
  });

  it('issues peer ids carrying distinct slots and reuses freed ones', () => {
    const { hub } = makeHub();
    const room = hub.host('h', acct('h'), { tag: '' }) as Exclude<ReturnType<typeof hub.host>, string>;
    const a = hub.addMember(room, 'sa', acct('a'), 'player', null)!;
    const b = hub.addMember(room, 'sb', acct('b'), 'player', null)!;
    expect([relaySlotOf(a.peerId), relaySlotOf(b.peerId)]).toEqual([1, 2]);
    hub.removeMember(room, a);
    const c = hub.addMember(room, 'sc', acct('c'), 'player', null)!;
    expect(c.slot).toBe(1);
    expect(c.joinSeq).toBe(3);
    // A socket is in one room at a time: joining again replaces its entry.
    const c2 = hub.addMember(room, 'sc', acct('c'), 'player', null)!;
    expect(room.members.has(c.peerId)).toBe(false);
    expect(hub.memberOf('sc')?.member).toBe(c2);
  });

  it('chooses the named, eligible, connected successor, else the earliest joined', () => {
    const { hub } = makeHub();
    const room = hub.host('h', acct('h'), { tag: '' }) as Exclude<ReturnType<typeof hub.host>, string>;
    const a = hub.addMember(room, 'sa', acct('a'), 'spectator', null)!;
    const b = hub.addMember(room, 'sb', acct('b'), 'player', null)!;
    const c = hub.addMember(room, 'sc', acct('c'), 'player', null)!;
    const players = (m: { role: string }) => m.role === 'player';
    expect(hub.successorFor(room, players)).toBeNull(); // nobody admitted yet
    for (const m of [a, b, c]) hub.admit(m);
    expect(hub.successorFor(room, players)).toBe(b);
    room.successor = c.peerId;
    expect(hub.successorFor(room, players)).toBe(c);
    hub.detachMember(room, c);
    expect(hub.successorFor(room, players)).toBe(b);
    room.successor = a.peerId;
    expect(hub.successorFor(room, players)).toBe(b);
  });

  it('promotes: new host, new token, members back to pending, sockets re-indexed', () => {
    const { hub } = makeHub();
    const room = hub.host('h', acct('h'), { tag: '' }) as Exclude<ReturnType<typeof hub.host>, string>;
    const oldToken = room.token;
    const a = hub.addMember(room, 'sa', acct('a'), 'player', null)!;
    const b = hub.addMember(room, 'sb', acct('b'), 'player', null)!;
    hub.admit(a);
    hub.admit(b);
    hub.startRelay('sb');
    const previous = hub.promote(room, a);
    expect(previous.userId).toBe('h');
    expect(room.host.userId).toBe('a');
    expect(room.hostPeerId).toBe(a.peerId);
    expect(room.token).not.toBe(oldToken);
    expect(hub.hostedBy('sa')).toBe(room);
    expect(hub.hostedBy('h')).toBeNull();
    expect(hub.memberOf('sa')).toBeNull();
    expect(b.admitted).toBe(false);
    expect(b.relay).toBe(false);
    expect(room.migrations).toBe(1);
  });

  it('fires the host timeout once after the grace, unless the host resumes', () => {
    const { hub, advance, timeouts } = makeHub();
    const room = hub.host('h', acct('h'), { tag: '' }) as Exclude<ReturnType<typeof hub.host>, string>;
    hub.hostDisconnected('h', () => 1000);
    advance(999);
    expect(timeouts).toEqual([]);
    expect(hub.resume('h2', acct('h'), room.code, room.token)).toBe(room);
    advance(5000);
    expect(timeouts).toEqual([]);
    hub.hostDisconnected('h2', () => 1000);
    advance(1000);
    expect(timeouts).toEqual([room.code]);
    advance(5000);
    expect(timeouts).toEqual([room.code]);
    expect(hub.resume('h3', acct('x'), room.code, room.token)).toBe('not-host');
    expect(hub.resume('h3', acct('h'), 'NOPE22', room.token)).toBe('not-found');
  });

  it('closing forgets the room, its sockets and its timer', () => {
    const { hub, advance, timeouts } = makeHub();
    const room = hub.host('h', acct('h'), { tag: '' }) as Exclude<ReturnType<typeof hub.host>, string>;
    hub.addMember(room, 'sa', acct('a'), 'player', null);
    hub.hostDisconnected('h', () => 10);
    expect(hub.close(room)).toHaveLength(1);
    expect(hub.close(room)).toEqual([]);
    advance(100);
    expect(timeouts).toEqual([]);
    expect(hub.room(room.code)).toBeNull();
    expect(hub.memberOf('sa')).toBeNull();
  });
});
