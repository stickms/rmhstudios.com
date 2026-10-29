/**
 * TEST SUPPORT ONLY: synthetic worlds, a simulated network link, and a
 * scripted client (input sender + snapshot client + prediction) for the net
 * and match-host tests. Not imported by any runtime module.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IN_FORWARD, IN_JUMP, IN_MOVERIGHT, TICK_INTERVAL } from '../core/constants';
import { UniformRandomStream } from '../core/random';
import { emptyUserCmd, type UserCmd } from '../core/types';
import { BspEntity } from '../formats/keyvalues';
import { BoxWorld, boxBrush, roomBrushes } from '../sim/__fixtures__/box-world';
import { loadMap, type LoadedMap } from '../sim/map-loader';
import type { Player } from '../sim/player';
import { GameWorld } from '../sim/world';
import type { MatchOptions } from './match-host';
import type { BotBrain } from './tf2-match-host';

export const ROOT = process.env.TF2_ROOT ?? '';

const kv = (pairs: Record<string, string>): BspEntity => new BspEntity(Object.entries(pairs));

/** The room's static geometry: a 2048-wide box with a few crates and a step to collide with. */
export function roomCollision(): BoxWorld {
  return new BoxWorld([
    ...roomBrushes(1024, 512),
    boxBrush({ x: -200, y: -300, z: 0 }, { x: -100, y: -200, z: 64 }),
    boxBrush({ x: 150, y: 100, z: 0 }, { x: 300, y: 260, z: 16 }),
    boxBrush({ x: 300, y: -500, z: 0 }, { x: 420, y: -380, z: 120 }),
  ]);
}

/** A room with spawn points for both teams (no map entities beyond them). */
export function roomWorld(seed = 7): GameWorld {
  const entities = [kv({ classname: 'worldspawn' })];
  for (let i = 0; i < 12; i++) {
    entities.push(
      kv({
        classname: 'info_player_teamspawn',
        origin: `-700 ${-550 + i * 100} 8`,
        TeamNum: '2',
        angles: '0 0 0',
      }),
    );
    entities.push(
      kv({
        classname: 'info_player_teamspawn',
        origin: `700 ${-550 + i * 100} 8`,
        TeamNum: '3',
        angles: '0 180 0',
      }),
    );
  }
  return new GameWorld({
    collision: roomCollision(),
    entities,
    options: { seed, lagCompensation: true },
  });
}

/** A predicting client's world for the room: same collision, no entities. */
export function roomClientWorld(): GameWorld {
  return new GameWorld({
    collision: roomCollision(),
    entities: [kv({ classname: 'worldspawn' })],
    options: { isServer: false, lagCompensation: false },
  });
}

export function matchOptions(over: Partial<MatchOptions> = {}): MatchOptions {
  return {
    matchId: 'TEST01',
    map: 'ctf_2fort',
    mode: 'ctf',
    maxPlayers: 24,
    botCount: 0,
    botDifficulty: 'normal',
    name: 'test',
    seed: 99,
    ...over,
  };
}

let fort: LoadedMap | null = null;
/** ctf_2fort from TF2_ROOT (cached per test file). */
export function load2fort(): LoadedMap {
  if (!fort) {
    const bytes = readFileSync(path.join(ROOT, 'tf', 'maps', 'ctf_2fort.bsp'));
    fort = loadMap(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      name: 'ctf_2fort',
    });
  }
  return fort;
}

/** A bot that wanders: a new heading every second or so, strafes, sometimes jumps. */
export class WanderBrain implements BotBrain {
  private cmd = emptyUserCmd();
  private readonly rng: UniformRandomStream;
  constructor(seed: number) {
    this.rng = new UniformRandomStream(seed);
  }
  think(world: GameWorld, player: Player): UserCmd {
    if (world.tickCount % 66 === player.id % 66 || this.cmd.buttons === 0) {
      this.cmd = emptyUserCmd();
      this.cmd.viewAngles = {
        x: this.rng.randomFloat(-20, 20),
        y: this.rng.randomFloat(0, 360),
        z: 0,
      };
      this.cmd.forwardMove = 450;
      this.cmd.sideMove = this.rng.randomInt(0, 2) === 0 ? 450 : 0;
      this.cmd.buttons = IN_FORWARD | (this.cmd.sideMove ? IN_MOVERIGHT : 0);
    }
    const out: UserCmd = { ...this.cmd, viewAngles: { ...this.cmd.viewAngles } };
    out.viewAngles.y += (world.tickCount % 200) * 0.3;
    if (this.rng.randomInt(0, 80) === 0) out.buttons |= IN_JUMP;
    return out;
  }
}

/**
 * A one-way link with latency, jitter, loss and in-order delivery (a
 * WebSocket: volatile packets may be dropped, nothing is reordered).
 */
export class Link<T> {
  private readonly queue: Array<{ at: number; item: T }> = [];
  private lastAt = 0;
  private readonly rng: UniformRandomStream;
  sent = 0;
  dropped = 0;

  constructor(
    readonly latencyMs: number,
    readonly jitterMs: number,
    readonly loss: number,
    seed: number,
  ) {
    this.rng = new UniformRandomStream(seed);
  }

  send(now: number, item: T, droppable: boolean): void {
    this.sent++;
    if (droppable && this.rng.randomFloat() < this.loss) {
      this.dropped++;
      return;
    }
    const at = Math.max(
      this.lastAt,
      now + this.latencyMs + this.rng.randomFloat(-this.jitterMs, this.jitterMs),
    );
    this.lastAt = at;
    this.queue.push({ at, item });
  }

  /** Everything due by `now`, in order. */
  receive(now: number): T[] {
    const out: T[] = [];
    while (this.queue.length > 0 && this.queue[0].at <= now) out.push(this.queue.shift()!.item);
    return out;
  }
}

export const TICK_MS = TICK_INTERVAL * 1000;
