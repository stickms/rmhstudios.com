/**
 * Prediction end to end: a Tf2MatchHost (synthetic room) and a client that
 * predicts its movement through the real codecs over a link with 100 ms round
 * trip, ±10 ms jitter and 2 % loss each way. With deterministic input the
 * client's prediction of every command matches where the server put the
 * player after running it to within 1 unit (the server runs exactly the
 * client's commands — late ones are not repeated — so the only error is wire
 * precision), and reconciliation never has to snap.
 */
import { describe, expect, it } from 'vitest';
import { IN_FORWARD, IN_JUMP, IN_MOVELEFT, IN_MOVERIGHT } from '../../core/constants';
import { copy, vec3, type Vec3 } from '../../core/vec';
import { LIFE_ALIVE } from '../../sim/entity';
import { GR_STATE_RND_RUNNING } from '../../sim/rules';
import { Tf2MatchHost } from '../../server/tf2-match-host';
import type { OutgoingPacket } from '../../server/match-host';
import {
  Link,
  matchOptions,
  roomClientWorld,
  roomWorld,
  TICK_MS,
} from '../../server/match.test-support';
import { InputSender } from './input';
import { Prediction } from './prediction';
import { SnapshotClient } from './snapshot-client';

interface RunResult {
  firstPredictionError: number;
  reconcileError: number;
  compared: number;
  snaps: number;
  reconciles: number;
  lostSnapshots: number;
}

function runScenario(
  seconds: number,
  opts: { latency: number; jitter: number; loss: number; seed: number },
): RunResult {
  const host = new Tf2MatchHost(matchOptions({ maxPlayers: 4 }), {
    world: roomWorld(opts.seed),
    autoTeam: true,
  });
  host.addPlayer(1, { name: 'me' });
  host.onCommand(1, { kind: 'class', cls: 'scout' });
  const serverPlayer = host.playerOf(1)!;

  const client = new SnapshotClient();
  const input = new InputSender();
  const cworld = roomClientWorld();
  const local = cworld.addPlayer('me');
  const prediction = new Prediction(cworld, local);

  const up = new Link<Uint8Array>(opts.latency / 2, opts.jitter, opts.loss, opts.seed + 1);
  const down = new Link<OutgoingPacket>(opts.latency / 2, opts.jitter, opts.loss, opts.seed + 2);

  const serverAt = new Map<number, Vec3>();
  const firstPrediction = new Map<number, Vec3>();
  /** Commands the server ran while the round was live and the player alive (comparable). */
  const comparable = new Set<number>();
  let liveSince = -1;
  let reconciles = 0;
  let reconcileErr = 0;
  let frame = 0;
  const total = seconds * 1000;

  for (let t = 0; t <= total; t++) {
    for (const p of up.receive(t)) host.onInput(1, p);
    if (t % TICK_MS === 0 && t > 0) {
      host.tick();
      const w = host.world;
      const live = w.rules.state === GR_STATE_RND_RUNNING && serverPlayer.lifeState === LIFE_ALIVE;
      if (live && liveSince < 0) liveSince = w.tickCount;
      const ran = host.lastCommandRun(1);
      if (ran > 0 && !serverAt.has(ran)) {
        serverAt.set(ran, copy(vec3(), serverPlayer.origin));
        // Skip the first half second of the round (the client learns of the round state one snapshot late).
        if (live && w.tickCount > liveSince + 33) comparable.add(ran);
      }
      for (const p of host.drainOutgoing()) down.send(t, p, !p.reliable);
    }
    for (const p of down.receive(t)) {
      if (p.reliable) {
        client.onReliable(p.data);
        continue;
      }
      const snap = client.onSnapshot(p.data);
      const me = client.localPlayer();
      if (!snap || !me) continue;
      prediction.reconcile(
        {
          tick: snap.tick,
          ackCmd: snap.ackCmd,
          player: me,
          weapons: client.localWeapons(),
          rules: client.rules(),
        },
        t,
      );
      reconciles++;
      if (comparable.has(snap.ackCmd))
        reconcileErr = Math.max(reconcileErr, prediction.lastMisprediction);
    }
    // Client frames at 66.67 Hz, out of phase with the server.
    if ((t + 7) % TICK_MS === 0) {
      frame++;
      const f = frame;
      const cmd = input.createCommand(client.ackTick + 7, (c) => {
        c.viewAngles.y = (f * 0.7) % 360;
        c.viewAngles.x = 10 * Math.sin(f / 50);
        c.forwardMove = 450;
        c.buttons = IN_FORWARD;
        const phase = Math.floor(f / 90) % 3;
        if (phase === 1) {
          c.sideMove = 450;
          c.buttons |= IN_MOVERIGHT;
        } else if (phase === 2) {
          c.sideMove = -450;
          c.buttons |= IN_MOVELEFT;
        }
        if (f % 97 < 2) c.buttons |= IN_JUMP;
      });
      prediction.addCommand(cmd);
      const predicted = prediction.predictedOrigin(cmd.commandNumber);
      if (predicted) firstPrediction.set(cmd.commandNumber, copy(vec3(), predicted));
      const packet = input.packet(client.ackTick, 4);
      if (packet) up.send(t, packet, true);
    }
  }

  let firstErr = 0;
  let compared = 0;
  for (const n of comparable) {
    const s = serverAt.get(n)!;
    const p = firstPrediction.get(n);
    if (!p) continue;
    compared++;
    firstErr = Math.max(firstErr, Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z));
  }
  return {
    firstPredictionError: firstErr,
    reconcileError: reconcileErr,
    compared,
    snaps: prediction.snaps,
    reconciles,
    lostSnapshots: down.dropped,
  };
}

describe('client prediction', () => {
  it('stays within 1 unit of the server at 100 ms RTT, jitter and 2 % loss', () => {
    const r = runScenario(30, { latency: 100, jitter: 10, loss: 0.02, seed: 3 });
    expect(r.compared).toBeGreaterThan(1000);
    expect(r.reconciles).toBeGreaterThan(800);
    expect(r.snaps).toBeLessThanOrEqual(1); // the spawn
    expect(r.lostSnapshots).toBeGreaterThan(0);
    expect(r.firstPredictionError).toBeLessThan(1);
    expect(r.reconcileError).toBeLessThan(1);
  });

  it('holds with heavier jitter (commands arrive in bursts)', () => {
    const r = runScenario(15, { latency: 160, jitter: 40, loss: 0.05, seed: 8 });
    expect(r.compared).toBeGreaterThan(250);
    expect(r.firstPredictionError).toBeLessThan(1);
    expect(r.reconcileError).toBeLessThan(1);
  });
});
