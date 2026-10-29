/**
 * `EchoMatchHost` — a `MatchHost` with no game in it.
 *
 * It exists so the transport (hub room manager → pool → match worker → back)
 * can be built and tested before the simulation. It:
 *
 *   - echoes every input packet back to its sender as a reliable packet,
 *     prefixed with `ECHO_TAG_INPUT`;
 *   - sends every human an unreliable 8-byte "snapshot" each tick:
 *     `u8 ECHO_TAG_SNAPSHOT, u8 humans, u16 0, u32 tick` (little-endian);
 *   - applies team and class commands to its summary, so chat routing and the
 *     server browser have something real to read.
 *
 * `createTf2Match` (`./create-match.ts`) returns one of these until the
 * simulation lands.
 */

import {
  CLASS_NAMES,
  TEAM_SPECTATOR,
  TEAM_UNASSIGNED,
  TF_CLASS_UNDEFINED,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../core/constants';
import type {
  MatchCommand,
  MatchHost,
  MatchOptions,
  OutgoingPacket,
  PlayerInfo,
  PlayerSummary,
  RoomSummary,
} from './match-host';

export const ECHO_TAG_INPUT = 0xec;
export const ECHO_TAG_SNAPSHOT = 0x5e;
export const ECHO_SNAPSHOT_BYTES = 8;

interface EchoPlayer {
  name: string;
  team: number;
  cls: number;
}

export class EchoMatchHost implements MatchHost {
  private readonly players = new Map<number, EchoPlayer>();
  private outgoing: OutgoingPacket[] = [];
  private ticks = 0;
  private disposed = false;
  /** Every command received, for tests. */
  readonly commands: Array<{ id: number; cmd: MatchCommand }> = [];

  constructor(readonly options: MatchOptions) {}

  addPlayer(id: number, info: PlayerInfo): void {
    this.players.set(id, { name: info.name, team: TEAM_UNASSIGNED, cls: TF_CLASS_UNDEFINED });
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  onInput(id: number, packet: Uint8Array): void {
    if (!this.players.has(id)) return;
    const data = new Uint8Array(packet.byteLength + 1);
    data[0] = ECHO_TAG_INPUT;
    data.set(packet, 1);
    this.outgoing.push({ to: id, reliable: true, data });
  }

  onCommand(id: number, cmd: MatchCommand): void {
    const player = this.players.get(id);
    if (!player) return;
    this.commands.push({ id, cmd });
    if (cmd.kind === 'team') {
      player.team =
        cmd.team === 'red'
          ? TF_TEAM_RED
          : cmd.team === 'blue'
            ? TF_TEAM_BLUE
            : cmd.team === 'spectator'
              ? TEAM_SPECTATOR
              : this.smallerTeam();
    } else if (cmd.kind === 'class') {
      const index = (CLASS_NAMES as readonly string[]).indexOf(cmd.cls);
      player.cls = index > 0 ? index : 1 + (this.ticks % 9);
    }
  }

  tick(): void {
    if (this.disposed) return;
    this.ticks += 1;
    if (this.players.size === 0) return;
    const data = new Uint8Array(ECHO_SNAPSHOT_BYTES);
    const view = new DataView(data.buffer);
    view.setUint8(0, ECHO_TAG_SNAPSHOT);
    view.setUint8(1, this.players.size);
    view.setUint32(4, this.ticks >>> 0, true);
    this.outgoing.push({ to: 'all', reliable: false, data });
  }

  drainOutgoing(): OutgoingPacket[] {
    const out = this.outgoing;
    this.outgoing = [];
    return out;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  summary(): RoomSummary {
    const players: PlayerSummary[] = [...this.players].map(([id, p]) => ({
      id,
      name: p.name,
      team: p.team,
      cls: p.cls,
      score: 0,
      bot: false,
    }));
    return {
      map: this.options.map,
      mode: this.options.mode,
      tick: this.ticks,
      players,
      teamScores: [0, 0],
    };
  }

  dispose(): void {
    this.disposed = true;
    this.players.clear();
    this.outgoing = [];
  }

  private smallerTeam(): number {
    let red = 0;
    let blue = 0;
    for (const p of this.players.values()) {
      if (p.team === TF_TEAM_RED) red += 1;
      else if (p.team === TF_TEAM_BLUE) blue += 1;
    }
    return red <= blue ? TF_TEAM_RED : TF_TEAM_BLUE;
  }
}

export const createEchoMatch = async (opts: MatchOptions): Promise<MatchHost> => new EchoMatchHost(opts);
