/**
 * The listen server round trip: page ↔ worker over a postMessage pair, the
 * MatchRunner on a fake clock, the real codecs both ways — the page joins,
 * picks a class, walks forward with predicted input and sees itself move in
 * the snapshots; stop shuts the match down.
 */
import { describe, expect, it } from 'vitest';
import { IN_FORWARD } from '../../core/constants';
import { LIFE_ALIVE } from '../../sim/entity';
import type { JoinedPayload } from '../../net/events';
import { createTf2MatchHost, StandStillBrain } from '../../server/tf2-match-host';
import { matchOptions, roomClientWorld, roomWorld, TICK_MS } from '../../server/match.test-support';
import { InputSender } from './input';
import {
  connectListenServer,
  httpObjectLoader,
  ListenServer,
  LISTEN_PLAYER_ID,
  type FromListenServer,
  type ToListenServer,
} from './listen-server';
import { Prediction } from './prediction';
import { SnapshotClient } from './snapshot-client';

describe('listen server', () => {
  it('runs a match in a "worker" with the online codecs and zero added latency', async () => {
    let clock = 0;
    const page: {
      postMessage(m: unknown, t: ArrayBuffer[]): void;
      onmessage: ((e: { data: unknown }) => void) | null;
    } = {
      postMessage: (m) => server.handle(m as ToListenServer),
      onmessage: null,
    };
    const server = new ListenServer(
      // Bots that stand still: this is about the transport, not a fight.
      (opts) =>
        createTf2MatchHost(opts, {
          world: roomWorld(),
          autoTeam: true,
          botBrain: () => new StandStillBrain(),
        }),
      (message: FromListenServer) => page.onmessage?.({ data: message }),
      { now: () => clock, autoRun: false },
    );

    const client = new SnapshotClient();
    const input = new InputSender();
    const cworld = roomClientWorld();
    const prediction = new Prediction(cworld, cworld.addPlayer('me'));
    let joined: JoinedPayload | null = null;
    let closed = false;
    const conn = connectListenServer(
      page,
      {
        opts: matchOptions({ matchId: 'LOCAL', botCount: 3, maxPlayers: 8 }),
        playerName: 'Offline',
      },
      {
        onJoined: (info) => (joined = info),
        onEvents: (data) => client.onReliable(data),
        onSnapshot: (data) => {
          const s = client.onSnapshot(data);
          const me = client.localPlayer();
          if (s && me)
            prediction.reconcile(
              {
                tick: s.tick,
                ackCmd: s.ackCmd,
                player: me,
                weapons: client.localWeapons(),
                rules: client.rules(),
              },
              clock,
            );
        },
        onClosed: () => (closed = true),
      },
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(joined).not.toBeNull();
    expect(joined!.playerId).toBe(LISTEN_PLAYER_ID);
    conn.command({ kind: 'class', cls: 'heavy' });

    let startX: number | null = null;
    for (let i = 0; i < 66 * 25; i++) {
      const cmd = input.createCommand(client.ackTick, (c) => {
        c.forwardMove = 450;
        c.buttons = IN_FORWARD;
      });
      prediction.addCommand(cmd);
      conn.sendInput(input.packet(client.ackTick, 4)!);
      clock += TICK_MS;
      server.matchRunner.pump();
      const me = client.localPlayer();
      if (me && me.lifeState === LIFE_ALIVE && client.rules()?.state === 4 && startX === null)
        startX = me.ox as number;
    }
    const me = client.localPlayer()!;
    expect(client.hello?.name).toBe('test');
    expect(client.roster.size).toBe(4);
    expect(me.cls).toBe(6);
    expect(me.lifeState).toBe(LIFE_ALIVE);
    expect(startX).not.toBeNull();
    // Facing +x on RED (yaw 0): walked a long way.
    expect(Math.abs((me.ox as number) - startX!)).toBeGreaterThan(200);
    // The prediction tracks the server (the only lag is one tick of postMessage).
    expect(
      Math.hypot(prediction.origin.x - (me.ox as number), prediction.origin.y - (me.oy as number)),
    ).toBeLessThan(40);
    expect(client.stats.errors.malformed).toBe(0);
    conn.stop();
    expect(server.matchRunner.matchCount).toBe(0);
    expect(closed).toBe(false);
  });

  it('httpObjectLoader maps 404 to null and other failures to errors', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('missing')) return new Response(null, { status: 404 });
      if (url.endsWith('broken')) return new Response(null, { status: 500 });
      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;
    const loader = httpObjectLoader('/api/tf2-game/assets', fake);
    expect(await loader.get('maps/index.json')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await loader.get('missing')).toBeNull();
    await expect(loader.get('broken')).rejects.toThrow(/500/);
    expect(calls[0]).toBe('/api/tf2-game/assets/maps/index.json');
  });
});
