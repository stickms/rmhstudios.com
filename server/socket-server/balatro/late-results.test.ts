/**
 * HUD-24 late results on the hub (handlers/balatro-p2p.ts `balatro:match:result` /
 * `balatro:match:pending` over ./results.ts): who may report a finished run, who hears it
 * (only roster players the hub seated who are no longer in the room — never spectators,
 * outsiders or players still linked), push vs queue, once per run, host migration, TTL and the
 * per-account / global caps.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBalatroP2pDisconnect, registerBalatroP2pHandlers, resetBalatroP2pForTests } from '../handlers/balatro-p2p';
import { all, last, makeWorld, type FakeSocket } from '../test-support/fake-world';
import { BALATRO_S2C, type BalatroS2CPayload } from '@/lib/balatro/net/events';
import { enqueue, LATE_RESULT_LIMITS, queuedCount, resetLateResultsForTests, resultFor, take } from './results';
import { ROSTERS_MAX } from './directory';

process.env.LOG_LEVEL = 'silent';

const HASH = `${'a'.repeat(24)}-v1`;
const HOST = { kind: 'private', queueMode: 'pvp_nemesis', maxPlayers: 4, contentHash: HASH, spectatable: true };
type Result = BalatroS2CPayload<'balatro:match:result'>;

let world: ReturnType<typeof makeWorld>;
let nextId = 0;

function connect(userId: string): FakeSocket {
  nextId += 1;
  return world.connect(`lsock-${nextId}`, { userId, userName: userId, avatarUrl: null });
}

function disconnect(s: FakeSocket): void {
  handleBalatroP2pDisconnect(world.io, s as never);
  world.disconnect(s);
}

const errors = (s: FakeSocket) => all<{ event: string; code: string }>(s, 'balatro:p2p:error').map((e) => `${e.event}:${e.code}`);
const results = (s: FakeSocket) => all<Result>(s, 'balatro:match:result');

function host(s: FakeSocket): string {
  world.send(s, 'balatro:p2p:host', HOST);
  const hosted = last<{ code: string }>(s, 'balatro:p2p:hosted');
  if (!hosted) throw new Error('not hosted');
  return hosted.code;
}

function joinAdmitted(h: FakeSocket, m: FakeSocket, code: string, role: 'player' | 'spectator' = 'player'): void {
  world.send(m, 'balatro:p2p:join', { code, contentHash: HASH, role });
  const req = last<{ peerId: string }>(h, 'balatro:p2p:join-request');
  if (!req) throw new Error('no join request');
  world.send(h, 'balatro:p2p:admit', { peerId: req.peerId, accept: true });
}

function started(h: FakeSocket, runId: string | null, members: string[]): void {
  world.send(h, 'balatro:p2p:state', {
    open: false,
    started: runId !== null,
    runId,
    members,
    successor: null,
    spectatable: true,
    summary: { players: members.length, ante: 1 },
  });
}

const report = (s: FakeSocket, runId: string, over: Record<string, unknown> = {}) =>
  world.send(s, 'balatro:match:result', { runId, draw: false, winners: ['alice'], places: {}, ...over });

/** alice hosts bob, carol and dave (players) plus sam (spectator); the run `run1` starts. */
function match() {
  const alice = connect('alice');
  const code = host(alice);
  const bob = connect('bob');
  const carol = connect('carol');
  const dave = connect('dave');
  const sam = connect('sam');
  for (const m of [bob, carol, dave]) joinAdmitted(alice, m, code);
  joinAdmitted(alice, sam, code, 'spectator');
  // The host also names sam and an outsider: the hub only keeps accounts it seated.
  started(alice, 'run1', ['alice', 'bob', 'carol', 'dave', 'sam', 'mallory']);
  for (const s of [alice, bob, carol, dave, sam]) world.send(s, 'balatro:match:pending', {});
  return { alice, bob, carol, dave, sam, code };
}

beforeEach(() => {
  world = makeWorld(registerBalatroP2pHandlers);
});

afterEach(() => {
  for (const s of world.sockets.values()) {
    for (const r of s.received) {
      const schema = (BALATRO_S2C as Record<string, { safeParse(v: unknown): { success: boolean } }>)[r.event];
      if (schema) expect(schema.safeParse(r.payload).success, `${r.event} ${JSON.stringify(r.payload)}`).toBe(true);
    }
  }
  vi.useRealTimers();
  resetBalatroP2pForTests();
});

describe('who may report a result', () => {
  it('a member (not the host) cannot, and nobody hears anything', () => {
    const { bob, carol } = match();
    world.send(carol, 'balatro:p2p:leave', {});
    report(bob, 'run1', { winners: ['bob'] });
    expect(errors(bob)).toEqual(['balatro:match:result:not-host']);
    expect(results(carol)).toEqual([]);
  });

  it('the host of another room cannot report this run', () => {
    const { carol } = match();
    world.send(carol, 'balatro:p2p:leave', {});
    const eve = connect('eve');
    host(eve);
    report(eve, 'run1');
    expect(errors(eve)).toEqual(['balatro:match:result:not-found']);
    expect(results(carol)).toEqual([]);
  });

  it('an unknown or never-started run is not-found; a signed-out socket is auth-required', () => {
    const { alice } = match();
    report(alice, 'run9');
    expect(errors(alice)).toEqual(['balatro:match:result:not-found']);
    const anon = world.connect('lsock-anon', {});
    world.send(anon, 'balatro:match:result', { runId: 'run1', draw: false, winners: [], places: {} });
    world.send(anon, 'balatro:match:pending', {});
    expect(errors(anon)).toEqual(['balatro:match:result:auth-required', 'balatro:match:pending:auth-required']);
  });

  it('malformed reports are refused by the contract', () => {
    const { alice, carol } = match();
    world.send(carol, 'balatro:p2p:leave', {});
    world.send(alice, 'balatro:match:result', { runId: 'run1', draw: false, winners: [], places: { carol: 0 } });
    world.send(alice, 'balatro:match:result', { runId: 'run1', winners: [] });
    expect(results(carol)).toEqual([]);
    report(alice, 'run1');
    expect(results(carol)).toEqual([{ runId: 'run1', r: 'lost' }]);
  });

  it('is rate limited', () => {
    const { alice } = match();
    for (let i = 0; i < 15; i += 1) report(alice, `nope${i}`);
    expect(errors(alice).filter((e) => e.endsWith('rate-limited')).length).toBeGreaterThan(0);
  });
});

describe('who hears it', () => {
  it('only roster players no longer in the room: not linked players, spectators or outsiders', () => {
    const { alice, bob, carol, dave, sam } = match();
    const mallory = connect('mallory');
    world.send(mallory, 'balatro:match:pending', {});
    world.send(carol, 'balatro:p2p:leave', {});
    report(alice, 'run1', { winners: ['bob'], places: { bob: 1, dave: 2, carol: 3, alice: 4 } });
    expect(results(carol)).toEqual([{ runId: 'run1', r: 'lost', place: 3 }]);
    for (const s of [alice, bob, dave, sam, mallory]) expect(results(s)).toEqual([]);
  });

  it('each receiver gets their own line: won, draw, lost, team wins', () => {
    const { alice, bob, carol, dave } = match();
    for (const s of [bob, carol, dave]) world.send(s, 'balatro:p2p:leave', {});
    report(alice, 'run1', { winners: ['bob', 'dave'] });
    expect(results(bob)).toEqual([{ runId: 'run1', r: 'won' }]);
    expect(results(dave)).toEqual([{ runId: 'run1', r: 'won' }]);
    expect(results(carol)).toEqual([{ runId: 'run1', r: 'lost' }]);
    expect(resultFor({ runId: 'r', draw: true, winners: ['x'], places: {} }, 'x')).toEqual({ runId: 'r', r: 'draw' });
    expect(resultFor({ runId: 'r', draw: false, winners: [], places: { x: 1 } }, 'x')).toEqual({ runId: 'r', r: 'lost' });
    expect(resultFor({ runId: 'r', draw: false, winners: [], places: { x: 2 } }, 'toString')).toEqual({ runId: 'r', r: 'lost' });
  });

  it('once per run: a repeated report (referee re-send, a successor) changes nothing', () => {
    const { alice, carol } = match();
    world.send(carol, 'balatro:p2p:leave', {});
    report(alice, 'run1');
    report(alice, 'run1', { winners: ['carol'] });
    expect(results(carol)).toEqual([{ runId: 'run1', r: 'lost' }]);
  });

  it('a player who closed the tab hears it when a new page asks (within the TTL), once', () => {
    vi.useFakeTimers();
    const { alice, carol } = match();
    disconnect(carol);
    report(alice, 'run1', { winners: ['carol'] });
    expect(queuedCount()).toBe(1);
    vi.advanceTimersByTime(LATE_RESULT_LIMITS.TTL_MS - 1_000);
    const page = connect('carol');
    world.send(page, 'balatro:match:pending', {});
    expect(results(page)).toEqual([{ runId: 'run1', r: 'won' }]);
    world.send(page, 'balatro:match:pending', {});
    expect(results(page)).toHaveLength(1);
  });

  it('a notice expires after the TTL', () => {
    vi.useFakeTimers();
    const { alice, carol } = match();
    disconnect(carol);
    report(alice, 'run1');
    vi.advanceTimersByTime(LATE_RESULT_LIMITS.TTL_MS + 1);
    const page = connect('carol');
    world.send(page, 'balatro:match:pending', {});
    expect(results(page)).toEqual([]);
  });

  it('a page that has not asked yet gets it queued; one that asked gets it pushed', () => {
    const { alice, carol } = match();
    const other = connect('carol'); // a tab of carol's on another game: never asked
    world.send(carol, 'balatro:p2p:leave', {});
    report(alice, 'run1');
    expect(results(carol)).toHaveLength(1);
    expect(results(other)).toEqual([]);
    expect(queuedCount()).toBe(0);
  });
});

describe('host migration', () => {
  it('the successor reports the run; the departed host hears it; the old host cannot report', () => {
    const { alice, bob, carol } = match();
    world.send(alice, 'balatro:p2p:leave', {}); // the host leaves: bob (earliest connected player) takes over
    expect(last(bob, 'balatro:p2p:promote')).toBeDefined();
    report(alice, 'run1');
    expect(errors(alice)).toEqual(['balatro:match:result:not-host']);
    report(bob, 'run1', { winners: ['carol'], places: { carol: 1, dave: 2, bob: 3, alice: 4 } });
    expect(results(alice)).toEqual([{ runId: 'run1', r: 'lost', place: 4 }]);
    expect(results(carol)).toEqual([]);
  });
});

describe('bounds', () => {
  it('rosters per room are bounded', () => {
    const { alice, carol } = match();
    world.send(carol, 'balatro:p2p:leave', {});
    for (let i = 0; i < ROSTERS_MAX; i += 1) started(alice, `next${i}`, ['alice']);
    report(alice, 'run1');
    expect(errors(alice)).toEqual(['balatro:match:result:not-found']);
  });

  it('per account: at most PER_USER notices, newest kept, one per run', () => {
    for (let i = 0; i < LATE_RESULT_LIMITS.PER_USER + 3; i += 1) enqueue('u', { runId: `r${i}`, r: 'lost' }, 1_000);
    enqueue('u', { runId: `r${LATE_RESULT_LIMITS.PER_USER + 2}`, r: 'won' }, 1_000);
    const got = take('u', 1_000);
    expect(got).toHaveLength(LATE_RESULT_LIMITS.PER_USER);
    expect(got[got.length - 1]).toEqual({ runId: `r${LATE_RESULT_LIMITS.PER_USER + 2}`, r: 'won' });
    expect(take('u', 1_000)).toEqual([]);
  });

  it('globally: at most MAX_USERS accounts hold notices (the oldest go)', () => {
    resetLateResultsForTests();
    for (let i = 0; i < LATE_RESULT_LIMITS.MAX_USERS + 10; i += 1) enqueue(`u${i}`, { runId: 'r', r: 'lost' }, 0);
    expect(queuedCount()).toBe(LATE_RESULT_LIMITS.MAX_USERS);
    expect(take('u0', 0)).toEqual([]);
    expect(take(`u${LATE_RESULT_LIMITS.MAX_USERS + 9}`, 0)).toHaveLength(1);
  });
});
