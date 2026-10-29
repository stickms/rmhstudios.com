/**
 * Tf2MatchHost: joining (team → class → spawn), bots filling the server, the
 * reliable stream (hello, roster, voice, scores), generic extra commands,
 * summaries; the map package loader; and, with TF2_ROOT, ctf_2fort under load:
 * 24 players inside the snapshot budget, and an in-process MatchRunner for
 * 60 s with 12 bots and 2 scripted clients under 40 KB/s per client.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IN_FORWARD,
  TEAM_UNASSIGNED,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../core/constants';
import { Entity, LIFE_ALIVE } from '../sim/entity';
import { registerEntityClass } from '../sim/entity-registry';
import { writeHullsBin } from '../assets/map-manifest';
import { SNAPSHOT_MAX_BYTES } from '../net/snapshot';
import { registerExtraCommand } from '../net/extra-commands';
import { InputSender } from '../client/net/input';
import { SnapshotClient, type TimedEvent } from '../client/net/snapshot-client';
import { MatchRunner } from './match-runner';
import type { FromWorker } from './worker-protocol';
import {
  createTf2MatchHost,
  loadMapPackage,
  Tf2MatchHost,
  type GameObjectLoader,
} from './tf2-match-host';
import {
  load2fort,
  matchOptions,
  ROOT,
  roomWorld,
  TICK_MS,
  WanderBrain,
} from './match.test-support';

function pump(
  host: Tf2MatchHost,
  clients: Map<number, SnapshotClient>,
  ticks: number,
  events: TimedEvent[] = [],
): void {
  for (let i = 0; i < ticks; i++) {
    host.tick();
    for (const p of host.drainOutgoing()) {
      const c = clients.get(p.to as number);
      if (!c) continue;
      if (p.reliable) events.push(...(c.onReliable(p.data)?.events ?? []));
      else {
        const s = c.onSnapshot(p.data);
        if (s) events.push(...s.cosmetic);
      }
    }
  }
}

describe('Tf2MatchHost (synthetic room)', () => {
  it('joins like TF2: unassigned → team → class → spawn, seen through the snapshot stream', () => {
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 8 }), { world: roomWorld() });
    const client = new SnapshotClient();
    const clients = new Map([[1, client]]);
    host.addPlayer(1, { name: 'Pyro\u0007Main' });
    pump(host, clients, 4);
    expect(client.hello?.map).toBe('ctf_2fort');
    expect(client.hello?.snapshotInterval).toBe(2);
    expect(client.localEntity).toBe(host.playerOf(1)!.id);
    expect(client.roster.get(client.localEntity)?.name).toBe('PyroMain');
    expect(client.localPlayer()!.team).toBe(TEAM_UNASSIGNED);
    expect(host.unassignedCount).toBe(1);

    host.onCommand(1, { kind: 'team', team: 'blue' });
    host.onCommand(1, { kind: 'class', cls: 'soldier' });
    pump(host, clients, 900);
    const me = client.localPlayer()!;
    expect(me.team).toBe(TF_TEAM_BLUE);
    expect(me.cls).toBe(TF_CLASS_SOLDIER);
    expect(me.lifeState).toBe(LIFE_ALIVE);
    // The owner sees its private block and its weapons.
    expect(typeof me.mv_maxSpeed).toBe('number');
    expect(client.localWeapons().length).toBeGreaterThan(0);
    expect(client.rules()).not.toBeNull();
  });

  it('fills with bots and gives their seats to humans (tf_bot_quota_mode fill)', () => {
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 6, botCount: 6 }), {
      world: roomWorld(),
    });
    expect(host.summary().players.filter((p) => p.bot).length).toBe(6);
    host.addPlayer(10, { name: 'a' });
    host.addPlayer(11, { name: 'b' });
    let s = host.summary();
    expect(s.players.length).toBe(6);
    expect(s.players.filter((p) => p.bot).length).toBe(4);
    const red = s.players.filter((p) => p.bot && p.team === TF_TEAM_RED).length;
    const blue = s.players.filter((p) => p.bot && p.team === TF_TEAM_BLUE).length;
    expect(Math.abs(red - blue)).toBeLessThanOrEqual(1);
    expect(s.players.find((p) => !p.bot && p.name === 'a')!.id).toBe(10);
    for (const p of s.players) if (p.bot) expect(p.id).toBeLessThan(0);
    host.removePlayer(10);
    s = host.summary();
    expect(s.players.filter((p) => p.bot).length).toBe(5);
    host.removePlayer(11);
    expect(host.isEmpty()).toBe(true);
    expect(host.summary().players.length).toBe(6);
  });

  it('routes voice commands, scores and extra commands; tolerates garbage input', () => {
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 8, botCount: 2 }), {
      world: roomWorld(),
      autoTeam: true,
      autoClass: true,
    });
    const a = new SnapshotClient();
    const b = new SnapshotClient();
    const clients = new Map([
      [1, a],
      [2, b],
    ]);
    host.addPlayer(1, { name: 'a' });
    host.addPlayer(2, { name: 'b' });
    const events: TimedEvent[] = [];
    pump(host, clients, 700, events);
    expect(host.playerOf(1)!.alive).toBe(true);
    host.onCommand(1, { kind: 'voice', menu: 0, item: 0 });
    host.onCommand(1, { kind: 'voice', menu: 0, item: 0 }); // cooldown
    host.onCommand(1, { kind: 'voice', menu: 2, item: 9 }); // no such line
    let seen: string[] = [];
    registerExtraCommand('test_ping', ({ player }, args) => {
      seen = [player.name, ...args.map(String)];
    });
    host.onCommand(2, { kind: 'extra', command: 'test_ping', args: [2, 'x', true] });
    host.onCommand(2, { kind: 'extra', command: 'nobody_handles_this', args: [] });
    host.onInput(1, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    host.onInput(99, new Uint8Array([1]));
    events.length = 0;
    pump(host, clients, 70, events);
    const voice = events.filter((e) => e.event.type === 'voice');
    expect(voice.length).toBe(2); // one line, heard by both clients
    expect((voice[0].event as { line: string }).line).toBe('Medic!');
    expect(seen).toEqual(['b', '2', 'x', 'true']);
    expect(a.scores.size).toBe(4);
    expect(a.roster.size).toBe(4);
  });

  it('honours Entity.shouldTransmitTo per client (blueprints only to their builder)', () => {
    class Secret extends Entity {
      everyone = false;
      override shouldTransmitTo(playerId: number): boolean {
        return this.everyone || playerId === this.owner;
      }
    }
    registerEntityClass('test_secret', Secret);
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 4 }), { world: roomWorld() });
    const a = new SnapshotClient();
    const b = new SnapshotClient();
    const clients = new Map([
      [1, a],
      [2, b],
    ]);
    host.addPlayer(1, { name: 'a' });
    host.addPlayer(2, { name: 'b' });
    const secret = host.world.spawnEntity('test_secret', (e) => {
      e.model = 'models/buildables/sentry1_blueprint.mdl';
      e.owner = host.playerOf(1)!.id;
    }) as Secret;
    pump(host, clients, 6);
    expect(a.entity(secret.id)).not.toBeNull();
    expect(b.entity(secret.id)).toBeNull();
    secret.everyone = true;
    pump(host, clients, 6);
    expect(b.entity(secret.id)).not.toBeNull();
    secret.everyone = false;
    pump(host, clients, 6);
    expect(b.entity(secret.id)).toBeNull();
    expect(a.entity(secret.id)).not.toBeNull();
  });

  it('createTf2MatchHost loads through the injected loader and rejects unknown maps', async () => {
    await expect(
      createTf2MatchHost(matchOptions(), {
        loadMap: async () => {
          throw new Error('nope');
        },
      }),
    ).rejects.toThrow('nope');
    const empty: GameObjectLoader = { get: async () => null };
    await expect(loadMapPackage(empty, 'ctf_2fort')).rejects.toThrow(/index/);
  });
});

describe.skipIf(!ROOT)('Tf2MatchHost on ctf_2fort (TF2_ROOT)', () => {
  it('loads a map package (index → manifest → BSP + hulls.bin) into a LoadedMap with prop collision', async () => {
    const bsp = new Uint8Array(readFileSync(path.join(ROOT, 'tf', 'maps', 'ctf_2fort.bsp')));
    const fort = load2fort();
    const models = [...new Set(fort.staticProps.filter((p) => p.solid !== 0).map((p) => p.model))];
    expect(models.length).toBeGreaterThan(0);
    const cube = new Float32Array([
      -8, -8, 0, 8, -8, 0, 8, 8, 0, -8, 8, 0, -8, -8, 32, 8, -8, 32, 8, 8, 32, -8, 8, 32,
    ]);
    const sha = (c: string) => c.repeat(64);
    const files = new Map<string, Uint8Array>([
      [
        'maps/index.json',
        new TextEncoder().encode(
          JSON.stringify({
            v: 1,
            maps: {
              ctf_2fort: {
                manifest: `maps/${sha('a')}.json`,
                title: '2Fort',
                mode: 'ctf',
                bytes: bsp.length,
              },
            },
          }),
        ),
      ],
      [
        `maps/${sha('a')}.json`,
        new TextEncoder().encode(
          JSON.stringify({
            v: 1,
            game: 'tf2',
            map: 'ctf_2fort',
            bsp: `maps/${sha('b')}.bsp`,
            bspBytes: bsp.length,
            lighting: 'ldr',
            materials: {},
            textures: {},
            sky: null,
            props: { [models[0]]: { hull: 0, solid: 6 } },
            hulls: `maps/${sha('c')}.hulls.bin`,
            nav: null,
          }),
        ),
      ],
      [`maps/${sha('b')}.bsp`, bsp],
      [`maps/${sha('c')}.hulls.bin`, writeHullsBin([[cube]])],
    ]);
    const loaded = await loadMapPackage({ get: async (p) => files.get(p) ?? null }, 'ctf_2fort');
    expect(loaded.name).toBe('ctf_2fort');
    expect(loaded.staticPropsWithCollision).toBe(
      fort.staticProps.filter((p) => p.model === models[0] && p.solid !== 0).length,
    );
    await expect(
      loadMapPackage({ get: async (p) => files.get(p) ?? null }, 'cp_nowhere'),
    ).rejects.toThrow(/not published/);
  });

  it('24 players moving on 2fort: every snapshot within the cap, PVS-culled, under 40 KB/s', () => {
    const host = new Tf2MatchHost(matchOptions({ maxPlayers: 24, botCount: 22 }), {
      map: load2fort(),
      botBrain: (_d, p) => new WanderBrain(p.id * 7),
      autoTeam: true,
      autoClass: true,
    });
    const clients = new Map([
      [1, new SnapshotClient()],
      [2, new SnapshotClient()],
    ]);
    host.addPlayer(1, { name: 'one' });
    host.addPlayer(2, { name: 'two' });
    const inputs = new Map([
      [1, new InputSender()],
      [2, new InputSender()],
    ]);
    const seconds = 20;
    let decodeFailures = 0;
    for (let i = 0; i < seconds * 66.67; i++) {
      for (const [id, inp] of inputs) {
        const c = clients.get(id)!;
        inp.createCommand(host.world.tickCount, (cmd) => {
          cmd.viewAngles.y = (i * 0.5 + id * 90) % 360;
          cmd.forwardMove = 450;
          cmd.buttons = IN_FORWARD;
        });
        host.onInput(id, inp.packet(c.ackTick, 4)!);
      }
      host.tick();
      for (const p of host.drainOutgoing()) {
        const c = clients.get(p.to as number)!;
        if (p.reliable) c.onReliable(p.data);
        else if (!c.onSnapshot(p.data)) decodeFailures++;
      }
    }
    expect(host.summary().players.length).toBe(24);
    expect(decodeFailures).toBe(0);
    for (const id of [1, 2]) {
      const st = host.stats.get(id)!;
      expect(st.maxSnapshotBytes).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES);
      const kbps = (st.snapshotBytes + st.reliableBytes) / seconds / 1024;
      expect(kbps).toBeLessThan(40);
      // Every player is visible to the client (players are always sent).
      let players = 0;
      clients.get(id)!.forEachEntity((s) => {
        if (s.schema.type === 'player') players++;
      });
      expect(players).toBe(24);
    }
  });

  it('runs 60 s in the MatchRunner with 12 standing bots and 2 scripted clients', async () => {
    let clock = 0;
    const posted: FromWorker[] = [];
    const clients = new Map([
      [1, new SnapshotClient()],
      [2, new SnapshotClient()],
    ]);
    const bytes = new Map([
      [1, 0],
      [2, 0],
    ]);
    const runner = new MatchRunner({
      factory: (opts) =>
        createTf2MatchHost(opts, { map: load2fort(), autoTeam: true, autoClass: true }),
      post: (m) => {
        if (m.t !== 'frames') {
          posted.push(m);
          return;
        }
        for (const f of m.frames) {
          for (const p of f.packets) {
            const c = clients.get(p.to as number);
            if (!c) continue;
            const data = new Uint8Array(p.data);
            bytes.set(p.to as number, bytes.get(p.to as number)! + data.byteLength);
            if (p.reliable) c.onReliable(data);
            else c.onSnapshot(data);
          }
        }
      },
      now: () => clock,
      autoRun: false,
    });
    runner.handle({
      t: 'create',
      matchId: 'R1',
      opts: matchOptions({ matchId: 'R1', maxPlayers: 16, botCount: 12 }),
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(posted.some((m) => m.t === 'created')).toBe(true);
    runner.handle({ t: 'add', matchId: 'R1', playerId: 1, info: { name: 'scripted-1' } });
    runner.handle({ t: 'add', matchId: 'R1', playerId: 2, info: { name: 'scripted-2' } });
    const inputs = new Map([
      [1, new InputSender()],
      [2, new InputSender()],
    ]);
    const seconds = 60;
    const ticks = Math.round((seconds * 1000) / TICK_MS);
    for (let i = 0; i < ticks; i++) {
      for (const [id, inp] of inputs) {
        const c = clients.get(id)!;
        inp.createCommand(c.ackTick, (cmd) => {
          cmd.viewAngles.y = (i * 0.4 + id * 180) % 360;
          cmd.forwardMove = i % 400 < 300 ? 450 : 0;
          cmd.buttons = cmd.forwardMove ? IN_FORWARD : 0;
        });
        const packet = inp.packet(c.ackTick, 4)!;
        runner.handle({
          t: 'input',
          matchId: 'R1',
          playerId: id,
          data: packet.slice().buffer as ArrayBuffer,
        });
      }
      if (i % 600 === 0)
        runner.handle({
          t: 'command',
          matchId: 'R1',
          playerId: 1,
          cmd: { kind: 'voice', menu: 0, item: 1 },
        });
      clock += TICK_MS;
      runner.pump();
    }
    expect(posted.filter((m) => m.t === 'closed')).toEqual([]);
    expect(runner.stats.ticks).toBeGreaterThanOrEqual(ticks - 1);
    const summaries = posted.filter((m) => m.t === 'summaries');
    const last = summaries[summaries.length - 1] as Extract<FromWorker, { t: 'summaries' }>;
    expect(last.items[0].summary.players.length).toBe(14);
    for (const id of [1, 2]) {
      const c = clients.get(id)!;
      expect(c.stats.snapshots).toBeGreaterThan(seconds * 30);
      expect(
        c.stats.errors.malformed + c.stats.errors['no-baseline'] + c.stats.errors.reliable,
      ).toBe(0);
      expect(bytes.get(id)! / seconds / 1024).toBeLessThan(40);
      expect(c.localPlayer()?.lifeState).toBe(LIFE_ALIVE);
    }
    runner.shutdown();
  });
});
