import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * RMHTube hub, end to end over real sockets (see ./harness.ts).
 *
 * Each case pins a behaviour the room's sync depends on — most of them a
 * failure that shipped or was found in the 2026-10-11 audit: a disconnected
 * leader leaving nobody in control, the queue stalling on a finished video,
 * a duplicate `ended` skipping an unwatched item, leadership handed to someone
 * who is not there.
 */

vi.hoisted(() => {
  process.env.RMHTUBE_SYNC_HEARTBEAT_MS = '100';
  process.env.RMHTUBE_LEADER_FAILOVER_MS = '250';
  process.env.RMHTUBE_GRACE_MS = '60000';
  process.env.RMHTUBE_END_GRACE_S = '1';
});

vi.mock('../prisma-client', async () => {
  const { prismaStub } = await import('./harness');
  const stub = prismaStub();
  return { getPrismaClient: () => stub, disconnectPrisma: () => Promise.resolve() };
});

import { C2S } from '../../../lib/rmhtube/events';
import { extrapolate } from '../../../lib/rmhtube/sync-math';
import { startHub, waitFor, roomWith, sleep, type Hub, type TestUser } from './harness';

let hub: Hub;
beforeAll(async () => {
  hub = await startHub();
});
afterAll(async () => {
  await hub.stop();
});

const MP4_A = 'https://cdn.example.com/a.mp4';
const MP4_B = 'https://cdn.example.com/b.mp4';
const MP4_C = 'https://cdn.example.com/c.mp4';

let n = 0;
async function users(...names: string[]): Promise<TestUser[]> {
  n += 1;
  return Promise.all(names.map((name) => hub.connect(`${name}-${n}`)));
}

function nowPlaying(u: TestUser) {
  return u.actions.filter((a) => a.type === 'NOW_PLAYING');
}

function lastNowPlayingItemId(u: TestUser): string | undefined {
  const np = nowPlaying(u);
  return (np[np.length - 1]?.data.item as { id?: string } | undefined)?.id;
}

describe('RMHTube hub — timeline propagation', () => {
  it('the leader’s play, seek and pause reach every viewer as one anchor each', async () => {
    const [host, viewer] = await users('host', 'viewer');
    await roomWith(host, viewer);
    host.emit(C2S.QUEUE_ADD, { url: MP4_A });
    await waitFor(() => nowPlaying(viewer).length === 1, 'now playing');

    host.emit(C2S.SYNC_PLAY);
    await waitFor(() => viewer.lastState()?.playing, 'viewer sees play');

    host.emit(C2S.SYNC_SEEK, { time: 42 });
    const seeked = await waitFor(
      () => viewer.states.find((s) => s.currentTime >= 42 && s.currentTime < 43),
      'viewer sees seek',
    );
    expect(seeked.playing).toBe(true);

    host.emit(C2S.SYNC_PAUSE);
    const paused = await waitFor(
      () => viewer.states.find((s) => !s.playing && s.rev > seeked.rev),
      'viewer sees pause',
    );
    // A pause freezes the room at the effective position — never rewinds it.
    expect(paused.currentTime).toBeGreaterThanOrEqual(42);

    // Revisions only ever move forward.
    const revs = viewer.states.map((s) => s.rev);
    expect([...revs].sort((a, b) => a - b)).toEqual(revs);
  });

  it('a viewer cannot move the room', async () => {
    const [host, viewer] = await users('host', 'viewer');
    await roomWith(host, viewer);
    host.emit(C2S.QUEUE_ADD, { url: MP4_A });
    await waitFor(() => nowPlaying(viewer).length === 1, 'now playing');
    const before = host.states.length;

    viewer.emit(C2S.SYNC_PLAY);
    viewer.emit(C2S.SYNC_SEEK, { time: 99 });
    await sleep(300);
    expect(host.states.slice(before).every((s) => !s.playing && s.currentTime < 1)).toBe(true);
  });
});

describe('RMHTube hub — leadership', () => {
  it('the host can put any connected member in charge, and only they control playback', async () => {
    const [host, a, b] = await users('host', 'a', 'b');
    await roomWith(host, a, b);
    host.emit(C2S.QUEUE_ADD, { url: MP4_A });
    await waitFor(() => nowPlaying(b).length === 1, 'now playing');

    host.emit(C2S.ROOM_SET_LEADER, { targetUserId: a.id });
    await waitFor(
      () => b.actions.find((x) => x.type === 'LEADER_CHANGED' && x.data.newLeaderUserId === a.id),
      'leader changed to a',
    );

    // The old leader (the host) no longer drives the timeline…
    host.emit(C2S.SYNC_PLAY);
    await sleep(250);
    expect(b.lastState()?.playing ?? false).toBe(false);

    // …the new one does.
    a.emit(C2S.SYNC_PLAY);
    await waitFor(() => b.lastState()?.playing, 'a controls playback');

    // The host can take control back at any time.
    host.emit(C2S.ROOM_SET_LEADER, { targetUserId: host.id });
    await waitFor(
      () => b.actions.find((x) => x.type === 'LEADER_CHANGED' && x.data.newLeaderUserId === host.id),
      'host took control back',
    );
  });

  it('a viewer can ask for control; it is announced, never granted by itself', async () => {
    const [host, viewer] = await users('host', 'viewer');
    await roomWith(host, viewer);
    viewer.emit(C2S.ROOM_REQUEST_CONTROL);
    const req = await waitFor(
      () => host.actions.find((x) => x.type === 'CONTROL_REQUESTED'),
      'request announced',
    );
    expect(req.data.userId).toBe(viewer.id);
    // The leader asking for control it already has is a no-op.
    host.emit(C2S.ROOM_REQUEST_CONTROL);
    await sleep(200);
    expect(host.actions.filter((x) => x.type === 'CONTROL_REQUESTED')).toHaveLength(1);
    expect(host.actions.some((x) => x.type === 'LEADER_CHANGED')).toBe(false);
  });

  it('leadership cannot be handed to someone who is not connected', async () => {
    const [host, gone] = await users('host', 'gone');
    await roomWith(host, gone);
    gone.close();
    await sleep(100);
    host.emit(C2S.ROOM_SET_LEADER, { targetUserId: gone.id });
    await waitFor(() => host.errors.find((e) => e.code === 'NOT_CONNECTED'), 'refused');
    expect(host.actions.some((x) => x.type === 'LEADER_CHANGED')).toBe(false);
  });

  it('a disconnected leader fails over to someone present, and gets control back on return', async () => {
    const [host, leader, viewer] = await users('host', 'leader', 'viewer');
    const roomId = await roomWith(host, leader, viewer);
    host.emit(C2S.ROOM_SET_LEADER, { targetUserId: leader.id });
    await waitFor(() => viewer.actions.find((x) => x.type === 'LEADER_CHANGED'), 'leader set');

    leader.close();
    const failover = await waitFor(
      () =>
        viewer.actions.find(
          (x) => x.type === 'LEADER_CHANGED' && x.data.reason === 'failover',
        ),
      'failover',
      2_000,
    );
    // The host is present, so control goes to the host.
    expect(failover.data.newLeaderUserId).toBe(host.id);

    const back = await hub.connect(leader.id);
    back.emit(C2S.ROOM_JOIN, { roomId });
    const restored = await waitFor(
      () =>
        viewer.actions.find(
          (x) => x.type === 'LEADER_CHANGED' && x.data.reason === 'restored',
        ),
      'restored',
    );
    expect(restored.data.newLeaderUserId).toBe(leader.id);
  });

  it('a leader back within the failover window keeps control without a handover', async () => {
    const [host, leader] = await users('host', 'leader');
    const roomId = await roomWith(host, leader);
    host.emit(C2S.ROOM_SET_LEADER, { targetUserId: leader.id });
    await waitFor(() => host.actions.find((x) => x.type === 'LEADER_CHANGED'), 'leader set');
    const changes = () => host.actions.filter((x) => x.type === 'LEADER_CHANGED').length;
    const before = changes();

    leader.close();
    await sleep(50);
    const back = await hub.connect(leader.id);
    back.emit(C2S.ROOM_JOIN, { roomId });
    await sleep(500); // well past the 250 ms failover
    expect(changes()).toBe(before);
  });
});

describe('RMHTube hub — queue advancement', () => {
  it('a skip naming a stale item is ignored, so a duplicate `ended` never skips an unwatched video', async () => {
    const [host, viewer] = await users('host', 'viewer');
    await roomWith(host, viewer);
    host.emit(C2S.QUEUE_ADD, { url: MP4_A });
    host.emit(C2S.QUEUE_ADD, { url: MP4_B });
    host.emit(C2S.QUEUE_ADD, { url: MP4_C });
    const first = await waitFor(() => lastNowPlayingItemId(viewer), 'first item');

    // The player's `ended` fires, and a duplicate arrives right behind it.
    host.emit(C2S.QUEUE_SKIP, { itemId: first });
    host.emit(C2S.QUEUE_SKIP, { itemId: first });
    await waitFor(() => nowPlaying(viewer).length === 2, 'advanced once');
    await sleep(300);
    expect(nowPlaying(viewer)).toHaveLength(2);

    // A manual skip without an item id still works.
    host.emit(C2S.QUEUE_SKIP);
    await waitFor(() => nowPlaying(viewer).length === 3, 'manual skip');
  });

  it('a room playing past the end of a known-length item advances on its own', async () => {
    const [host, viewer] = await users('host', 'viewer');
    await roomWith(host, viewer);
    host.emit(C2S.QUEUE_ADD, { url: MP4_A });
    host.emit(C2S.QUEUE_ADD, { url: MP4_B });
    const first = await waitFor(() => lastNowPlayingItemId(viewer), 'first item');
    host.emit(C2S.QUEUE_META, { itemId: first, duration: 1, live: false });
    host.emit(C2S.SYNC_PLAY);
    // Nobody reports `ended` (the leader's tab froze). 1 s item + 1 s grace.
    await waitFor(() => nowPlaying(viewer).length === 2, 'overrun advance', 4_000);
  });
});

describe('RMHTube hub — waiting for a buffering viewer', () => {
  it('pauses the room for a stalled viewer and resumes when they recover', async () => {
    const [host, viewer] = await users('host', 'viewer');
    await roomWith(host, viewer);
    host.emit(C2S.QUEUE_ADD, { url: MP4_A });
    await waitFor(() => nowPlaying(viewer).length === 1, 'now playing');
    host.emit(C2S.SYNC_PLAY);
    await waitFor(() => viewer.lastState()?.playing, 'playing');

    viewer.emit(C2S.SYNC_STALL, { stalled: true });
    const playingRev = viewer.lastState()!.rev;
    const held = await waitFor(
      () => host.states.find((s) => !s.playing && s.rev > playingRev),
      'room paused for the viewer',
    );
    const heldAt = extrapolate(held, held.updatedAt);

    viewer.emit(C2S.SYNC_STALL, { stalled: false });
    const resumed = await waitFor(
      () => host.states.find((s) => s.playing && s.rev > held.rev),
      'room resumed',
    );
    // It resumes from where it held — nobody is skipped past what they missed.
    expect(resumed.currentTime).toBeGreaterThanOrEqual(heldAt - 0.01);
    expect(resumed.currentTime - heldAt).toBeLessThan(0.5);
  });
});
