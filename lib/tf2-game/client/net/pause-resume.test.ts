/**
 * Offline pause (the pause menu / the in-game HUD editor over a listen-server
 * match) resumes without a visible correction: the listen server holds the
 * match on the tick it stopped on, the client holds its render clock with it
 * and rebases it on resume (RenderClock.hold / release), and the prediction
 * carries on — its pending commands are still the server's next ones.
 */
// Loaded first: the sim's item modules import each other in a cycle that only resolves from here.
import '../../sim/items/hooks';
import { describe, expect, it } from 'vitest';
import { IN_FORWARD, TICK_INTERVAL } from '../../core/constants';
import { LIFE_ALIVE } from '../../sim/entity';
import { createTf2MatchHost, StandStillBrain } from '../../server/tf2-match-host';
import { matchOptions, roomClientWorld, roomWorld, TICK_MS } from '../../server/match.test-support';
import { InputSender } from './input';
import { RenderClock } from './interpolation';
import {
  connectListenServer,
  ListenServer,
  type FromListenServer,
  type ToListenServer,
} from './listen-server';
import { Prediction } from './prediction';
import { SnapshotClient } from './snapshot-client';

describe('offline pause and resume', () => {
  it('keeps the prediction error under a unit after a 5 s pause, walking straight through it', async () => {
    let now = 0;
    const page: {
      postMessage(m: unknown): void;
      onmessage: ((e: { data: unknown }) => void) | null;
    } = {
      postMessage: (m) => server.handle(m as ToListenServer),
      onmessage: null,
    };
    const server = new ListenServer(
      (opts) =>
        createTf2MatchHost(opts, {
          world: roomWorld(),
          autoTeam: true,
          botBrain: () => new StandStillBrain(),
        }),
      (message: FromListenServer) => page.onmessage?.({ data: message }),
      { now: () => now, autoRun: false },
    );
    const client = new SnapshotClient();
    const input = new InputSender();
    const cworld = roomClientWorld();
    const prediction = new Prediction(cworld, cworld.addPlayer('me'));
    const clock = new RenderClock();
    let corrections: number[] | null = null;
    const conn = connectListenServer(
      page,
      {
        opts: matchOptions({ matchId: 'LOCAL', botCount: 1, maxPlayers: 4 }),
        playerName: 'Offline',
      },
      {
        onJoined: () => {},
        onEvents: (data) => client.onReliable(data),
        onSnapshot: (data) => {
          const s = client.onSnapshot(data);
          const me = client.localPlayer();
          if (!s || !me) return;
          clock.onSnapshot(s.tick, now);
          prediction.reconcile(
            {
              tick: s.tick,
              ackCmd: s.ackCmd,
              player: me,
              weapons: client.localWeapons(),
              rules: client.rules(),
            },
            now,
          );
          corrections?.push(prediction.lastCorrection);
        },
        onClosed: () => {},
      },
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    conn.command({ kind: 'class', cls: 'soldier' });

    const walk = (ticks: number) => {
      for (let i = 0; i < ticks; i++) {
        clock.serverTime(now);
        const cmd = input.createCommand(client.ackTick, (c) => {
          c.forwardMove = 450;
          c.buttons = IN_FORWARD;
        });
        prediction.addCommand(cmd);
        conn.sendInput(input.packet(client.ackTick, 4)!);
        now += TICK_MS;
        server.matchRunner.pump();
      }
    };
    // Until the round is on and we are walking.
    for (
      let i = 0;
      i < 66 * 30 &&
      !(client.rules()?.state === 4 && client.localPlayer()?.lifeState === LIFE_ALIVE);
      i++
    )
      walk(1);
    walk(10);
    expect(client.localPlayer()?.lifeState).toBe(LIFE_ALIVE);
    // Mid-stride: commands are in flight (predicted, not yet acknowledged).
    walk(1);
    const x0 = prediction.origin.x;

    // Pause for five seconds: nothing ticks, nothing is sent; the render clock stands still.
    conn.pause(true);
    const held = clock.serverTime(now);
    clock.hold(now);
    now += 5000;
    server.matchRunner.pump();
    expect(clock.serverTime(now)).toBe(held);

    // Resume: the clock carries on from the pause (no 5 s jump), and the prediction from its commands.
    conn.pause(false);
    clock.release(now);
    expect(Math.abs(clock.serverTime(now) - held)).toBeLessThan(TICK_INTERVAL);
    corrections = [];
    prediction.maxMisprediction = 0;
    walk(66);
    // A snapshot every other tick: every one of them reconciled.
    expect(corrections.length).toBeGreaterThan(25);
    expect(Math.max(...corrections)).toBeLessThan(1);
    expect(prediction.maxMisprediction).toBeLessThan(1);
    // And it kept walking.
    expect(Math.abs(prediction.origin.x - x0)).toBeGreaterThan(50);
    conn.stop();
  });

  it('holds the render clock still and rebases it by exactly the time held', () => {
    const clock = new RenderClock();
    // Snapshots every tick, arriving on time.
    let t = 0;
    for (let tick = 100; tick < 200; tick++) {
      clock.onSnapshot(tick, t);
      clock.serverTime(t);
      t += TICK_INTERVAL * 1000;
    }
    const before = clock.serverTime(t);
    clock.hold(t);
    expect(clock.isHeld).toBe(true);
    // A snapshot that was in flight lands during the hold: it counts as arriving at the hold.
    clock.onSnapshot(200, t + 3);
    expect(clock.serverTime(t + 2500)).toBe(before);
    clock.release(t + 5000);
    const after = clock.serverTime(t + 5000);
    expect(Math.abs(after - before)).toBeLessThan(0.002);
    // Then it runs at the server's pace again, fed by the resumed snapshots.
    let u = t + 5000;
    for (let tick = 201; tick < 260; tick++) {
      u += TICK_INTERVAL * 1000;
      clock.onSnapshot(tick, u);
      clock.serverTime(u);
    }
    expect(clock.serverTime(u)).toBeCloseTo(259 * TICK_INTERVAL, 1);
  });
});
