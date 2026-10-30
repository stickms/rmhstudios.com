/**
 * A CS:GO match hosted peer-to-peer, unchanged engine plumbing: the real ListenServer → MatchRunner →
 * CsMatchHost (synthetic two-site map, bots), the real P2pHostSession, one member over the in-memory
 * DataChannel pair (fake-channel.test-support.ts) with latency, jitter and loss — the member joins,
 * decodes CS snapshots (its private cs_player block, its cs_weapon records, the cs_rules proxy) and
 * the CS events, sends input that moves it on the host, and buys through the console command.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { IN_FORWARD } from '../../tf2-game/core/constants';
import type { JoinedPayload } from '../../tf2-game/net/events';
import { matchOptions, TICK_MS } from '../../tf2-game/server/match.test-support';
import {
  connectListenServer,
  ListenServer,
  LISTEN_PLAYER_ID,
  type FromListenServer,
  type ToListenServer,
} from '../../tf2-game/client/net/listen-server';
import { InputSender } from '../../tf2-game/client/net/input';
import { SnapshotClient } from '../../tf2-game/client/net/snapshot-client';
import { P2pHostSession } from '../../tf2-game/net/p2p/host-session';
import { PeerLink } from '../../tf2-game/net/p2p/link';
import { P2pPeerClient } from '../../tf2-game/net/p2p/peer-client';
import { FakeNet, fakeConnection } from '../../tf2-game/net/p2p/fake-channel.test-support';
import { P2P_SNAPSHOT_MAX_BYTES } from '../../tf2-game/net/p2p/wire';
import { NAV_HULL_CS, NavGenerator } from '../../tf2-game/bots/nav/generate';
import {
  asMapCollision,
  csCollision,
  csNavBsp,
  csTestWorld,
  setupCs,
} from '../__fixtures__/cs-world';
import { createCsMatchHost, type CsMatchHost } from './cs-match-host';

beforeAll(setupCs);

const CODE = 'CSGDE2';

describe('CS:GO peer-to-peer', () => {
  it('a member plays a CsMatchHost through the listen server and the P2P host session', async () => {
    const net = new FakeNet();
    const nav = new NavGenerator(csNavBsp(), asMapCollision(csCollision()), {
      hull: NAV_HULL_CS,
    }).run();
    let match: CsMatchHost | null = null;
    const page: {
      postMessage(m: unknown, t: ArrayBuffer[]): void;
      onmessage: ((e: { data: unknown }) => void) | null;
    } = {
      postMessage: (m) => server.handle(m as ToListenServer),
      onmessage: null,
    };
    const server = new ListenServer(
      async (opts, host, controls) => {
        match = await createCsMatchHost(opts, {
          world: csTestWorld({ seed: 3, settings: { freezeTime: 2 } }),
          nav,
          autoTeam: host.autoTeam ?? true,
          snapshotMaxBytes: host.snapshotMaxBytes,
          console: { kind: 'listen', ownerId: controls.localPlayerId },
        });
        return match;
      },
      (message: FromListenServer) => page.onmessage?.({ data: message }),
      { now: () => net.now, autoRun: false },
    );
    const local = new SnapshotClient();
    let joined: JoinedPayload | null = null;
    // eslint-disable-next-line prefer-const -- assigned after the connection it reads
    let session: P2pHostSession;
    const conn = connectListenServer(
      page,
      {
        opts: matchOptions({
          game: 'csgo',
          variant: 'de',
          map: 'de_dust2',
          matchId: CODE,
          maxPlayers: 6,
          botCount: 4,
        }),
        playerName: 'Host',
        host: { autoTeam: true, snapshotMaxBytes: P2P_SNAPSHOT_MAX_BYTES },
      },
      {
        onJoined: (j) => (joined = j),
        onEvents: (d) => local.onReliable(d),
        onSnapshot: (d) => local.onSnapshot(d),
        onSummary: (s) => session.onSummary(s),
        onPeerFrame: (tick, packets) => session.deliver(tick, packets),
      },
    );
    session = new P2pHostSession({
      code: CODE,
      map: 'de_dust2',
      mode: 'ctf',
      name: 'Dust II',
      maxPlayers: 6,
      hostUserId: 'user-host',
      hostName: 'Host',
      localPlayerId: LISTEN_PLAYER_ID,
      match: conn.peers,
      now: () => net.now,
    });
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    expect(joined).not.toBeNull();
    expect(match).not.toBeNull();

    // The member: admitted (the hub vouched for its account), its link opened.
    const res = session.admit({
      code: CODE,
      peerId: 'peermember01',
      userId: 'user-m',
      name: 'Member',
    });
    if (!res.accept) throw new Error(res.reason);
    const channels = fakeConnection(net, {
      latencyMs: 30,
      jitterMs: 4,
      loss: 0.02,
      reorder: true,
      seed: 9,
    });
    const handlers = session.linkHandlers('peermember01');
    const hostLink: PeerLink = new PeerLink({
      unreliable: channels.host.unreliable,
      reliable: channels.host.reliable,
      now: () => net.now,
      tickNow: () => session.tickNow(),
      onUnreliable: handlers.onUnreliable,
      onReliable: handlers.onReliable,
      onClose: handlers.onClose,
      onOpen: () => session.attach('peermember01', hostLink, 'direct'),
    });
    const snap = new SnapshotClient();
    const input = new InputSender();
    const events: string[] = [];
    let memberJoined: JoinedPayload | null = null;
    const client = new P2pPeerClient({
      unreliable: channels.member.unreliable,
      reliable: channels.member.reliable,
      now: () => net.now,
      handlers: {
        onJoined: (j) => (memberJoined = j),
        onEvents: (d) => {
          const r = snap.onReliable(d);
          if (r) for (const e of r.events) events.push(e.event.type);
          for (const b of snap.takeDeferred()) snap.onSnapshot(b);
        },
        onSnapshot: (d) => snap.onSnapshot(d),
        onChat: () => {},
        onPeers: () => {},
        onEnded: () => {},
      },
    });

    let frame = 0;
    let bought = false;
    const runUntil = (until: number) => {
      for (let t = Math.floor(net.now) + 1; t <= until; t++) {
        net.advance(t);
        if (t % TICK_MS === 0) server.matchRunner.pump();
        if ((t + 7) % TICK_MS === 0 && memberJoined) {
          frame++;
          input.createCommand(snap.ackTick + 7, (c) => {
            c.viewAngles.y = 0;
            c.forwardMove = frame > 300 ? 450 : 0;
            c.buttons = frame > 300 ? IN_FORWARD : 0;
          });
          const packet = input.packet(snap.ackTick, 4);
          if (packet) client.sendInput(packet);
          // A buy in the freeze time, through the console's server command.
          if (!bought && snap.localPlayer() && (snap.localPlayer()!.money as number) >= 650) {
            bought = true;
            client.command({ kind: 'extra', command: 'buy', args: ['vest'] });
          }
        }
        if (t % 100 === 0) {
          session.update();
          client.update();
        }
      }
    };
    runUntil(12_000);

    expect(memberJoined).not.toBeNull();
    expect(snap.hello?.mode).toBe('de');
    expect(snap.stats.snapshots).toBeGreaterThan(200);
    const me = snap.localPlayer();
    expect(me).not.toBeNull();
    // The private CS block reached its owner; the armor bought through the console arrived too.
    expect(me!.health).toBe(100);
    expect(me!.armor).toBe(100);
    expect(typeof me!.money).toBe('number');
    expect(me!.weaponName).toMatch(/^weapon_/);
    const weapons = snap.localWeapons();
    expect(weapons.length).toBeGreaterThanOrEqual(2);
    expect(weapons.every((w) => typeof w.record.reserve === 'number')).toBe(true);
    let rulesSeen = false;
    snap.forEachEntity((state, rec) => {
      if (state.schema.type === 'cs_rules') rulesSeen = rec.mode === 'de';
    });
    expect(rulesSeen).toBe(true);
    expect(events).toContain('cs_round');
    // The member's input moved it on the host (it ran east after frame 300).
    const p = match!.csPlayerOf(res.playerId)!;
    expect(p.alive || p.stats.deaths > 0).toBe(true);
    expect(match!.lastCommandRun(res.playerId)).toBeGreaterThan(500);
    expect(snap.stats.errors['unknown-schema']).toBe(0);
  }, 120_000);
});
